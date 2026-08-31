//
//  GLAppDelegate.m
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

#import "GLAppDelegate.h"
#import "GLWindow.h"
#import "GLPreferencesController.m"
#import "GLScreensController.h"
#import "GLWidgetsController.h"
#import "GLDispatcher.h"
#import "GLWidgetsStore.h"
#import "GLWebSocket.h"
#import "GLWindowsController.h"

int const PORT = 41416;

@interface GLAppDelegate ()
@property (nonatomic, copy, readwrite) NSString *serverToken;
@property (nonatomic, readwrite) GLPreferencesController *preferences;
@end


@implementation GLAppDelegate {
    GLDispatcher* dispatcher;
    id clickMonitor;
    NSStatusItem* statusBarItem;
    NSTask* widgetServer;
    GLScreensController* screensController;
    GLWindowsController* windowsController;
    BOOL shuttingDown;
    BOOL keepServerAlive;
    // a wallpaper change has no notification, so it is looked for on a timer
    NSTimer* wallpaperWatch;
    NSColor* lastWallpaperTint;
    int portOffset;
    GLWidgetsStore* widgetsStore;
    GLWidgetsController* widgetsController;
    BOOL needsRefresh;
}

@synthesize statusBarMenu;

// Gailan is Übersicht with the same widget surface, so running both renders
// everything twice; only one of them should run
- (void)resolveUbersichtConflict
{
    NSArray<NSRunningApplication*>* others = [NSRunningApplication
        runningApplicationsWithBundleIdentifier:@"tracesOf.Uebersicht"
    ];
    if (others.count == 0) return;

    NSAlert* alert = [[NSAlert alloc] init];
    alert.messageText = @"Übersicht is running";
    alert.informativeText =
        @"Gailan is an upgraded version of Übersicht. "
        @"Only one of them should run.";
    [alert addButtonWithTitle:@"Quit Übersicht"];   // first button = default
    [alert addButtonWithTitle:@"Quit Gailan"];

    if ([alert runModal] == NSAlertFirstButtonReturn) {
        for (NSRunningApplication* app in others) {
            [app terminate];
        }
    } else {
        [NSApp terminate:nil];
    }
}

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification
{
    [self watchSystemTinting];
    [self resolveUbersichtConflict];

    needsRefresh = YES;
    statusBarItem = [self addStatusItemToMenu: statusBarMenu];
    self.preferences = [[GLPreferencesController alloc]
        initWithWindowNibName:@"GLPreferencesController"
    ];

    // NSTask doesn't terminate when xcode stop is pressed. Other ways of
    // spawning the server, like system() or popen() have the same problem.
    // So, hit em with a hammer :(
    system("killall -m node-");
    
    widgetsStore = [[GLWidgetsStore alloc] init];

    screensController = [[GLScreensController alloc]
        initWithChangeListener:self
    ];
    
    windowsController = [[GLWindowsController alloc] init];
    dispatcher = [[GLDispatcher alloc] init];
    
    widgetsController = [[GLWidgetsController alloc]
        initWithMenu: statusBarMenu
        widgets: widgetsStore
        screens: screensController
        preferences: self.preferences
    ];
    [widgetsStore onChange: ^(NSDictionary* widgets) {
        [self->widgetsController render];
        // the store takes one handler, so anything else that cares listens here
        [[NSNotificationCenter defaultCenter]
            postNotificationName: @"GLWidgetsDidChange"
                          object: nil
        ];
    }];
    
    [GLPreferencesController applyAppearance];
    [windowsController setAlwaysOnTop:self.preferences.alwaysOnTop];
    [self applyDesktopGlass];

    // make sure notifications always show, even while we are frontmost
    UNUserNotificationCenter* unc =
        [UNUserNotificationCenter currentNotificationCenter];
    unc.delegate = self;
    [unc
        requestAuthorizationWithOptions: UNAuthorizationOptionAlert
        completionHandler: ^(BOOL granted, NSError* error) {
            if (error) NSLog(@"notification authorization: %@", error);
        }
    ];
    

    // widgets are read from disk as they land, so a check can wait until the
    // desktop is drawn rather than competing with it
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8 * NSEC_PER_SEC)),
        dispatch_get_main_queue(),
        ^{
            [GLWidgetUpdatesWindow
                checkQuietly:[self.preferences.widgetDir path]
            ];
        }
    );

    [[[NSWorkspace sharedWorkspace] notificationCenter]
        addObserver: self
        selector: @selector(wakeFromSleep:)
        name: NSWorkspaceDidWakeNotification
        object: nil
    ];
    
    [[[NSWorkspace sharedWorkspace] notificationCenter]
        addObserver: self
        selector: @selector(workspaceChanged:)
        name: NSWorkspaceActiveSpaceDidChangeNotification
        object: nil
    ];
    
    [[[NSWorkspace sharedWorkspace] notificationCenter]
        addObserver: self
        selector: @selector(loginSessionBecameActive:)
        name: NSWorkspaceSessionDidBecomeActiveNotification
        object: nil
    ];
 
    [[[NSWorkspace sharedWorkspace] notificationCenter]
        addObserver: self
        selector: @selector(loginSessionResigned:)
        name: NSWorkspaceSessionDidResignActiveNotification
        object: nil
    ];
    
    [[NSNotificationCenter defaultCenter]
        addObserver: self
        selector: @selector(appResignedActive:)
        name: NSApplicationDidResignActiveNotification
        object: nil
    ];

    // A click on the desktop or in another app never reaches the page, because
    // the widget windows ignore the mouse unless the pointer is over a widget.
    // This is the only way a widget can know it stopped being the thing you
    // were last using.
    clickMonitor = [NSEvent
        addGlobalMonitorForEventsMatchingMask: NSEventMaskLeftMouseDown |
                                               NSEventMaskRightMouseDown
        handler: ^(NSEvent* event) {
            // through self, so it is clear the block holds on to it
            if (![self->windowsController pointerIsOverWidget]) {
                [self widgetsLostFocus];
            }
        }
    ];

    // start server and load webview
    portOffset = 0;
    [self startUp];
    
    [self listenToWallpaperChanges];
}

- (NSDictionary*)fetchState
{
    NSURL *urlPath = [NSURL URLWithString:[NSString
        stringWithFormat:@"%@state/?token=%@",
        [[self serverUrl:@"http"] absoluteString],
        self.serverToken
    ]];
    NSData *jsonData = [NSData dataWithContentsOfURL:urlPath];
    NSError *error = nil;
    NSDictionary *dataDictionary = [NSJSONSerialization
        JSONObjectWithData: jsonData
        options: NSJSONReadingMutableContainers
        error: &error
    ];
    if (error) NSLog(@"%@", error);
    return dataDictionary;
}

- (void)startUp
{

    NSLog(@"starting server task");
    
    void (^handleData)(NSString*) = ^(NSString* output) {
        // note that these might be called several times
        if ([output rangeOfString:@"server started"].location != NSNotFound) {
            [[GLWebSocket sharedSocket]
                open:[self serverUrl:@"ws"]
                withToken:self.serverToken];
            [self->widgetsStore reset: [self fetchState]];
            // this will trigger a render
            [self->screensController syncScreens];

        } else if ([output rangeOfString:@"EADDRINUSE"].location != NSNotFound) {
            self->portOffset++;
        }
    };

    void (^handleExit)(NSTask*) = ^(NSTask* theTask) {
        if (!self->shuttingDown) {
            [self shutdown];
        }
        if (self->portOffset >= 20) {
            self->keepServerAlive = NO;
            NSLog(@"couldn't find an open port. Giving up...");
        }
        if (self->keepServerAlive) {
            [self
                performSelector: @selector(startUp)
                withObject: nil
                afterDelay: 1.0
            ];
        }
    };
    
    shuttingDown = NO;
    keepServerAlive = YES;
    widgetServer = [self
        launchWidgetServer: [self.preferences.widgetDir path]
        onData: handleData
        onExit: handleExit
    ];
}

- (void)shutdown:(Boolean)keepAlive
{
    if (shuttingDown) {
        return;
    }
    shuttingDown = YES;

    keepServerAlive = keepAlive;
    [windowsController closeAll];
    [[GLWebSocket sharedSocket] close];
    if (widgetServer){
        [widgetServer terminate];
    }
}

- (void)shutdown
{
    [self shutdown:false];
}

- (void)applicationWillTerminate:(NSNotification *)notification
{
    keepServerAlive = NO;
    [widgetServer terminate];
    [[NSStatusBar systemStatusBar] removeStatusItem:statusBarItem];
    
}

- (NSStatusItem*)addStatusItemToMenu:(NSMenu*)aMenu
{
    NSStatusBar*  bar = [NSStatusBar systemStatusBar];
    NSStatusItem* item;

    item = [bar statusItemWithLength: NSSquareStatusItemLength];
    
    NSImage *image = [[NSBundle mainBundle] imageForResource:@"status-icon"];
    [image setTemplate:YES];
    [item.button setImage: image];
    [item setMenu:aMenu];
    item.button.enabled = YES;

    return item;
}

- (NSTask*)launchWidgetServer:(NSString*)widgetPath
                       onData:(void (^)(NSString*))dataHandler
                       onExit:(void (^)(NSTask*))exitHandler
{
    NSBundle* bundle     = [NSBundle mainBundle];
    NSString* nodePath   = [bundle pathForResource:@"localnode" ofType:nil];
    NSString* serverPath = [bundle pathForResource:@"server" ofType:@"js"];
    BOOL loginShell = [[NSUserDefaults standardUserDefaults]
        boolForKey:@"loginShell"
    ];
    NSString* shell = self.preferences.shell;

    // a fresh secret per server launch; stdin, so it never shows in ps
    self.serverToken = [[NSUUID UUID] UUIDString];

    NSTask *task = [[NSTask alloc] init];

    [task setStandardInput:[NSPipe pipe]];
    [task setStandardOutput:[NSPipe pipe]];
    [task.standardOutput fileHandleForReading].readabilityHandler = ^(NSFileHandle *handle) {
        NSData *output = [handle availableData];
        NSString *outStr = [[NSString alloc]
            initWithData:output
            encoding:NSUTF8StringEncoding
        ];
        
        NSLog(@"%@", outStr);
        dispatch_async(dispatch_get_main_queue(), ^{
            dataHandler(outStr);
        });
    };
    
    task.terminationHandler = ^(NSTask *theTask) {
        [theTask.standardOutput fileHandleForReading].readabilityHandler = nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            exitHandler(theTask);
        });
    };
    
    [task setLaunchPath:nodePath];
    [task setArguments:@[
        serverPath,
        @"-d", widgetPath,
        @"-p", [NSString stringWithFormat:@"%d", PORT + portOffset],
        @"-s", [[self getPreferencesDir] path],
        @"--shell", shell,
        loginShell ? @"--login-shell" : @""
    ]];
    
    [task launch];

    NSFileHandle* stdinHandle = [task.standardInput fileHandleForWriting];
    [stdinHandle writeData:
        [self.serverToken dataUsingEncoding:NSUTF8StringEncoding]];
    [stdinHandle closeFile];

    return task;
}


- (NSURL*)getPreferencesDir
{
    NSArray* urls = [[NSFileManager defaultManager]
        URLsForDirectory:NSApplicationSupportDirectory
               inDomains:NSUserDomainMask
    ];
    
    return [urls[0]
        URLByAppendingPathComponent:[[NSBundle mainBundle] bundleIdentifier]
                        isDirectory:YES
    ];
}

- (NSURL*)serverUrl:(NSString*)protocol
{
    // trailing slash required for load policy in GLWindow
    return [NSURL
        URLWithString:[NSString
            stringWithFormat:@"%@://127.0.0.1:%d/", protocol, PORT+portOffset
        ]
    ];
}


#
#pragma mark Screen Handling
#

- (void)screensChanged:(NSDictionary*)screens
{
    if (widgetsController) {
        [windowsController
            updateWindows:screens
            baseUrl: [self serverUrl: @"http"]
            interactionEnabled: self.preferences.enableInteraction
            forceRefresh: needsRefresh
        ];
        needsRefresh = NO;
    }
}

#
# pragma mark received actions
#


- (void)widgetDirDidChange
{
    [self shutdown:true];
}

- (void)loginShellDidChange
{
    [self shutdown:true];
}

- (void)shellDidChange
{
    [self shutdown:true];
}

- (void)desktopGlassDidChange
{
    [self applyDesktopGlass];
}

/* A tint that follows the system has to notice the system changing its mind, and the
   tint is worked out here rather than in the layer, so this is where the watching goes.

   KVO on NSUserDefaults rather than a notification: System Settings writes the value
   from its own process, and of the three ways of hearing about that, only this one
   fires. NSUserDefaultsDidChangeNotification and a catch-all distributed observer both
   stay silent for a cross-process write. */
- (void)watchSystemTinting
{
    [[NSUserDefaults standardUserDefaults]
        addObserver: self
         forKeyPath: @"AppleReduceDesktopTinting"
            options: 0
            context: NULL
    ];

    /* A wallpaper change has no notification to hear. AppKit publishes
       desktopImageURLForScreen: and nothing that says it changed: the only notifications
       NSWorkspace declares near it are for the active space and for file labels. So the
       url and the file's modification date are looked at on a slow timer, and on a space
       change, since each space can carry its own wallpaper and switching is when somebody
       is most likely to see a different one.

       Half a minute is chosen against what it costs: reading a url and a modification
       date, and doing nothing when neither moved. The picture is only read again when one
       of them has. */
    [[[NSWorkspace sharedWorkspace] notificationCenter]
        addObserver: self
           selector: @selector(wallpaperMayHaveChanged)
               name: NSWorkspaceActiveSpaceDidChangeNotification
             object: nil
    ];

    wallpaperWatch = [NSTimer
        scheduledTimerWithTimeInterval: 30.0
                                target: self
                              selector: @selector(wallpaperMayHaveChanged)
                              userInfo: nil
                               repeats: YES
    ];
}

- (void)wallpaperMayHaveChanged
{
    if (![GLPreferencesController systemTintsWindowBackgrounds]) return;

    /* The sampler keeps its answer against the file and the time it was written, so this
       costs a url and a stat when nothing changed, and pushes only when the color it
       gives back is a different one. */
    NSColor* now = [GLPreferencesController wallpaperTint];
    if (now == lastWallpaperTint || [now isEqual:lastWallpaperTint]) return;

    lastWallpaperTint = now;
    [self applyDesktopGlass];
}

- (void)observeValueForKeyPath:(NSString*)keyPath
                      ofObject:(id)object
                        change:(NSDictionary*)change
                       context:(void*)context
{
    if ([keyPath isEqualToString:@"AppleReduceDesktopTinting"]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self applyDesktopGlass];
        });
        return;
    }

    [super observeValueForKeyPath:keyPath
                         ofObject:object
                           change:change
                          context:context];
}

- (void)applyDesktopGlass
{
    [windowsController
        setGlassMaterial: [self.preferences desktopGlassMaterial]
                   style: [self.preferences desktopGlassStyle]
                 opacity: [self.preferences desktopGlassOpacity]
    ];
}


// a level change, not a window rebuild: rebuilding reloads every widget
- (void)alwaysOnTopDidChange
{
    [windowsController setAlwaysOnTop:self.preferences.alwaysOnTop];
}

- (void)interactionDidChange
{
    [windowsController closeAll];
    needsRefresh = YES;
    [screensController syncScreens];
}

- (IBAction)showPreferences:(id)sender
{
    [self.preferences showWindow:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self.preferences.window makeKeyAndOrderFront:self];
}

- (IBAction)openWidgetDir:(id)sender
{
    [[NSWorkspace sharedWorkspace]openURL:self.preferences.widgetDir];
}

- (IBAction)visitWidgetGallery:(id)sender
{
    // the gallery, where a widget downloads as a zip. it reads the same repository
    // the updater does, so the two never disagree about what exists.
    [[NSWorkspace sharedWorkspace]
        openURL:[NSURL URLWithString:@"https://gailanapp.pages.dev/hub"]
    ];
}

- (IBAction)refreshWidgets:(id)sender
{
    needsRefresh = YES;
    [screensController syncScreens];
}

- (IBAction)showWidgetsOverview:(id)sender
{
    [GLWidgetsOverviewWindow show:widgetsController];
}

- (IBAction)checkForWidgetUpdates:(id)sender
{
    [GLWidgetUpdatesWindow show:[self.preferences.widgetDir path]];
}

- (IBAction)showAbout:(id)sender
{
    [GLAboutWindow show];
}

#pragma mark - what the Shortcuts actions call

- (void)openWidgetFileWithId:(NSString*)widgetId
{
    [widgetsController openWidgetFile:widgetId];
}

- (void)setAlwaysOnTop:(BOOL)alwaysOnTop
{
    self.preferences.alwaysOnTop = alwaysOnTop;
    [windowsController setAlwaysOnTop:alwaysOnTop];
}

- (void)setAppearanceTag:(NSInteger)tag
{
    self.preferences.appearanceTag = tag;
    [GLPreferencesController applyAppearance];
}

// the menu item's tag says which layer to inspect: 1 foreground, 2 background,
// 0 both. widgets sit in one layer or the other, so inspecting the wrong one
// shows an empty page.
- (IBAction)showDebugConsole:(id)sender
{
    NSNumber* currentScreen = [[NSScreen mainScreen]
        deviceDescription
    ][@"NSScreenNumber"];

    NSInteger layer = [sender respondsToSelector:@selector(tag)]
        ? [sender tag]
        : 0;

    [windowsController
        showDebugConsolesForScreen: currentScreen
                             layer: layer
    ];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:
             (void (^)(UNNotificationPresentationOptions))completionHandler
{
    completionHandler(UNNotificationPresentationOptionBanner);
}

- (void)appResignedActive:(NSNotification *)notification
{
    [self widgetsLostFocus];
}

// widgets style off html[data-widget-focus] and can listen for gailan:blur
- (void)widgetsLostFocus
{
    [dispatcher dispatch:@"WIDGETS_BLURRED" withPayload:@""];
}

- (void)wakeFromSleep:(NSNotification *)notification
{
    [windowsController reloadAll];
}

- (void)workspaceChanged:(NSNotification *)notification
{
    [windowsController workspaceChanged];
}

- (void)wallpaperChanged:(NSNotification *)notification
{
    [windowsController wallpaperChanged];
    /* and the glass, since a tint that follows the wallpaper is now a different color.
       Each screen is asked for its own, so this covers a wallpaper changed on one
       display and not another. */
    [self applyDesktopGlass];
}

- (void)loginSessionBecameActive:(NSNotification *)notification
{
    [self startUp];
}

- (void)loginSessionResigned:(NSNotification *)notification
{
    [self shutdown];
}


- (void)listenToWallpaperChanges
{
    NSArray *paths = NSSearchPathForDirectoriesInDomains(
        NSLibraryDirectory,
        NSUserDomainMask,
        YES
    );
    
    /* Two places, because macOS moved. Dock/desktoppicture.db is where the wallpaper
       lived up to Ventura; from Sonoma on it is com.apple.wallpaper/Store/Index.plist,
       and the old file stops changing. Watching both means one build works across the
       versions the app supports. */
    CFStringRef watched[2] = {
        (__bridge CFStringRef)[paths[0]
            stringByAppendingPathComponent:@"/Application Support/Dock/"],
        (__bridge CFStringRef)[paths[0]
            stringByAppendingPathComponent:@"/Application Support/com.apple.wallpaper/"]
    };
    
    FSEventStreamContext context = {
        0,
        (__bridge void *)(self), NULL, NULL, NULL
    };
    FSEventStreamRef stream;
    
    stream = FSEventStreamCreate(
        NULL,
        &wallpaperSettingsChanged,
        &context,
        CFArrayCreate(NULL, (const void **)watched, 2, NULL),
        kFSEventStreamEventIdSinceNow,
        0,
        kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes
    );
    
    FSEventStreamSetDispatchQueue(stream, dispatch_get_main_queue());
    FSEventStreamStart(stream);

}

void wallpaperSettingsChanged(
    ConstFSEventStreamRef streamRef,
    void *this,
    size_t numEvents,
    void *eventPaths,
    const FSEventStreamEventFlags eventFlags[],
    const FSEventStreamEventId eventIds[]
)
{
    CFStringRef path;
    CFArrayRef  paths = eventPaths;

    for (int i=0; i < numEvents; i++) {
        path = CFArrayGetValueAtIndex(paths, i);
        BOOL oldStore = CFStringFindWithOptions(
            path, CFSTR("desktoppicture.db"),
            CFRangeMake(0, CFStringGetLength(path)),
            kCFCompareCaseInsensitive, NULL) == true;
        // Index.plist is rewritten when a wallpaper is chosen, per display or for all
        BOOL currentStore = CFStringFindWithOptions(
            path, CFSTR("Index.plist"),
            CFRangeMake(0, CFStringGetLength(path)),
            kCFCompareCaseInsensitive, NULL) == true;

        if (oldStore || currentStore) {
            [(__bridge GLAppDelegate*)this
                performSelector:@selector(wallpaperChanged:)
                withObject:nil
                afterDelay:0.5
            ];
        }
    }
}

#
# pragma mark script support
#

- (NSArray*)getWidgets
{
   return [widgetsController widgetsForScripting];
}

- (BOOL)application:(NSApplication *)sender delegateHandlesKey:(NSString *)key
{
    return [key isEqualToString:@"widgets"];
}

- (void)reloadWidget:(NSString*)widgetId
{
    [widgetsController reloadWidget:widgetId];
}

@end
