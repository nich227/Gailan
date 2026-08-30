//
//  GLWindowsController.h
//  Gailan
//
//  Created by Felix Hageloh on 30/09/2020.
//  Copyright © 2020 tracesOf. All rights reserved.
//  Copyright (c) 2026 Kevin Chen.
//

#import <Cocoa/Cocoa.h>

// forward declared rather than imported: the project redeclares WKWebView in
// WKWebViewInternal.h to reach _pageForTesting
@class WKWebView;

NS_ASSUME_NONNULL_BEGIN

@interface GLWindowsController : NSObject

@property (nonatomic) BOOL alwaysOnTop;


- (void)updateWindows:(NSDictionary*)screens
              baseUrl:(NSURL*)baseUrl
   interactionEnabled:(Boolean)interactionEnabled
         forceRefresh:(Boolean)forceRefresh;

- (void)reloadAll;
@property (nonatomic, copy) NSString* glassMaterial;
@property (nonatomic, copy) NSString* glassStyle;
@property (nonatomic) double glassOpacity;
@property (nonatomic, strong) NSColor* glassTint;

- (void)applySystemAccent;

- (void)setGlassMaterial:(NSString*)name
                   style:(NSString*)style
                    tint:(NSColor*)tint
                 opacity:(double)opacity;
- (void)closeAll;
- (void)workspaceChanged;
- (void)wallpaperChanged;
// layer: 1 foreground, 2 background, 0 both
- (void)showDebugConsolesForScreen:(NSNumber*)screenId layer:(NSInteger)layer;
- (nullable WKWebView*)webViewInView:(NSView*)view;
- (void)keepInspectorDetached;

// the pointer is over a widget when a window has stopped ignoring the mouse
- (BOOL)pointerIsOverWidget;
- (NSScreen*)getNSScreen:(NSNumber*)screenId;

@end

NS_ASSUME_NONNULL_END
