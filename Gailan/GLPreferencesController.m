//
//  GLPreferencesController.m
//  Gailan
//
//  Created by Felix Hageloh on 20/3/14.
//  Copyright (c) 2014 Felix Hageloh.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import "GLPreferencesController.h"

@import ServiceManagement;

@implementation GLPreferencesController

// the sidebar rows, in the order the panes appear in the xib
static NSArray* categories(void)
{
    return @[@"General", @"Appearance", @"Shell", @"Liquid Glass"];
}

#
#pragma mark Sidebar
#

- (NSInteger)numberOfRowsInTableView:(NSTableView*)tableView
{
    return categories().count;
}

- (id)tableView:(NSTableView*)tableView
    objectValueForTableColumn:(NSTableColumn*)column
    row:(NSInteger)row
{
    return categories()[row];
}

- (void)tableViewSelectionDidChange:(NSNotification*)notification
{
    NSInteger row = self.categoryTable.selectedRow;
    if (row >= 0 && row < (NSInteger)categories().count) {
        [self.panes selectTabViewItemAtIndex:row];
    }
}

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
            // the liquid glass look widgets inherit; the names are the
            // optics vocabulary of the glass library
            @"glassEnabled": @YES,
            @"glassStrength": @0.5,
            @"glassDepth": @0.4,
            @"glassCurvature": @0.3,
            @"glassDispersion": @0.4,
            @"glassFrost": @2.0
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

    [self.categoryTable reloadData];
    [self.categoryTable
        selectRowIndexes: [NSIndexSet indexSetWithIndex:0]
        byExtendingSelection: NO
    ];
}

#
#pragma mark Widget Directory
#

- (IBAction)showFilePicker:(id)sender
{
    NSOpenPanel* openPanel = [NSOpenPanel openPanel];
    
    [openPanel setCanChooseFiles:NO];
    [openPanel setCanChooseDirectories:YES];
    
    [openPanel beginSheetModalForWindow:self.window completionHandler:^(NSInteger result) {
        if (result == NSModalResponseOK) {
            [self setWidgetDir:[openPanel URLs][0]];
        }
        
        [self->filePicker selectItemAtIndex:0];
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
    
    // TODO: see if we could use bindings for this
    [[filePicker itemAtIndex:0] setTitle: [url path]];
    [[filePicker itemAtIndex:0] setImage:iconImage];
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
    
    NSURL* gettinStartedWidget = [[NSBundle mainBundle] URLForResource:@"GettingStarted" withExtension:@"tsx"];
    
    [fileManager copyItemAtURL:gettinStartedWidget
                         toURL:[defaultWidgetDir URLByAppendingPathComponent:@"GettingStarted.tsx"]
                         error:&error];
    
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
#

- (BOOL)glassEnabled
{
    return [[NSUserDefaults standardUserDefaults] boolForKey:@"glassEnabled"];
}

- (void)setGlassEnabled:(BOOL)enabled
{
    [[NSUserDefaults standardUserDefaults]
        setBool:enabled forKey:@"glassEnabled"
    ];
    [(GLAppDelegate *)[NSApp delegate] glassDidChange];
}

#define GL_GLASS_OPTIC(prop, key)                                             \
- (double)prop                                                                \
{                                                                             \
    return [[NSUserDefaults standardUserDefaults] doubleForKey:key];          \
}                                                                             \
                                                                              \
- (void)set##prop:(double)value                                               \
{                                                                             \
    [[NSUserDefaults standardUserDefaults] setDouble:value forKey:key];       \
    [(GLAppDelegate *)[NSApp delegate] glassDidChange];                       \
}

GL_GLASS_OPTIC(GlassStrength, @"glassStrength")
GL_GLASS_OPTIC(GlassDepth, @"glassDepth")
GL_GLASS_OPTIC(GlassCurvature, @"glassCurvature")
GL_GLASS_OPTIC(GlassDispersion, @"glassDispersion")
GL_GLASS_OPTIC(GlassFrost, @"glassFrost")

- (NSDictionary*)glassSettings
{
    return @{
        @"enabled": @(self.glassEnabled),
        @"optics": @{
            @"strength": @(self.glassStrength),
            @"depth": @(self.glassDepth),
            @"curvature": @(self.glassCurvature),
            @"dispersion": @(self.glassDispersion),
            @"frost": @(self.glassFrost),
        }
    };
}

// the same settings, for the initial page url
- (NSString*)glassSettingsJSON
{
    NSData* json = [NSJSONSerialization
        dataWithJSONObject:[self glassSettings] options:0 error:nil
    ];
    return [[NSString alloc]
        initWithData:json encoding:NSUTF8StringEncoding
    ];
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
