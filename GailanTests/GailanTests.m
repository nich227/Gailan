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

- (void)testMainMenu
{
    NSMenu* mainMenu = deletgate.statusBarMenu;
    
    bool hasOpenWidgetsDir;
    bool hasShowDebugConsole;
    
    for(id item in mainMenu.itemArray) {
        if(((NSMenuItem*)item).action == @selector(openWidgetDir:))
            hasOpenWidgetsDir = YES;
        else if (((NSMenuItem*)item).action == @selector(showDebugConsole:))
            hasShowDebugConsole = YES;
    }
    
    XCTAssert(hasOpenWidgetsDir);
    XCTAssert(hasShowDebugConsole);
    
    XCTAssert([deletgate respondsToSelector:@selector(openWidgetDir:)]);
    XCTAssert([deletgate respondsToSelector:@selector(showDebugConsole:)]);
}

@end
