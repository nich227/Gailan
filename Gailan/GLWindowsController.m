//
//  GLWindowsController.m
//  Gailan
//
//  Created by Felix Hageloh on 30/09/2020.
//  Copyright © 2020 tracesOf. All rights reserved.
//  Copyright (c) 2026 Kevin Chen.
//

#import "GLWindowsController.h"
#import "GLWindowGroup.h"
#import "WKInspector.h"
#import "WKView.h"
#import "WKPage.h"
#import "WKWebViewInternal.h"

@import WebKit;

@implementation GLWindowsController {
    NSMutableDictionary* windows;
}

- (id)init
{
    self = [super init];
    if (self) {
        windows = [[NSMutableDictionary alloc] initWithCapacity:42];
    }
    return self;
}


- (void)updateWindows:(NSDictionary*)screens
              baseUrl:(NSURL*)baseUrl
   interactionEnabled:(Boolean)interactionEnabled
         forceRefresh:(Boolean)forceRefresh
{
    NSMutableArray* obsoleteScreens = [[windows allKeys] mutableCopy];
    GLWindowGroup* windowGroup;
    
    for(NSNumber* screenId in screens) {
        if (![windows objectForKey:screenId]) {
            windowGroup = [[GLWindowGroup alloc]
                initWithInteractionEnabled: interactionEnabled
            ];
            [windowGroup setAlwaysOnTop:self.alwaysOnTop];
            [windowGroup
                setGlassMaterial: self.glassMaterial
                           clear: self.glassClear
                            tint: self.glassTint
            ];
            [windows setObject:windowGroup forKey:screenId];
            [windowGroup loadUrl: [self screenUrl:screenId baseUrl:baseUrl]];
        } else {
            windowGroup = windows[screenId];
            if (forceRefresh) {
                [windowGroup reload];
            }
        }
        
        [windowGroup setFrame:[self screenRect:screenId] display:YES];
        [obsoleteScreens removeObject:screenId];
    }
    
    for (NSNumber* screenId in obsoleteScreens) {
        [windows[screenId] close];
        [windows removeObjectForKey:screenId];
    }
    
    NSLog(@"using %lu screens", (unsigned long)[windows count]);
}

- (NSRect)screenRect:(NSNumber*)screenId
{
    NSScreen* screen = [self getNSScreen:screenId];
    
    CGFloat auxiliaryHeight = screen.auxiliaryTopLeftArea.size.height;
    CGFloat windowHeight = screen.visibleFrame.size.height +
        (screen.visibleFrame.origin.y - screen.frame.origin.y);
    
    // If the remaining visible height is exactly the auxiliaryHeight, the menu
    // bar is hidden. There seems to be no other way to dedect this reliably
    if (screen.frame.size.height - windowHeight == auxiliaryHeight) {
        windowHeight = windowHeight + auxiliaryHeight;
    }

    return NSMakeRect(
        screen.frame.origin.x,
        screen.frame.origin.y,
        screen.frame.size.width,
        windowHeight
    );
}

- (NSScreen*)getNSScreen:(NSNumber*)screenId
{
    for (NSScreen* screen in [NSScreen screens]) {
        if ([screen deviceDescription][@"NSScreenNumber"] == screenId) {
            return screen;
        }
    };
    
    return nil;
}

- (void)reloadAll
{
    for (NSNumber* screenId in windows) {
        GLWindowGroup* window = windows[screenId];
        [window reload];
    }
}

- (void)setGlassMaterial:(NSString*)name
                   clear:(BOOL)clear
                    tint:(NSColor*)tint
{
    _glassMaterial = [name copy];
    _glassClear = clear;
    _glassTint = tint;
    for (GLWindowGroup* group in [windows allValues]) {
        [group setGlassMaterial:name clear:clear tint:tint];
    }
}

- (void)setAlwaysOnTop:(BOOL)flag
{
    _alwaysOnTop = flag;
    for (GLWindowGroup* group in [windows allValues]) {
        [group setAlwaysOnTop:flag];
    }
}

- (void)closeAll
{
    for (GLWindowGroup* window in [windows allValues]) {
        [window close];
    }
    [windows removeAllObjects];
}


- (void)showDebugConsolesForScreen:(NSNumber*)screenId
{
    NSWindow* window;
    window = [(GLWindowGroup*)windows[screenId] foreground];
    if (window) [self showDebugConsoleForWindow: window];
    
    window = [(GLWindowGroup*)windows[screenId] background];
    if (window) [self showDebugConsoleForWindow: window];
}

// The inspector remembers whether it was docked, and docked means it takes over
// the bottom of the screen the widgets are on. WebKit keeps that in this
// default, so it is put back to detached every time.
static NSString* const GLInspectorStartsAttachedKey =
    @"__WebInspectorPageGroupLevel1__.WebKit2InspectorStartsAttached";

// The web view is no longer the window's content view: the glass layer sits
// beside it under a container, so it has to be looked up.
- (WKWebView*)webViewInView:(NSView*)view
{
    if ([view isKindOfClass:[WKWebView class]]) {
        return (WKWebView*)view;
    }

    for (NSView* child in view.subviews) {
        WKWebView* found = [self webViewInView:child];
        if (found) return found;
    }

    return nil;
}

- (void)showDebugConsoleForWindow:(NSWindow*)window
{
    WKWebView* webView = [self webViewInView:window.contentView];
    SEL pageForTesting = @selector(_pageForTesting);
    if (![webView respondsToSelector:pageForTesting]) return;

    WKPageRef page = (__bridge WKPageRef)[webView
        performSelector: pageForTesting
    ];
    if (!page) return;

    WKInspectorRef inspector = WKPageGetInspector(page);

    [[NSUserDefaults standardUserDefaults]
        setBool: NO
         forKey: GLInspectorStartsAttachedKey
    ];

    [NSApp activateIgnoringOtherApps:YES];
    WKInspectorShowConsole(inspector);
    [self detachInspector:(__bridge id)(inspector)];

    // again once WebKit has finished opening it, since showing is what decides
    // the docked state
    [self
        performSelector: @selector(detachInspector:)
        withObject: (__bridge id)(inspector)
        afterDelay: 0
    ];
}

- (void)detachInspector:(id)inspectorRef
{
    WKInspectorRef inspector = (__bridge WKInspectorRef)inspectorRef;
    if (WKInspectorIsAttached(inspector)) {
        WKInspectorDetach(inspector);
    }
}

- (void)workspaceChanged
{
    for (NSNumber* screenId in windows) {
        [windows[screenId] workspaceChanged];
    }
}

- (void)wallpaperChanged
{
    for (NSNumber* screenId in windows) {
        [windows[screenId] wallpaperChanged];
    }
}

- (NSURL*)screenUrl:(NSNumber*)screenId baseUrl:(NSURL*)baseUrl
{
    return [baseUrl
        URLByAppendingPathComponent:[NSString
            stringWithFormat:@"%@",
            screenId
        ]
    ];
}

@end
