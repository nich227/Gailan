//
//  GLWindow.m
//  Gailan
//
//  A window that sits on desktop level, is always fullscreen and doesn't show
//  up in Mission Control
//
//  Created by Felix Hageloh on 20/9/13.
//  Copyright (c) 2013 Felix Hageloh.
//  Copyright (c) 2026 Kevin Chen.
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

#import "GLWindow.h"
#import "GLGlassLayer.h"
#import "GLWebViewController.h"

@implementation GLWindow {
    GLWebViewController* webViewController;
    NSTrackingArea* trackingArea;
    GLWindowType type;
    GLGlassLayer* glassLayer;
}

- (id)initWithWindowType:(GLWindowType)windowType
{
    self = [super
        initWithContentRect: NSMakeRect(0, 0, 0, 0)
        styleMask: NSWindowStyleMaskBorderless
        backing: NSBackingStoreBuffered
        defer: NO
    ];
    
    if (self) {
        type = windowType;
        [self setBackgroundColor:[NSColor clearColor]];
        [self setOpaque:NO];
        [self setCollectionBehavior:(
            NSWindowCollectionBehaviorStationary |
            NSWindowCollectionBehaviorCanJoinAllSpaces |
            NSWindowCollectionBehaviorIgnoresCycle
        )];

        [self setRestorable:NO];
        [self disableSnapshotRestoration];
        [self setDisplaysWhenScreenProfileChanges:YES];
        [self setReleasedWhenClosed:NO];
        [self setWindowType:windowType];
        [self setIgnoresMouseEvents:YES];
        
        webViewController = [[GLWebViewController alloc]
            initWithFrame: [self frame]
        ];

        // the glass the compositor draws goes underneath the web view, so a
        // widget can sit on top of glassed wallpaper
        NSView* container = [[NSView alloc] initWithFrame:[self frame]];
        container.autoresizesSubviews = YES;
        glassLayer = [[GLGlassLayer alloc] initWithFrame:container.bounds];
        glassLayer.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        webViewController.view.frame = container.bounds;
        webViewController.view.autoresizingMask =
            NSViewWidthSizable | NSViewHeightSizable;
        [container addSubview:glassLayer];
        [container addSubview:webViewController.view];
        [self setContentView:container];
    }

    return self;
}

- (void)setGlassRegions:(NSArray*)regions
{
    [glassLayer setRegions:regions];
}

- (void)setGlassMaterial:(NSString*)name
                   clear:(BOOL)clear
                    tint:(NSColor*)tint
{
    [glassLayer setMaterialName:name clear:clear tint:tint];
}

- (void)loadUrl:(NSURL*)url
{
    [webViewController load:url];
}

- (void)reload
{
    [webViewController reload];
}

// TODO: check if we can do at least some cleanups in webViewController#destroy
//- (void)close
//{
//    [webViewController destroy];
//    [super close];
//}

#
#pragma mark tracking area
#


- (void)setupTrackingArea
{
    trackingArea = [[NSTrackingArea alloc]
        initWithRect: self.contentView.bounds
        options: NSTrackingMouseMoved
            | NSTrackingMouseEnteredAndExited
            | NSTrackingActiveAlways
        owner: nil
        userInfo: nil
    ];
    [self.contentView addTrackingArea:trackingArea];
}

- (void)setFrame:(NSRect)newFrame display:(BOOL)doDisplay
{
    [super setFrame:newFrame display:doDisplay];
    [self updateTrackingArea];
}

- (void)updateTrackingArea
{
    if (trackingArea != nil) {
        [self.contentView removeTrackingArea:trackingArea];
    }
    if (self.contentView) {
        [self setupTrackingArea];
    }
}

#
#pragma mark signals/events
#

- (void)workspaceChanged
{
    [webViewController redraw];
}

- (void)wallpaperChanged
{
    [webViewController redraw];
}

#
#pragma mark window type and interaction
#


- (void)setWindowType:(GLWindowType)newType
{
    switch (newType) {
        case GLWindowTypeForeground:
            [self updateTrackingArea];
            break;
        case GLWindowTypeBackground:
        case GLWindowTypeAgnostic:
            if (trackingArea != nil) {
                [self.contentView removeTrackingArea:trackingArea];
            }
            [self setIgnoresMouseEvents:YES];
            break;
        default:
            break;
    }
    type = newType;
    [self applyLevel];
}

// levels are mutable, so floating widgets is a setLevel call, not a window
// rebuild: rebuilding would tear down and reload every webview
- (void)setAlwaysOnTop:(BOOL)flag
{
    _alwaysOnTop = flag;
    [self applyLevel];
}

- (void)applyLevel
{
    if (type == GLWindowTypeForeground) {
        [self setLevel:
            _alwaysOnTop ? kCGFloatingWindowLevel : kCGNormalWindowLevel-1];
    } else {
        [self setLevel:
            _alwaysOnTop ? kCGFloatingWindowLevel-1 : kCGDesktopWindowLevel];
    }
}

- (GLWindowType)windowType
{
    return type;
}

#
#pragma mark flags
#

- (BOOL)isKeyWindow { return type == GLWindowTypeForeground; }
- (BOOL)canBecomeKeyWindow { return type == GLWindowTypeForeground; }
- (BOOL)canBecomeMainWindow { return type == GLWindowTypeForeground; }
- (BOOL)acceptsFirstResponder { return type == GLWindowTypeForeground; }
- (BOOL)acceptsMouseMovedEvents { return type == GLWindowTypeForeground;; }

@end
