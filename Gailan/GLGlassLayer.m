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

@implementation GLGlassLayer {
    // one effect view per region id, so a widget that moves reuses its view
    NSMutableDictionary<NSString*, NSView*>* views;
    NSString* materialName;
    NSString* styleName;
    double glassOpacity;
    NSColor* tintColor;
    // the regions last reported, so anything that rebuilds can put the glass straight
    // back rather than waiting for a widget to move and the page to report again
    NSArray<NSDictionary*>* lastRegions;
    // and what the views standing right now were built from, so a change that comes to
    // the same thing costs nothing
    NSString* builtStyle;
    NSColor* builtTint;
}

/* The two settings that can change the glass out from under us: the Icon & widget style,
   which is what Follow follows, and the accent, which a tinted glass borrows. */
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

        /* System Settings writes these from its own process and AppKit announces
           nothing, so this is key-value observing on the defaults, which is the one
           hook that does fire for a write from somewhere else. */
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

/* Called for every write to either key, which is more often than the glass needs to be
   rebuilt: a light to dark switch changes the name without changing the style. So the
   answer is worked out and compared, and nothing happens unless it came out different. */
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

/* What "follow" comes to. macOS 26 keeps its Icon & widget style in
   AppleIconAppearanceTheme, as RegularLight, ClearDark, TintedDark and so on, so the
   name is read for what it says rather than matched exactly: the light and dark halves
   of each are the same glass. Anything unrecognised is regular, which is what the
   system means by default. */
/* The material is baked into each view, so a change means new ones. Throwing them away
   used to be the whole of it, which left the desktop bare until a widget moved and the
   page reported its regions again: turning glass on, or changing its style, appeared to
   do nothing until something else happened. The regions last reported are kept, so the
   glass comes back in the same breath. */
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

/* Tinted means carrying a colour, and the colour is whichever one was chosen. Nobody
   having chosen one, it is the accent macOS is set to, which is what the system does to
   a tinted icon. */
- (NSColor*)effectiveTintForStyle:(NSString*)style
{
    if (![style isEqualToString:@"tinted"]) return tintColor;
    if (tintColor && tintColor.alphaComponent > 0.01) return tintColor;
    return [NSColor controlAccentColor];
}

- (NSView*)viewWithRadius:(CGFloat)radius
{
    NSString* style = [self resolvedStyle];
    /* a glass nobody can see is a setting somebody will not understand, so it stops
       short of gone */
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
    /* kept whether or not glass is on, so turning it on shows something at once rather
       than waiting for a widget to move */
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
