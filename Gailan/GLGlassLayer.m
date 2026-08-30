//
//  GLGlassLayer.m
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

#import "GLGlassLayer.h"
#import "GLPreferencesController.h"

@implementation GLGlassLayer {
    // one effect view per region id, so a widget that moves reuses its view
    NSMutableDictionary<NSString*, NSView*>* views;
    NSString* materialName;
    NSString* styleName;
    double glassOpacity;
    NSColor* tintColor;
    // the regions last reported, so a rebuild need not wait for the page
    NSArray<NSDictionary*>* lastRegions;
    // what the standing views were built from, so an unchanged outcome costs nothing
    NSString* builtStyle;
    NSColor* builtTint;
}

/* The Icon & widget style, which Follow follows, and the accent, which Tinted uses. */
static NSArray* watchedSystemKeys(void)
{
    return @[@"AppleIconAppearanceTheme", @"AppleAccentColor"];
}

- (id)initWithFrame:(NSRect)frame
{
    self = [super initWithFrame:frame];
    if (self) {
        views = [[NSMutableDictionary alloc] init];
        materialName = @"off";
        lastRegions = @[];

        /* Written from another process, with no notification published for them. */
        for (NSString* key in watchedSystemKeys()) {
            [[NSUserDefaults standardUserDefaults]
                addObserver: self
                 forKeyPath: key
                    options: 0
                    context: NULL
            ];
        }
    }
    return self;
}

- (void)dealloc
{
    for (NSString* key in watchedSystemKeys()) {
        [[NSUserDefaults standardUserDefaults]
            removeObserver: self
                forKeyPath: key
        ];
    }
}

- (void)observeValueForKeyPath:(NSString*)keyPath
                      ofObject:(id)object
                        change:(NSDictionary*)change
                       context:(void*)context
{
    [self systemAppearanceChanged];
}

/* Both keys change more often than the glass needs rebuilding: a light to dark switch
   changes the name without changing the style. Rebuilds only when the outcome differs. */
- (void)systemAppearanceChanged
{
    NSString* style = [self resolvedStyle];
    NSColor* tint = [self effectiveTintForStyle:style];

    BOOL sameStyle = [style isEqualToString:builtStyle];
    BOOL sameTint = (tint == builtTint) || [tint isEqual:builtTint];
    if (sameStyle && sameTint) return;

    [self rebuild];
}

- (void)setMaterialName:(NSString*)name
                  style:(NSString*)style
                   tint:(NSColor*)tint
                opacity:(double)opacity
{
    BOOL sameTint = (tint == tintColor) || [tint isEqual:tintColor];
    BOOL sameStyle = (style == styleName) || [style isEqualToString:styleName];
    if ([name isEqualToString:materialName] && sameStyle && sameTint
        && opacity == glassOpacity) {
        return;
    }

    materialName = [name copy];
    styleName = [style copy];
    glassOpacity = opacity;
    tintColor = tint;
    [self rebuild];
}

- (BOOL)isEnabled
{
    return ![materialName isEqualToString:@"off"];
}

- (NSVisualEffectMaterial)material
{
    if ([materialName isEqualToString:@"subtle"]) {
        return NSVisualEffectMaterialUnderWindowBackground;
    }
    if ([materialName isEqualToString:@"heavy"]) {
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

/* What "follow" comes to. AppleIconAppearanceTheme holds names like RegularLight and
   ClearDark, so the style is taken from what the name contains: the light and dark halves
   of each are the same glass. Anything unrecognised is regular. */
/* The material is baked into each view, so a change means building new ones. The regions
   last reported are kept so the glass can be put back without waiting for the page to
   report them again. */
- (void)rebuild
{
    for (NSView* view in views.allValues) {
        [view removeFromSuperview];
    }
    [views removeAllObjects];
    builtStyle = nil;
    builtTint = nil;

    if (lastRegions.count > 0) {
        [self setRegions:lastRegions];
    }
}

- (NSString*)resolvedStyle
{
    if (![styleName isEqualToString:@"follow"]) {
        return styleName.length > 0 ? styleName : @"regular";
    }

    NSString* system = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"AppleIconAppearanceTheme"
    ];
    if ([system rangeOfString:@"Clear"].location != NSNotFound) return @"clear";
    if ([system rangeOfString:@"Tinted"].location != NSNotFound) return @"tinted";
    return @"regular";
}

/* Tinted carries whichever colour was chosen, or the system accent if none was. */
- (NSColor*)effectiveTintForStyle:(NSString*)style
{
    if (![style isEqualToString:@"tinted"]) return tintColor;
    if (tintColor && tintColor.alphaComponent > 0.01) return tintColor;
    return [GLPreferencesController systemAccentColor];
}

- (NSView*)viewWithRadius:(CGFloat)radius
{
    NSString* style = [self resolvedStyle];
    /* stops short of invisible */
    double alpha = glassOpacity <= 0 ? 1.0 : MIN(MAX(glassOpacity, 0.1), 1.0);

    // macOS 26 has the real thing; older systems get the closest material
    if (@available(macOS 26.0, *)) {
        NSGlassEffectView* glass = [[NSGlassEffectView alloc] init];
        glass.cornerRadius = radius;
        glass.style = [style isEqualToString:@"clear"] ? NSGlassEffectViewStyleClear
                                                      : NSGlassEffectViewStyleRegular;
        glass.tintColor = [self effectiveTintForStyle:style];
        glass.alphaValue = alpha;
        return glass;
    }

    NSVisualEffectView* effect = [[NSVisualEffectView alloc] init];
    effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    effect.material = [self material];
    effect.state = NSVisualEffectStateActive;
    effect.maskImage = [self maskWithRadius:radius];
    effect.alphaValue = alpha;
    return effect;
}

- (void)setRegions:(NSArray<NSDictionary*>*)regions
{
    /* kept whether or not glass is on, so turning it on can draw straight away */
    if (regions != lastRegions) lastRegions = [regions copy];

    if (![self isEnabled]) return;

    builtStyle = [self resolvedStyle];
    builtTint = [self effectiveTintForStyle:builtStyle];

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
