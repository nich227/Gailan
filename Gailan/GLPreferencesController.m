//
//  GLPreferencesController.m
//  Gailan
//
//  Created by Felix Hageloh on 20/3/14.
//  Copyright (c) 2014 Felix Hageloh.
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import "GLPreferencesController.h"
#import <AVFoundation/AVFoundation.h>
#import "Gailan-Swift.h"

@import ServiceManagement;

@implementation GLPreferencesController

@synthesize filePicker;

- (id)initWithWindowNibName:(NSString *)windowNibName
{
    self = [super initWithWindowNibName:windowNibName];
    if (self) {
        
        NSData* defaultWidgetDir = [self ensureDefaultsWidgetDir];
        NSDictionary *appDefaults = @{
            @"widgetDirectory": defaultWidgetDir,
            @"enableInteraction": @YES,
            @"shell": @"zsh",
            @"appearance": @"system",
            @"alwaysOnTop": @NO,
            @"checkWidgetUpdates": @YES,

            // which system material macOS draws behind a widget that asks
            // for it. on by default; "off" opts out.
            @"desktopGlass": @"frosted",
            @"desktopGlassStyle": @"follow",
            @"desktopGlassOpacity": @1.0,

            /* Where a tint comes from. "follow" takes it from the wallpaper when macOS
               is tinting window backgrounds and leaves the glass untinted when it is
               not; "off" never tints; "custom" uses desktopGlassTint.

               A tint already chosen means somebody picked a color before there was a
               mode to hold, so that choice stands rather than being replaced by the
               system's. */
            @"desktopGlassTintMode": [self storedTintIsAColor] ? @"custom" : @"follow"
        };
        [[NSUserDefaults standardUserDefaults] registerDefaults:appDefaults];

    }
    
    return self;
}

- (void)windowDidLoad
{
    [super windowDidLoad];
    
    [[self.window standardWindowButton:NSWindowMiniaturizeButton] setEnabled:NO];
    [[self.window standardWindowButton:NSWindowZoomButton] setEnabled:NO];
    
    [self widgetDirChanged:self.widgetDir];

    // the window is one SwiftUI view: the split view brings its own sidebar
    // material, so the titlebar only has to get out of its way
    self.window.titlebarAppearsTransparent = YES;
    self.window.styleMask |= NSWindowStyleMaskFullSizeContentView;
    self.window.contentView = [GLPreferencesHosting viewFor:self];
}

#
#pragma mark Widget Directory
#

- (IBAction)showFilePicker:(id)sender
{
    [self chooseWidgetDir:nil];
}

- (void)chooseWidgetDir:(void (^)(NSURL* url))completion
{
    NSOpenPanel* openPanel = [NSOpenPanel openPanel];

    [openPanel setCanChooseFiles:NO];
    [openPanel setCanChooseDirectories:YES];

    [openPanel beginSheetModalForWindow:self.window completionHandler:^(NSInteger result) {
        if (result == NSModalResponseOK) {
            NSURL* chosen = [openPanel URLs][0];
            [self setWidgetDir:chosen];
            if (completion) completion(chosen);
        }
    }];
}

- (NSURL*)widgetDir
{
    NSData* widgetDir = [[NSUserDefaults standardUserDefaults]
                         objectForKey:@"widgetDirectory"];
    
    return [NSKeyedUnarchiver unarchivedObjectOfClass:[NSURL class]
                                              fromData:widgetDir
                                                 error:nil];
}

- (void)setWidgetDir:(NSURL*)newDir
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:[NSKeyedArchiver archivedDataWithRootObject:newDir
                                             requiringSecureCoding:YES
                                                             error:nil]
                 forKey:@"widgetDirectory"];
    
    [self widgetDirChanged:newDir];
    [(GLAppDelegate *)[NSApp delegate] widgetDirDidChange];
}

- (void)widgetDirChanged:(NSURL*)url
{
    NSImage *iconImage = [[NSWorkspace sharedWorkspace] iconForFile:[url path]];
    [iconImage setSize:NSMakeSize(16,16)];
    
    // the SwiftUI view displays the path itself, so there is nothing to update
    (void)iconImage;
}


- (NSData*)ensureDefaultsWidgetDir
{
    NSArray* urls = [[NSFileManager defaultManager]
        URLsForDirectory:NSApplicationSupportDirectory
        inDomains:NSUserDomainMask
    ];
    
    NSURL* defaultDir = [urls[0]
        URLByAppendingPathComponent:@"Gailan/widgets"
        isDirectory:YES
    ];
    
    [self createIfNotExists:defaultDir];
    
    return [NSKeyedArchiver archivedDataWithRootObject:defaultDir
                               requiringSecureCoding:YES
                                               error:nil];
}

- (void)createIfNotExists:(NSURL*)defaultWidgetDir
{
    NSFileManager* fileManager = [NSFileManager defaultManager];
    BOOL isDir;
    
    if ([fileManager fileExistsAtPath:[defaultWidgetDir path] isDirectory:&isDir] && isDir) {
        return;
    }
    
    NSError* error;
    [fileManager createDirectoryAtURL:defaultWidgetDir
          withIntermediateDirectories:YES
                           attributes:nil
                                error:&error];

    if (error) {
        NSLog(@"%@", error);
        return;
    }
    
    // the starter widget is a folder now: its manifest declares the settings the
    // Widgets window offers, so it has to travel with the code
    NSURL* starterWidget = [[NSBundle mainBundle]
        URLForResource: @"GettingStarted"
         withExtension: nil
    ];

    [fileManager
        copyItemAtURL: starterWidget
                toURL: [defaultWidgetDir
                    URLByAppendingPathComponent: @"GettingStarted"
                ]
                error: &error];
    
    // the starter widget sets its own wordmark in text, so it only needs the mark
    NSURL* logo = [[NSBundle mainBundle]
        URLForResource: @"gailan-mark" withExtension: @"png"
    ];
    NSURL* darkLogo = [[NSBundle mainBundle]
        URLForResource: @"gailan-mark-dark" withExtension: @"png"
    ];
    // and the typeface that wordmark is set in, so it reads the same on the
    // desktop as it does on the website without asking the network for a font
    NSURL* wordmarkFont = [[NSBundle mainBundle]
        URLForResource: @"gailan-wordmark" withExtension: @"ttf"
    ];
    
    [fileManager copyItemAtURL:logo
                         toURL:[defaultWidgetDir URLByAppendingPathComponent:@"mark.png"]
                         error:&error];
    [fileManager copyItemAtURL:darkLogo
                         toURL:[defaultWidgetDir URLByAppendingPathComponent:@"mark-dark.png"]
                         error:nil];
    [fileManager copyItemAtURL:wordmarkFont
                         toURL:[defaultWidgetDir
                                   URLByAppendingPathComponent:@"wordmark.ttf"]
                         error:nil];
    
    if (error) {
        NSLog(@"%@", error);
    }
    
}

#
#pragma mark Login Shell
#


- (BOOL)loginShell
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    return [defaults boolForKey:@"loginShell"];
}

- (void)setLoginShell:(BOOL)enabled
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    [defaults setBool:enabled forKey:@"loginShell"];
    [(GLAppDelegate *)[NSApp delegate] loginShellDidChange];
}


#
#pragma mark Interaction
#


- (BOOL)enableInteraction
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    return [[defaults valueForKey:@"enableInteraction"] boolValue];
}

- (void)setEnableInteraction:(BOOL)enabled
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:@(enabled) forKey:@"enableInteraction"];
    [(GLAppDelegate *)[NSApp delegate] interactionDidChange];
}

#
#pragma mark Shell
#

- (NSString*)shell
{
    NSString* name = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"shell"
    ];
    return [name isEqualToString:@"fish"] ? @"fish" : @"zsh";
}

- (NSInteger)shellTag
{
    return [[self shell] isEqualToString:@"fish"] ? 1 : 0;
}

- (void)setShellTag:(NSInteger)tag
{
    [[NSUserDefaults standardUserDefaults]
        setObject: tag == 1 ? @"fish" : @"zsh"
           forKey: @"shell"
    ];
    [(GLAppDelegate *)[NSApp delegate] shellDidChange];
}

- (BOOL)alwaysOnTop
{
    return [[NSUserDefaults standardUserDefaults] boolForKey:@"alwaysOnTop"];
}

- (void)setAlwaysOnTop:(BOOL)flag
{
    [[NSUserDefaults standardUserDefaults]
        setBool:flag forKey:@"alwaysOnTop"
    ];
    [(GLAppDelegate *)[NSApp delegate] alwaysOnTopDidChange];
}

#
#pragma mark Liquid glass

static NSArray* desktopGlassMaterials(void)
{
    return @[@"off", @"subtle", @"frosted", @"heavy"];
}

- (NSString*)desktopGlassMaterial
{
    NSString* name = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlass"
    ];
    return [desktopGlassMaterials() containsObject:name] ? name : @"off";
}

- (NSInteger)desktopGlassTag
{
    return (NSInteger)[desktopGlassMaterials()
        indexOfObject:[self desktopGlassMaterial]];
}

// macOS 26 draws real liquid glass and takes a style and a tint; older systems
// get a vibrancy material, which takes neither.
static NSArray* desktopGlassStyles(void)
{
    return @[@"follow", @"regular", @"clear", @"tinted"];
}

/* Follow matches what macOS is set to; the rest hold regardless of the system. */
- (NSString*)desktopGlassStyle
{
    NSString* name = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlassStyle"
    ];
    return [desktopGlassStyles() containsObject:name] ? name : @"follow";
}

- (NSInteger)desktopGlassStyleTag
{
    return (NSInteger)[desktopGlassStyles() indexOfObject:[self desktopGlassStyle]];
}

/* How present the glass is, as a fraction. NSGlassEffectView has no transparency of its
   own, so this is the view's. */
- (double)desktopGlassOpacity
{
    NSNumber* stored = [[NSUserDefaults standardUserDefaults]
        objectForKey:@"desktopGlassOpacity"
    ];
    double value = stored ? stored.doubleValue : 1.0;
    return MIN(MAX(value, 0.1), 1.0);
}

- (void)setDesktopGlassOpacity:(double)opacity
{
    [[NSUserDefaults standardUserDefaults]
        setObject: @(MIN(MAX(opacity, 0.1), 1.0))
           forKey: @"desktopGlassOpacity"
    ];
    [(GLAppDelegate *)[NSApp delegate] desktopGlassDidChange];
}

- (void)setDesktopGlassStyleTag:(NSInteger)tag
{
    if (tag < 0 || tag >= (NSInteger)desktopGlassStyles().count) return;
    [[NSUserDefaults standardUserDefaults]
        setObject: desktopGlassStyles()[tag]
           forKey: @"desktopGlassStyle"
    ];
    [(GLAppDelegate *)[NSApp delegate] desktopGlassDidChange];
}

// stored as #rrggbbaa so it survives a plist round trip legibly. fully
// transparent means untinted.
/* Whether a tint was saved before the mode existed. Read straight from the store rather
   than through the accessor, since this runs while the defaults are being registered. */
- (BOOL)storedTintIsAColor
{
    NSString* hex = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlassTint"
    ];
    if (hex.length < 9) return NO;

    unsigned int value = 0;
    NSScanner* scanner = [NSScanner scannerWithString:
        [hex stringByReplacingOccurrencesOfString:@"#" withString:@""]];
    if (![scanner scanHexInt:&value]) return NO;

    return (value & 0xFF) > 0;
}

- (NSString*)desktopGlassTintMode
{
    NSString* mode = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlassTintMode"
    ];
    return mode ?: @"follow";
}

- (void)setDesktopGlassTintMode:(NSString*)mode
{
    [[NSUserDefaults standardUserDefaults]
        setObject: mode ?: @"follow"
           forKey: @"desktopGlassTintMode"
    ];
    [(GLAppDelegate *)[NSApp delegate] desktopGlassDidChange];
}

/* Whether macOS is tinting window backgrounds with the wallpaper. The setting is
   AppleReduceDesktopTinting in the global domain and it counts the other way: 1 means
   reduce the tinting, so absent or 0 means tinting is on. */
+ (BOOL)systemTintsWindowBackgrounds
{
    return ![[NSUserDefaults standardUserDefaults]
        boolForKey:@"AppleReduceDesktopTinting"];
}

/* Where macOS keeps what the desktop is showing. NSWorkspace's desktopImageURLForScreen:
   is not it: since the wallpaper moved into its own agent that method answers with
   /System/Library/CoreServices/DefaultDesktop.heic no matter what is on screen, which is
   the stock picture and not the user's. The store is the truth, and it names a provider
   and a configuration rather than a file, because a wallpaper can be a video. */
static NSString* const kWallpaperStore =
    @"Library/Application Support/com.apple.wallpaper/Store/Index.plist";
static NSString* const kAerialVideos =
    @"Library/Application Support/com.apple.wallpaper/aerials/videos";

+ (NSURL*)wallpaperStoreURL
{
    return [[NSURL fileURLWithPath:NSHomeDirectory()]
        URLByAppendingPathComponent:kWallpaperStore];
}

/* The branch of the store that applies to one screen. A display with a wallpaper of its
   own is under Displays, keyed by the display's UUID; otherwise every screen shares what
   is under AllSpacesAndDisplays. Both branches are read the same way afterwards. */
+ (NSDictionary*)wallpaperChoiceForScreen:(NSScreen*)screen
{
    NSDictionary* store = [NSDictionary
        dictionaryWithContentsOfURL:[self wallpaperStoreURL]];
    if (!store) return nil;

    NSDictionary* branch = nil;

    NSNumber* number = screen.deviceDescription[@"NSScreenNumber"];
    if (number) {
        CFUUIDRef uuid = CGDisplayCreateUUIDFromDisplayID(number.unsignedIntValue);
        if (uuid) {
            CFStringRef text = CFUUIDCreateString(NULL, uuid);
            branch = ((NSDictionary*)store[@"Displays"])[(__bridge NSString*)text];
            if (text) CFRelease(text);
            CFRelease(uuid);
        }
    }

    if (!branch) branch = store[@"AllSpacesAndDisplays"];

    return [self choiceWithin:branch depth:0];
}

/* The shapes differ between a linked wallpaper and a per display one, and Apple has
   changed them before. Rather than naming every level, this looks for the dictionary that
   carries a Provider, which is the part that matters. */
+ (NSDictionary*)choiceWithin:(id)node depth:(int)depth
{
    if (depth > 6 || !node) return nil;

    if ([node isKindOfClass:[NSDictionary class]]) {
        if (((NSDictionary*)node)[@"Provider"]) return node;
        for (id value in [(NSDictionary*)node objectEnumerator]) {
            NSDictionary* found = [self choiceWithin:value depth:depth + 1];
            if (found) return found;
        }
        return nil;
    }

    if ([node isKindOfClass:[NSArray class]]) {
        for (id value in (NSArray*)node) {
            NSDictionary* found = [self choiceWithin:value depth:depth + 1];
            if (found) return found;
        }
    }

    return nil;
}

/* The file behind a choice. An aerial is a video in the user's own library named after the
   asset id in the choice's configuration, which is itself a plist. A still wallpaper names
   its files outright. Where neither says anything, NSWorkspace is asked, since it does
   answer correctly for a plain picture. */
+ (NSURL*)wallpaperFileForScreen:(NSScreen*)screen isVideo:(BOOL*)isVideo
{
    if (isVideo) *isVideo = NO;

    NSDictionary* choice = [self wallpaperChoiceForScreen:screen];
    NSString* provider = choice[@"Provider"];

    if ([provider rangeOfString:@"aerial" options:NSCaseInsensitiveSearch].location
        != NSNotFound) {
        NSData* encoded = choice[@"Configuration"];
        NSDictionary* configuration = encoded
            ? [NSPropertyListSerialization propertyListWithData:encoded
                                                       options:NSPropertyListImmutable
                                                        format:NULL
                                                         error:NULL]
            : nil;
        NSString* assetID = configuration[@"assetID"];
        if (assetID.length) {
            NSURL* video = [[[NSURL fileURLWithPath:NSHomeDirectory()]
                URLByAppendingPathComponent:kAerialVideos]
                URLByAppendingPathComponent:
                    [assetID stringByAppendingPathExtension:@"mov"]];
            if ([video checkResourceIsReachableAndReturnError:NULL]) {
                if (isVideo) *isVideo = YES;
                return video;
            }
        }
    }

    NSArray* files = choice[@"Files"];
    for (id entry in files) {
        NSString* path = [entry isKindOfClass:[NSDictionary class]]
            ? ((NSDictionary*)entry)[@"relative"] ?: ((NSDictionary*)entry)[@"path"]
            : entry;
        if (![path isKindOfClass:[NSString class]] || !path.length) continue;

        NSURL* url = [path hasPrefix:@"file:"] ? [NSURL URLWithString:path]
                                              : [NSURL fileURLWithPath:path];
        if ([url checkResourceIsReachableAndReturnError:NULL]) return url;
    }

    return [[NSWorkspace sharedWorkspace] desktopImageURLForScreen:screen];
}

/* One color out of many pixels.

   The average is taken in linear light. sRGB values are gamma encoded, so adding them up
   as they stand is adding numbers that are not proportional to light, and the answer comes
   out darker and muddier than the picture looks.

   Samples are weighted by how colorful they are. A wallpaper is mostly large, quiet areas,
   and an unweighted average of those is always a gray. Weighting by chroma lets the parts
   carrying the color decide what the color is, which is what somebody means by the color
   of their wallpaper. A small base weight keeps a genuinely gray picture from dividing by
   nothing.

   Read at 32 by 32 with high interpolation: one pixel is an unweighted average with
   nothing left to weight. */
+ (NSColor*)colorOfImage:(CGImageRef)image
{
    if (!image) return nil;

    const size_t side = 32;
    const size_t stride = side * 4;
    unsigned char* pixels = calloc(side * stride, 1);
    if (!pixels) return nil;

    CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef bitmap = CGBitmapContextCreate(
        pixels, side, side, 8, stride, space, kCGImageAlphaPremultipliedLast);
    CGColorSpaceRelease(space);
    if (!bitmap) {
        free(pixels);
        return nil;
    }

    CGContextSetInterpolationQuality(bitmap, kCGInterpolationHigh);
    CGContextDrawImage(bitmap, CGRectMake(0, 0, side, side), image);
    CGContextRelease(bitmap);

    double totals[3] = {0, 0, 0};
    double weights = 0;

    for (size_t i = 0; i < side * side; i++) {
        unsigned char* sample = pixels + i * 4;
        double channels[3];
        for (int c = 0; c < 3; c++) {
            double v = sample[c] / 255.0;
            // sRGB to linear light, the standard transfer function
            channels[c] = v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
        }

        double high = fmax(fmax(channels[0], channels[1]), channels[2]);
        double low = fmin(fmin(channels[0], channels[1]), channels[2]);
        double weight = 0.05 + (high - low);

        for (int c = 0; c < 3; c++) totals[c] += channels[c] * weight;
        weights += weight;
    }

    free(pixels);
    if (weights <= 0) return nil;

    CGFloat rgb[3];
    for (int c = 0; c < 3; c++) {
        double linear = totals[c] / weights;
        rgb[c] = linear <= 0.0031308 ? linear * 12.92
                                     : 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
        rgb[c] = fmin(fmax(rgb[c], 0.0), 1.0);
    }

    /* The alpha is held well below full, since a tint at full strength stops the glass
       reading as glass. */
    return [NSColor colorWithSRGBRed:rgb[0] green:rgb[1] blue:rgb[2] alpha:0.35];
}

/* The color of one screen's wallpaper, video or still. Each screen is asked for its own,
   since macOS lets every display carry a different picture.

   A video wallpaper is sampled a little way in rather than at its first frame, which is
   often a fade. Its light changes as it plays while its hue does not, so re-reading later
   moves the tint's brightness and leaves its color alone.

   Kept per screen against the file, the time that file was written, and the time the
   store was written, so choosing a new wallpaper or editing the current one is noticed
   and nothing else costs more than three stats. */
+ (NSColor*)wallpaperTintForScreen:(NSScreen*)screen
{
    if (!screen) return nil;

    BOOL isVideo = NO;
    NSURL* url = [self wallpaperFileForScreen:screen isVideo:&isVideo];
    if (!url) return nil;

    NSDate* written = nil;
    [url getResourceValue:&written forKey:NSURLContentModificationDateKey error:NULL];
    NSDate* storeWritten = nil;
    [[self wallpaperStoreURL] getResourceValue:&storeWritten
                                       forKey:NSURLContentModificationDateKey
                                        error:NULL];

    NSNumber* screenId = screen.deviceDescription[@"NSScreenNumber"];
    NSString* token = [NSString
        stringWithFormat:@"%@|%@|%f|%f", screenId, url.path,
                         written.timeIntervalSince1970,
                         storeWritten.timeIntervalSince1970];

    static NSMutableDictionary<NSString*, NSColor*>* sampled = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ sampled = [NSMutableDictionary dictionary]; });
    if (sampled[token]) return sampled[token];

    NSColor* color = nil;

    if (isVideo) {
        AVURLAsset* asset = [AVURLAsset URLAssetWithURL:url options:nil];
        AVAssetImageGenerator* generator =
            [AVAssetImageGenerator assetImageGeneratorWithAsset:asset];
        generator.appliesPreferredTrackTransform = YES;
        CGImageRef frame = [generator copyCGImageAtTime:CMTimeMakeWithSeconds(2, 600)
                                            actualTime:NULL
                                                 error:NULL];
        color = [self colorOfImage:frame];
        if (frame) CGImageRelease(frame);
    } else {
        NSImage* picture = [[NSImage alloc] initWithContentsOfURL:url];
        CGImageRef image = [picture CGImageForProposedRect:NULL context:nil hints:nil];
        color = [self colorOfImage:image];
    }

    if (color) {
        [sampled removeAllObjects];
        sampled[token] = color;
    }

    return color;
}

// The main screen's, for callers with no screen in hand.
+ (NSColor*)wallpaperTint
{
    return [self wallpaperTintForScreen:[NSScreen mainScreen]];
}

- (NSString*)desktopGlassTint
{
    NSString* hex = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlassTint"
    ];
    return hex ?: @"#00000000";
}

- (void)setDesktopGlassTint:(NSString*)hex
{
    [[NSUserDefaults standardUserDefaults]
        setObject: hex ?: @"#00000000"
           forKey: @"desktopGlassTint"
    ];
    [(GLAppDelegate *)[NSApp delegate] desktopGlassDidChange];
}


/* The accent colour macOS is set to.

   Read from AppleAccentColor rather than from NSColor's controlAccentColor, which is
   settled once per process and so goes stale as soon as the choice changes. The table is
   the colour macOS draws for each choice; an unfamiliar value falls back to NSColor. */
+ (NSColor*)systemAccentColor
{
    NSNumber* chosen = [[NSUserDefaults standardUserDefaults]
        objectForKey:@"AppleAccentColor"
    ];

    /* nothing chosen means multicolour, which draws as blue */
    if (![chosen isKindOfClass:[NSNumber class]]) {
        return [NSColor colorWithSRGBRed:0x00 / 255.0
                                   green:0x7a / 255.0
                                    blue:0xff / 255.0
                                   alpha:1.0];
    }

    static NSDictionary<NSNumber*, NSArray<NSNumber*>*>* palette = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        palette = @{
            @(-1): @[@0x8c, @0x8c, @0x8c],  // graphite
            @(0):  @[@0xff, @0x52, @0x57],  // red
            @(1):  @[@0xf7, @0x82, @0x1b],  // orange
            @(2):  @[@0xff, @0xc6, @0x00],  // yellow
            @(3):  @[@0x62, @0xba, @0x46],  // green
            @(4):  @[@0x00, @0x7a, @0xff],  // blue
            @(5):  @[@0xa5, @0x50, @0xa7],  // purple
            @(6):  @[@0xf7, @0x4f, @0x9e],  // pink
        };
    });

    NSArray<NSNumber*>* channels = palette[@(chosen.integerValue)];
    if (!channels) return [NSColor controlAccentColor];

    return [NSColor
        colorWithSRGBRed: channels[0].doubleValue / 255.0
                   green: channels[1].doubleValue / 255.0
                    blue: channels[2].doubleValue / 255.0
                   alpha: 1.0
    ];
}

- (NSColor*)desktopGlassTintColor
{
    NSString* mode = [self desktopGlassTintMode];

    if ([mode isEqualToString:@"off"]) return nil;

    if ([mode isEqualToString:@"follow"]) {
        if (![GLPreferencesController systemTintsWindowBackgrounds]) return nil;
        return [GLPreferencesController wallpaperTint];
    }

    NSString* hex = [self desktopGlassTint];
    unsigned int value = 0;
    NSScanner* scanner = [NSScanner scannerWithString:
        [hex stringByReplacingOccurrencesOfString:@"#" withString:@""]];
    if (![scanner scanHexInt:&value]) return nil;

    CGFloat alpha = (value & 0xFF) / 255.0;
    if (alpha <= 0.001) return nil;

    return [NSColor
        colorWithSRGBRed: ((value >> 24) & 0xFF) / 255.0
                   green: ((value >> 16) & 0xFF) / 255.0
                    blue: ((value >> 8) & 0xFF) / 255.0
                   alpha: alpha
    ];
}

- (void)setDesktopGlassTag:(NSInteger)tag
{
    if (tag < 0 || tag >= (NSInteger)desktopGlassMaterials().count) return;
    [[NSUserDefaults standardUserDefaults]
        setObject: desktopGlassMaterials()[tag]
           forKey: @"desktopGlass"
    ];
    [(GLAppDelegate *)[NSApp delegate] desktopGlassDidChange];
}


#
#pragma mark Appearance
#

+ (void)applyAppearance
{
    NSString* name = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"appearance"
    ];
    if ([name isEqualToString:@"light"]) {
        NSApp.appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    } else if ([name isEqualToString:@"dark"]) {
        NSApp.appearance =
            [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    } else {
        NSApp.appearance = nil;
    }
}

- (NSInteger)appearanceTag
{
    NSString* name = [[NSUserDefaults standardUserDefaults]
        stringForKey:@"appearance"
    ];
    if ([name isEqualToString:@"light"]) return 1;
    if ([name isEqualToString:@"dark"]) return 2;
    return 0;
}

- (void)setAppearanceTag:(NSInteger)tag
{
    NSString* name = tag == 1 ? @"light" : tag == 2 ? @"dark" : @"system";
    [[NSUserDefaults standardUserDefaults]
        setObject:name forKey:@"appearance"
    ];
    [GLPreferencesController applyAppearance];
}

#
#pragma mark Startup
#

- (BOOL)startAtLogin
{
    return [SMAppService mainAppService].status == SMAppServiceStatusEnabled;
}

- (void)setStartAtLogin:(BOOL)doStart
{
    NSError* error = nil;
    if (doStart) {
        [[SMAppService mainAppService] registerAndReturnError:&error];
    } else {
        [[SMAppService mainAppService] unregisterAndReturnError:&error];
    }
    if (error) {
        NSLog(@"could not update the login item: %@", error);
    }
}

#
#pragma mark Teardown
#




@end
