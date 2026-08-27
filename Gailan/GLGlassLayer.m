//
//  GLGlassLayer.m
//  Gailan
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

#import "GLGlassLayer.h"

@implementation GLGlassLayer {
    // one effect view per region id, so a widget that moves reuses its view
    NSMutableDictionary<NSString*, NSView*>* views;
    NSString* materialName;
}

- (id)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self) {
        views = [[NSMutableDictionary alloc] init];
        materialName = @"sidebar";
    }
    return self;
}

- (void)setMaterialName:(NSString*)name
{
    if ([name isEqualToString:materialName]) return;
    materialName = [name copy];
    // the material is baked into each view, so they have to be rebuilt
    for (NSView* view in views.allValues) {
        [view removeFromSuperview];
    }
    [views removeAllObjects];
}

- (NSVisualEffectMaterial)material
{
    if ([materialName isEqualToString:@"hud"]) {
        return NSVisualEffectMaterialHUDWindow;
    }
    if ([materialName isEqualToString:@"popover"]) {
        return NSVisualEffectMaterialPopover;
    }
    if ([materialName isEqualToString:@"window"]) {
        return NSVisualEffectMaterialUnderWindowBackground;
    }
    if ([materialName isEqualToString:@"menu"]) {
        return NSVisualEffectMaterialMenu;
    }
    return NSVisualEffectMaterialSidebar;
}

// A rounded rect the effect view can stretch: cap insets keep the corners
// crisp at any size, so one image serves a widget as it resizes.
- (NSImage*)maskWithRadius:(CGFloat)radius
{
    CGFloat side = MAX(radius * 2 + 1, 3);
    NSImage* mask = [NSImage
        imageWithSize: NSMakeSize(side, side)
        flipped: NO
        drawingHandler: ^BOOL(NSRect rect) {
            [[NSColor blackColor] set];
            [[NSBezierPath
                bezierPathWithRoundedRect: rect
                xRadius: radius
                yRadius: radius
            ] fill];
            return YES;
        }
    ];
    mask.capInsets = NSEdgeInsetsMake(radius, radius, radius, radius);
    mask.resizingMode = NSImageResizingModeStretch;
    return mask;
}

- (NSView*)viewWithRadius:(CGFloat)radius
{
    // macOS 26 has the real thing; older systems get the closest material
    if (@available(macOS 26.0, *)) {
        NSGlassEffectView* glass = [[NSGlassEffectView alloc] init];
        glass.cornerRadius = radius;
        return glass;
    }

    NSVisualEffectView* effect = [[NSVisualEffectView alloc] init];
    effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    effect.material = [self material];
    effect.state = NSVisualEffectStateActive;
    effect.maskImage = [self maskWithRadius:radius];
    return effect;
}

- (void)setRegions:(NSArray<NSDictionary*>*)regions
{
    NSMutableSet<NSString*>* stale = [NSMutableSet setWithArray:views.allKeys];
    CGFloat height = self.bounds.size.height;

    for (NSDictionary* region in regions) {
        NSString* rid = region[@"id"];
        if (![rid isKindOfClass:[NSString class]]) continue;

        CGFloat x = [region[@"x"] doubleValue];
        CGFloat y = [region[@"y"] doubleValue];
        CGFloat w = [region[@"w"] doubleValue];
        CGFloat h = [region[@"h"] doubleValue];
        CGFloat radius = [region[@"radius"] doubleValue];
        if (w < 1 || h < 1) continue;

        NSView* view = views[rid];
        if (!view) {
            view = [self viewWithRadius:radius];
            views[rid] = view;
            [self addSubview:view];
        }

        // css counts y downward from the top, AppKit upward from the bottom
        view.frame = NSMakeRect(x, height - (y + h), w, h);
        [stale removeObject:rid];
    }

    for (NSString* rid in stale) {
        [views[rid] removeFromSuperview];
        [views removeObjectForKey:rid];
    }
}

@end
