//
//  GLWindowGroup.h
//  Gailan
//
//  Created by Felix Hageloh on 05/10/2020.
//  Copyright © 2020 tracesOf. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "GLWindow.h"

NS_ASSUME_NONNULL_BEGIN

@interface GLWindowGroup : NSObject

@property (readonly, strong) GLWindow* foreground;
@property (readonly, strong) GLWindow* background;

- (id)initWithInteractionEnabled:(BOOL)interactionEnabled;
- (void)loadUrl:(NSURL*)Url;
- (void)reload;
- (void)close;
- (void)setFrame:(NSRect)frame display:(BOOL)flag;
- (void)workspaceChanged;
- (void)wallpaperChanged;
- (void)setAlwaysOnTop:(BOOL)flag;
- (void)setGlassMaterial:(NSString*)name;

@end

NS_ASSUME_NONNULL_END
