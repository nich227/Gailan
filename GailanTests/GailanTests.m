//
//  GailanTests.m
//  GailanTests
//
//  Created by Felix Hageloh on 20/9/13.
//  Copyright (c) 2013 Felix Hageloh. All rights reserved.
//  Copyright (c) 2026 Kevin Chen.
//

#import <XCTest/XCTest.h>
#import "GLAppDelegate.h"
#import "GLWindow.h"
#import "GLWindowsController.h"
#import <WebKit/WebKit.h>

@interface GailanTests : XCTestCase
@end

@implementation GailanTests {
    GLAppDelegate* deletgate;
}

- (void)setUp
{
    [super setUp];
    deletgate = (GLAppDelegate*)[[NSApplication sharedApplication] delegate];
}

- (void)tearDown
{
    [super tearDown];
}

//- (void)testWindowIsFullscreen
//{
//    XCTAssertNotNil(deletgate.window);
//    
//    // view should occupy the entire screen minus the menubar
//    NSRect windowFrame = [deletgate.windows frame];
//    NSRect screenFrame = [[NSScreen mainScreen] frame];
//    screenFrame.size.height -= [[NSApp mainMenu] menuBarHeight];
//    
//    XCTAssertEqual(windowFrame.size.width, screenFrame.size.width);
//    XCTAssertEqual(windowFrame.size.height, screenFrame.size.height);
//    XCTAssertEqual(windowFrame.origin.x, screenFrame.origin.x);
//    XCTAssertEqual(windowFrame.origin.y, screenFrame.origin.y);
//}

- (void)testServerTask
{
    NSTask* serverTask = [deletgate valueForKey:@"widgetServer"];
    XCTAssertNotNil(serverTask);
    XCTAssert([serverTask isRunning]);
}

- (void)testMenuItem
{
    NSStatusItem* statusBarItem = [deletgate valueForKey:@"statusBarItem"];
    XCTAssertNotNil(deletgate.statusBarMenu);
    XCTAssertNotNil(statusBarItem);
    XCTAssertEqual([statusBarItem menu], deletgate.statusBarMenu);
}

// Finds an action anywhere in the menu, submenus included, since the inspector
// lives in one now.
static BOOL menuHasAction(NSMenu* menu, SEL action)
{
    for (NSMenuItem* item in menu.itemArray) {
        if (item.action == action) return YES;
        if (item.submenu && menuHasAction(item.submenu, action)) return YES;
    }
    return NO;
}

- (void)testMainMenu
{
    NSMenu* mainMenu = deletgate.statusBarMenu;

    // these were declared uninitialized, so the test passed on whatever was on
    // the stack rather than on what the menu contained
    XCTAssertTrue(menuHasAction(mainMenu, @selector(openWidgetDir:)));
    XCTAssertTrue(menuHasAction(mainMenu, @selector(showDebugConsole:)));
    XCTAssertFalse(menuHasAction(mainMenu, @selector(testMainMenu)),
                   @"and a selector that is not in the menu is not found");

    XCTAssert([deletgate respondsToSelector:@selector(openWidgetDir:)]);
    XCTAssert([deletgate respondsToSelector:@selector(showDebugConsole:)]);
}

- (void)testTheInspectorOffersEachLayer
{
    NSMenuItem* inspector = nil;
    for (NSMenuItem* item in deletgate.statusBarMenu.itemArray) {
        if ([item.title isEqualToString:@"Web Inspector"]) inspector = item;
    }

    XCTAssertNotNil(inspector, @"the inspector has its own menu");
    XCTAssertNotNil(inspector.submenu);

    NSMutableDictionary* tagsByTitle = [NSMutableDictionary dictionary];
    for (NSMenuItem* item in inspector.submenu.itemArray) {
        if (!item.isSeparatorItem) tagsByTitle[item.title] = @(item.tag);
    }

    // the tags are what the action reads to know which layer was asked for
    XCTAssertEqualObjects(tagsByTitle[@"Foreground Widgets"], @1);
    XCTAssertEqualObjects(tagsByTitle[@"Background Widgets"], @2);
    XCTAssertEqualObjects(tagsByTitle[@"Both"], @0);
}

// The debug console has to find the web view. It used to be the window's
// content view, until the glass layer moved it under a container.
- (void)testFindingTheWebViewUnderAContainer
{
    GLWindowsController* controller = [[GLWindowsController alloc] init];

    NSView* container = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];
    NSView* decoration = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];
    NSView* nesting = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];
    WKWebView* webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 10, 10)];

    // the glass layer comes first, the web view is nested deeper
    [container addSubview:decoration];
    [nesting addSubview:webView];
    [container addSubview:nesting];

    XCTAssertEqual([controller webViewInView:container], webView);
    XCTAssertNil([controller webViewInView:decoration]);
    XCTAssertEqual([controller webViewInView:webView], webView, @"or itself");
}

// The inspector must never dock to the bottom of the screen, since that is
// where the widgets are. WebKit decides from this default.
- (void)testTheInspectorIsKeptInItsOwnWindow
{
    NSString* key =
        @"__WebInspectorPageGroupLevel1__.WebKit2InspectorStartsAttached";
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];

    // whatever it was left as, including docked from a previous session
    [defaults setBool:YES forKey:key];
    XCTAssertTrue([defaults boolForKey:key]);

    [[[GLWindowsController alloc] init] keepInspectorDetached];

    XCTAssertFalse(
        [defaults boolForKey:key],
        @"the inspector opens as a window, not attached to the web view"
    );
}

// The Widgets window is opened from the status menu, which a test cannot click,
// so the action is called directly.
- (void)testTheWidgetsWindowOpens
{
    NSUInteger before = [[NSApp windows] count];

    [deletgate showWidgetsOverview:nil];

    NSWindow* overview = nil;
    for (NSWindow* window in [NSApp windows]) {
        if ([[window title] isEqualToString:@"Widgets"]) overview = window;
    }

    XCTAssertNotNil(overview, @"a window titled Widgets is on screen");
    XCTAssertTrue([overview isVisible]);
    XCTAssertNotNil([overview contentView], @"with the SwiftUI view inside it");
    XCTAssertGreaterThan([[NSApp windows] count], before);

    // asking twice reuses the window rather than stacking them up
    [deletgate showWidgetsOverview:nil];
    NSUInteger titled = 0;
    for (NSWindow* window in [NSApp windows]) {
        if ([[window title] isEqualToString:@"Widgets"]) titled++;
    }
    XCTAssertEqual(titled, 1, @"and opening it again does not make a second");

    [overview close];
}

@end
