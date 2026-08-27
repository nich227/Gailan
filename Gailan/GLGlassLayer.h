//
//  GLGlassLayer.h
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

#import <Cocoa/Cocoa.h>

// Sits behind the web view and asks the compositor to glass the desktop in the
// regions widgets have claimed. Page content cannot reach what is behind the
// window, so this is the only way a widget can put real glass over the
// wallpaper: the system draws the material, the widget just says where.
@interface GLGlassLayer : NSView

// regions arrive from the page in css pixels, origin top left:
// @[@{@"id": ..., @"x": ..., @"y": ..., @"w": ..., @"h": ..., @"radius": ...}]
- (void)setRegions:(NSArray<NSDictionary*>*)regions;

// style and tint only reach macOS 26's glass; the older material takes neither
- (void)setMaterialName:(NSString*)name
                  clear:(BOOL)clear
                   tint:(NSColor*)tint;

@end
