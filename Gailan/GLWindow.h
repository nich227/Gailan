//
//  GLWindow.h
//  Gailan
//
//  Created by Felix Hageloh on 20/9/13.
//  Copyright (c) 2013 Felix Hageloh.
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import <Cocoa/Cocoa.h>


typedef NS_ENUM(NSInteger, GLWindowType) {
    GLWindowTypeAgnostic,
    GLWindowTypeBackground,
    GLWindowTypeForeground
};


@interface GLWindow : NSWindow

@property GLWindowType windowType;
@property (nonatomic) BOOL alwaysOnTop;

- (id)initWithWindowType:(GLWindowType)type;
- (void)loadUrl:(NSURL*)url;
- (void)reload;
- (void)workspaceChanged;
- (void)wallpaperChanged;
- (void)setGlassRegions:(NSArray*)regions;
- (void)setGlassMaterial:(NSString*)name
                   clear:(BOOL)clear
                    tint:(NSColor*)tint;

@end
