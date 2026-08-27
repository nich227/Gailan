//
//  GLWidgetsController.m
//  Gailan
//
//  Created by Felix Hageloh on 2/12/15.
//  Copyright (c) 2026 Kevin Chen.
//
//

#import "GLWidgetsController.h"
#import "GLWidgetsStore.h"
#import "GLScreensController.h"
#import "GLDispatcher.h"
#import "GLWidgetForScripting.h"
#import "GLPreferencesController.h"

@import UserNotifications;

@implementation GLWidgetsController {
    GLWidgetsStore* widgets;
    GLScreensController* screensController;
    GLPreferencesController* preferences;
    NSMenu* mainMenu;
    NSInteger currentIndex;
    NSImage* statusIconVisible;
    NSImage* statusIconHidden;
    GLDispatcher* dispatcher;
    BOOL menuDirty;
    BOOL menuOpen;
}

static NSInteger const WIDGET_MENU_ITEM_TAG = 42;

- (id)initWithMenu:(NSMenu*)menu
           widgets:(GLWidgetsStore*)theWidgets
           screens:(GLScreensController*)screens
       preferences:(GLPreferencesController*)prefs
{
    self = [super init];
    
    
    if (self) {

        mainMenu = menu;
        widgets = theWidgets;
        screensController = screens;
        preferences = prefs;
        
        currentIndex = [self indexOfWidgetMenuItems:menu];
        [menu insertItem:[NSMenuItem separatorItem] atIndex:currentIndex];
        currentIndex++;
        NSMenuItem* header = [[NSMenuItem alloc] init];
        [header setTitle:@"Widgets"];
        [header setState:0];
        [mainMenu insertItem:header atIndex:currentIndex];
        currentIndex++;
        [menu insertItem:[NSMenuItem separatorItem] atIndex:currentIndex];
        
        dispatcher = [[GLDispatcher alloc] init];

        // The menu contents are only observable while the menu is open, so
        // store changes mark it dirty and the rebuild happens right before it
        // is displayed. A status item shows its menu without posting the
        // tracking notifications, so this has to be the delegate callback.
        [menu setDelegate:self];
        [[NSNotificationCenter defaultCenter]
            addObserver: self
               selector: @selector(menuDidEndTracking:)
                   name: NSMenuDidEndTrackingNotification
                 object: menu
        ];
       
        statusIconVisible = [[NSBundle mainBundle]
            imageForResource:@"widget-status-visible"
        ];
        [statusIconVisible setTemplate:YES];
        
        statusIconHidden = [[NSBundle mainBundle]
            imageForResource:@"widget-status-hidden"
        ];
    }
    
    return self;
}


- (void)render
{
    // error notifications must not wait for the menu to be opened
    NSArray* sortedWidgets = widgets.sortedWidgets;
    NSString* error;
    for (NSInteger i = sortedWidgets.count - 1; i >= 0; i--) {
        error = [widgets get:sortedWidgets[i]][@"error"];
        if (error) {
            [self notifyUser:error withTitle:@"Error"];
        }
    }

    if (menuOpen) {
        [self renderMenu];
    } else {
        menuDirty = YES;
    }
}

- (void)renderMenu
{
     for (NSMenuItem *item in [mainMenu itemArray]) {
        if (item.tag == WIDGET_MENU_ITEM_TAG) {
            [mainMenu removeItem: item];
        }
    }
    
    NSArray* sortedWidgets = widgets.sortedWidgets;
    for (NSInteger i = sortedWidgets.count - 1; i >= 0; i--) {
        [self renderWidget:sortedWidgets[i] inMenu:mainMenu];
    }
}

- (void)menuDidEndTracking:(NSNotification*)notification
{
    menuOpen = NO;
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}


- (void)renderWidget:(NSString*)widgetId inMenu:(NSMenu*)menu
{
    NSMenuItem* newItem = [[NSMenuItem alloc] init];
    
    [newItem setTitle:widgetId];
    [newItem setRepresentedObject:widgetId];
    [newItem setTag:WIDGET_MENU_ITEM_TAG];
    
    [newItem
        setImage:[self isWidgetVisible:widgetId]
            ? statusIconVisible
            : statusIconHidden
    ];
    
    
    // the submenu is populated by menuNeedsUpdate: when it is about to be
    // displayed, so its contents are always read from current state. The
    // menu title carries the widget id, it is never shown for submenus.
    NSMenu* widgetMenu = [[NSMenu alloc] initWithTitle:widgetId];
    [widgetMenu setAutoenablesItems: NO];
    [widgetMenu setDelegate:self];

    [newItem setSubmenu:widgetMenu];
    [menu insertItem:newItem atIndex:currentIndex];
}

- (void)menuNeedsUpdate:(NSMenu*)menu
{
    // the status menu itself: rebuild the widget rows if anything changed
    if (menu == mainMenu) {
        menuOpen = YES;
        if (menuDirty) {
            menuDirty = NO;
            [self renderMenu];
        }
        return;
    }
    [self populateWidgetMenu:menu];
}

- (void)populateWidgetMenu:(NSMenu*)widgetMenu
{
    NSString* widgetId = [widgetMenu title];
    [widgetMenu removeAllItems];

    [widgetMenu insertItem:[NSMenuItem separatorItem] atIndex:0];
    [self addHideOptionToMenu:widgetMenu forWidget:widgetId];
    [self addBackgroundOptionToMenu:widgetMenu forWidget:widgetId];
    
    [self
        addScreens: [screensController screens]
        toWidgetMenu: widgetMenu
        forWidget: widgetId
     ];
    
    [self addSelectedScreensOptionToMenu:widgetMenu forWidget:widgetId];
    [widgetMenu insertItem:[NSMenuItem separatorItem] atIndex:0];
    
    [self addMainScreenOptionToMenu:widgetMenu forWidget:widgetId];
    [self addAllScreensOptionToMenu:widgetMenu forWidget:widgetId];
    
    
    [self addEditMenuItemToMenu:widgetMenu forWidget:widgetId];
    [widgetMenu insertItem:[NSMenuItem separatorItem] atIndex:1];
}

// without this, AppKit would call menuNeedsUpdate: on every submenu while
// scanning for key equivalents
- (BOOL)menuHasKeyEquivalent:(NSMenu*)menu
                    forEvent:(NSEvent*)event
                      target:(id*)target
                      action:(SEL*)action
{
    return NO;
}

- (void)addEditMenuItemToMenu:(NSMenu*)menu forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc]
        initWithTitle: @"Edit..."
        action: @selector(editWidget:)
        keyEquivalent: @""
    ];
    [item setRepresentedObject:widgetId];
    [item setTarget:self];
    [menu insertItem:item atIndex:0];

}

- (void)addMainScreenOptionToMenu:(NSMenu*)menu forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc]
        initWithTitle: @"Show on main display"
        action: @selector(showOnMainScreen:)
        keyEquivalent: @""
    ];
    NSDictionary* settings = [widgets getSettings:widgetId];
    [item setTarget:self];
    [item setRepresentedObject:widgetId];
    [item setState:[settings[@"showOnMainScreen"] boolValue]];
    [menu insertItem:item atIndex:0];
}


- (void)addAllScreensOptionToMenu:(NSMenu*)menu forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc]
        initWithTitle: @"Show on all screens"
        action: @selector(showOnAllScreens:)
        keyEquivalent: @""
    ];
    NSDictionary* settings = [widgets getSettings:widgetId];
    [item setTarget:self];
    [item setRepresentedObject:widgetId];
    [item setState:[settings[@"showOnAllScreens"] boolValue]];
    [menu insertItem:item atIndex:0];
}

- (void)addHideOptionToMenu:(NSMenu*)menu forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc]
        initWithTitle: @"Hide widget"
        action: @selector(toggleHidden:)
        keyEquivalent: @""
    ];
    
    NSDictionary* settings = [widgets getSettings:widgetId];
    [item setTarget:self];
    [item setRepresentedObject:widgetId];
    [item setState:[settings[@"hidden"] boolValue]];
    [menu insertItem:item atIndex:0];
}

- (void)addSelectedScreensOptionToMenu:(NSMenu*)menu
                             forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc] init];
    NSDictionary* settings = [widgets getSettings:widgetId];
    
    [item setTitle:@"Show on selected screens:"];
    [item setState:[settings[@"showOnSelectedScreens"] boolValue]];
    [item setEnabled:NO];
    [menu insertItem:item atIndex:0];
}

- (void)addBackgroundOptionToMenu:(NSMenu*)menu
                        forWidget:(NSString*)widgetId
{
    NSMenuItem* item = [[NSMenuItem alloc]
        initWithTitle: @"Send to background"
        action: @selector(toggleBackground:)
        keyEquivalent: @""
    ];
    NSDictionary* settings = [widgets getSettings:widgetId];
    [item setTarget:self];
    [item setRepresentedObject:widgetId];
    [item setState: preferences.enableInteraction
        ? [settings[@"inBackground"] boolValue]
        : YES
    ];
    [item setEnabled: preferences.enableInteraction];
    [menu insertItem:item atIndex:0];
}

- (void)removeWidget:(NSString*)widgetId FromMenu:(NSMenu*)menu
{
    [menu removeItem:[menu itemWithTitle:widgetId]];
}

- (void)addScreens:(NSDictionary*)screens
      toWidgetMenu:(NSMenu*)menu
      forWidget:(NSString*)widgetId
{
    NSString *title;
    NSMenuItem *newItem;
    NSString *name;
    NSArray* widgetScreens = [widgets getSettings:widgetId][@"screens"];
    
    newItem = [NSMenuItem separatorItem];
    [menu insertItem:newItem atIndex:0];
    
    int i = 0;
    for(NSNumber* screenId in screensController.sortedScreens) {
        name = screensController.screens[screenId];
        title = [NSString stringWithFormat:@"Show on %@", name];
        newItem = [[NSMenuItem alloc]
            initWithTitle: title
            action: @selector(toggleScreen:)
            keyEquivalent: @""
        ];
        
        [newItem setTarget:self];
        [newItem
            setRepresentedObject: @{
                @"screenId": screenId,
                @"widgetId": widgetId
            }
        ];
        
        if ([widgetScreens containsObject:screenId]) {
            [newItem setState:YES];
        }
        [menu insertItem:newItem atIndex:i];
        i++;
    }
}

- (BOOL)isWidgetVisible:(NSString*)widgetId
{
    NSDictionary* settings = [widgets getSettings:widgetId];
    BOOL isVisible = NO;
    if ([settings[@"hidden"] boolValue]) {
        isVisible = NO;
    } else if ([settings[@"showOnAllScreens"] boolValue]) {
        isVisible = YES;
    } else if ([settings[@"showOnMainScreen"] boolValue]) {
        isVisible = YES;
    } else if ([settings[@"showOnSelectedScreens"] boolValue]) {
        NSMutableSet *intersection = [NSMutableSet
            setWithArray: settings[@"screens"]
        ];
        
        [intersection
            intersectSet:[NSSet setWithArray:[screensController sortedScreens]]
        ];
    
        isVisible = [intersection count] > 0;
     }
    
    return isVisible;
}


-(NSInteger)indexOfWidgetMenuItems:(NSMenu*)menu
{
    return [menu indexOfItem:[menu itemWithTitle:@"Check for Updates..."]] + 2;
}


- (void)showOnAllScreens:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    
    [dispatcher
        dispatch: @"WIDGET_SET_TO_ALL_SCREENS"
        withPayload: widgetId
    ];
}

- (void)showOnSelectedScreens:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    
    [dispatcher
        dispatch: @"WIDGET_SET_TO_SELECTED_SCREENS"
        withPayload: widgetId
    ];
}

- (void)showOnMainScreen:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    
    [dispatcher
        dispatch: @"WIDGET_SET_TO_MAIN_SCREEN"
        withPayload: widgetId
    ];
}

#pragma mark Overview window

- (NSArray<NSDictionary*>*)widgetsOverview
{
    NSMutableArray* result = [NSMutableArray array];

    for (NSString* widgetId in [widgets sortedWidgets]) {
        NSDictionary* widget = [widgets get:widgetId] ?: @{};
        NSDictionary* settings = [widgets getSettings:widgetId] ?: @{};
        NSString* filePath = widget[@"filePath"] ?: @"";

        [result addObject:@{
            @"id": widgetId,
            @"filePath": filePath,
            @"fileName": [filePath lastPathComponent] ?: @"",
            @"hidden": @([settings[@"hidden"] boolValue]),
            @"inBackground": @([settings[@"inBackground"] boolValue]),
            @"showOnAllScreens": @([settings[@"showOnAllScreens"] boolValue]),
            @"showOnMainScreen": @([settings[@"showOnMainScreen"] boolValue]),
            @"hasError": @(widget[@"error"] != nil),
            // what the widget says it can be configured with, and what it is
            // currently set to
            @"title": widget[@"title"] ?: widgetId,
            @"settingsSchema": widget[@"settingsSchema"] ?: @[],
            @"config": settings[@"config"] ?: @{},
        }];
    }

    return result;
}

- (void)setHidden:(BOOL)hidden forWidget:(NSString*)widgetId
{
    [dispatcher
        dispatch: hidden ? @"WIDGET_SET_TO_HIDE" : @"WIDGET_SET_TO_SHOW"
        withPayload: widgetId
    ];
}

- (void)setInBackground:(BOOL)inBackground forWidget:(NSString*)widgetId
{
    [dispatcher
        dispatch: inBackground
            ? @"WIDGET_SET_TO_BACKGROUND"
            : @"WIDGET_SET_TO_FOREGROUND"
        withPayload: widgetId
    ];
}

// mode is "all", "main" or "selected", matching the menu's three choices
- (void)setScreenMode:(NSString*)mode forWidget:(NSString*)widgetId
{
    NSString* action = @"WIDGET_SET_TO_SELECTED_SCREENS";
    if ([mode isEqualToString:@"all"]) action = @"WIDGET_SET_TO_ALL_SCREENS";
    if ([mode isEqualToString:@"main"]) action = @"WIDGET_SET_TO_MAIN_SCREEN";

    [dispatcher dispatch:action withPayload:widgetId];
}

- (void)setConfigValue:(id)value
                forKey:(NSString*)key
                widget:(NSString*)widgetId
{
    [dispatcher
        dispatch: @"WIDGET_CONFIG_CHANGED"
        withPayload: @{@"id": widgetId, @"key": key, @"value": value}
    ];
}

- (void)refreshWidgetWithId:(NSString*)widgetId
{
    [dispatcher dispatch:@"WIDGET_WANTS_REFRESH" withPayload:widgetId];
}

- (void)openWidgetFile:(NSString*)widgetId
{
    NSString* filePath = [widgets get:widgetId][@"filePath"];
    if (!filePath) return;

    if (![[NSWorkspace sharedWorkspace]
            openURL: [NSURL fileURLWithPath:filePath]]) {
        [self
            notifyUser: [NSString
                stringWithFormat: @"Please configure an app to edit .%@ files",
                                  [filePath pathExtension]
            ]
             withTitle: @"No Editor Configured."
        ];
    }
}

#pragma mark Menu actions

- (void)toggleHidden:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    NSDictionary* settings = [widgets getSettings:widgetId];
    BOOL isHidden = [settings[@"hidden"] boolValue];
    
    [dispatcher
        dispatch: isHidden ? @"WIDGET_SET_TO_SHOW" : @"WIDGET_SET_TO_HIDE"
        withPayload: widgetId
    ];
}

- (void)toggleBackground:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    NSDictionary* settings = [widgets getSettings:widgetId];
    BOOL inBackground = [settings[@"inBackground"] boolValue];
    
    [dispatcher
        dispatch: inBackground
            ? @"WIDGET_SET_TO_FOREGROUND"
            : @"WIDGET_SET_TO_BACKGROUND"
        withPayload: widgetId
    ];
}

- (void)toggleScreen:(id)sender
{
    NSMenuItem* menuItem = (NSMenuItem*)sender;
    NSDictionary* data = [menuItem representedObject];
    NSNumber* screenId = data[@"screenId"];
    NSDictionary* widgetSettings = [widgets getSettings:data[@"widgetId"]];
    NSString* message;
    
    if ([(NSArray*)widgetSettings[@"screens"] containsObject:screenId]) {
        message = @"SCREEN_DESELECTED_FOR_WIDGET";
    } else {
        message = @"SCREEN_SELECTED_FOR_WIDGET";
    }
    
    [dispatcher
        dispatch: @"WIDGET_SET_TO_SELECTED_SCREENS"
        withPayload: data[@"widgetId"]
    ];

    [dispatcher
        dispatch: message
        withPayload: @{
            @"id": data[@"widgetId"],
            @"screenId": screenId
        }
    ];
}

- (void)editWidget:(id)sender
{
    NSString* widgetId = [(NSMenuItem*)sender representedObject];
    NSString* filePath = [widgets get:widgetId][@"filePath"];
    
    if (![[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:filePath]]) {
        NSString* message = @"Please configure an app to edit .%@ files";
        [self
            notifyUser: [NSString
                stringWithFormat: message, [filePath pathExtension]
            ]
            withTitle: @"No Editor Configured."
        ];
    }
}

- (void)reloadWidget:(NSString*)widgetId
{
    NSString* filePath = [widgets get:widgetId][@"filePath"];
    NSDictionary* attributes  = [NSDictionary
        dictionaryWithObjectsAndKeys: [NSDate date], NSFileModificationDate, nil
    ];
    [NSFileManager.defaultManager
        setAttributes: attributes
        ofItemAtPath:filePath
        error: NULL
    ];
}

- (void)notifyUser:(NSString*)message withTitle:(NSString*)title
{
    UNMutableNotificationContent* content =
        [[UNMutableNotificationContent alloc] init];
    content.title = title;
    content.body = message;

    UNNotificationRequest* request = [UNNotificationRequest
        requestWithIdentifier: [[NSUUID UUID] UUIDString]
        content: content
        trigger: nil
    ];
    [[UNUserNotificationCenter currentNotificationCenter]
        addNotificationRequest: request
        withCompletionHandler: ^(NSError* error) {
            if (error) NSLog(@"could not deliver notification: %@", error);
        }
    ];
}

- (NSArray*)widgetsForScripting
{
    NSMutableArray* allWidgets = [NSMutableArray array];
    for ( NSString* widgetId in [widgets sortedWidgets]) {
        [allWidgets addObject: [[GLWidgetForScripting alloc]
                initWithId: widgetId
                andSettings: [widgets getSettings:widgetId]
            ]
        ];
    }
    return allWidgets;
}


@end
