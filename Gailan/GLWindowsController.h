//
//  GLWindowsController.h
//  Gailan
//
//  Created by Felix Hageloh on 30/09/2020.
//  Copyright © 2020 tracesOf. All rights reserved.
//  Copyright (c) 2026 Kevin Chen.
//

#import <Cocoa/Cocoa.h>

NS_ASSUME_NONNULL_BEGIN

@interface GLWindowsController : NSObject

@property (nonatomic) BOOL alwaysOnTop;


- (void)updateWindows:(NSDictionary*)screens
              baseUrl:(NSURL*)baseUrl
   interactionEnabled:(Boolean)interactionEnabled
         forceRefresh:(Boolean)forceRefresh;

- (void)reloadAll;
@property (nonatomic, copy) NSString* glassMaterial;
@property (nonatomic) BOOL glassClear;
@property (nonatomic, strong) NSColor* glassTint;

- (void)setGlassMaterial:(NSString*)name
                   clear:(BOOL)clear
                    tint:(NSColor*)tint;
- (void)closeAll;
- (void)workspaceChanged;
- (void)wallpaperChanged;
- (void)showDebugConsolesForScreen:(NSNumber*)screenId;
- (NSScreen*)getNSScreen:(NSNumber*)screenId;

@end

NS_ASSUME_NONNULL_END
