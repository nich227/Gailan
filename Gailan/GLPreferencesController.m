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

            // which system material macOS draws behind a widget that asks
            // for it. on by default; "off" opts out.
            @"desktopGlass": @"frosted"
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
    
    NSURL* logo = [[NSBundle mainBundle] URLForResource:@"gailan-logo" withExtension:@"png"];
    NSURL* darkLogo = [[NSBundle mainBundle] URLForResource:@"gailan-logo-dark" withExtension:@"png"];
    
    [fileManager copyItemAtURL:logo
                         toURL:[defaultWidgetDir URLByAppendingPathComponent:@"logo.png"]
                         error:&error];
    [fileManager copyItemAtURL:darkLogo
                         toURL:[defaultWidgetDir URLByAppendingPathComponent:@"logo-dark.png"]
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
    return @[@"regular", @"clear"];
}

- (BOOL)desktopGlassClear
{
    return [[[NSUserDefaults standardUserDefaults]
        stringForKey:@"desktopGlassStyle"] isEqualToString:@"clear"];
}

- (NSInteger)desktopGlassStyleTag
{
    return [self desktopGlassClear] ? 1 : 0;
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

- (NSColor*)desktopGlassTintColor
{
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
