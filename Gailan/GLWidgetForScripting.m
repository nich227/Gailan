//
//  GLWidgetForScripting.m
//  Gailan
//
//  Created by Felix Hageloh on 7/1/17.
//  Copyright © 2017 tracesOf. All rights reserved.
//

#import "GLWidgetForScripting.h"
#import "GLDispatcher.h"
#import "GLAppDelegate.h"

static GLDispatcher* dispatcher;

@implementation GLWidgetForScripting

+ (void)initialize {
    if(!dispatcher) {
         dispatcher = [[GLDispatcher alloc] init];
    }
}

-(id)initWithId:(NSString*)widgetId andSettings:(NSDictionary*)settings
{
    self = [super init];
    if (self) {
        _id = widgetId;
        _hidden = [settings[@"hidden"] boolValue];
        _showOnAllScreens = [settings[@"showOnAllScreens"] boolValue];
        _showOnMainScreen = [settings[@"showOnMainScreen"] boolValue];
    }
    return self;
}

- (NSUniqueIDSpecifier *)objectSpecifier {

	return [[NSUniqueIDSpecifier alloc]
        initWithContainerClassDescription: (NSScriptClassDescription *)[NSApp
            classDescription
        ]
        containerSpecifier: nil
        key: @"widgets"
        uniqueID: self.id
    ];
}

- (void)setHidden:(BOOL)hidden
{
    if (_hidden == hidden) {
        return;
    }
    _hidden = hidden;
    [dispatcher
        dispatch: _hidden ? @"WIDGET_SET_TO_HIDE" : @"WIDGET_SET_TO_SHOW"
        withPayload: _id
    ];
}

// Which layer it sits in: behind your windows, or in front of them.
- (void)setInBackground:(BOOL)inBackground
{
    if (_inBackground == inBackground) {
        return;
    }
    _inBackground = inBackground;
    [dispatcher
        dispatch: _inBackground
            ? @"WIDGET_SET_TO_BACKGROUND"
            : @"WIDGET_SET_TO_FOREGROUND"
        withPayload: _id
    ];
}

// The same action the settings sheet sends, so a shortcut and a click on a control
// end up in the same place, saved beside the widget.
- (void)setConfigValue:(id)value forKey:(NSString*)key
{
    if (!key || !value) {
        return;
    }
    [dispatcher
        dispatch: @"WIDGET_CONFIG_CHANGED"
        withPayload: @{@"id": _id, @"key": key, @"value": value}
    ];
}

- (void)setShowOnMainScreen:(BOOL)showOnMainScreen
{
    if (_showOnMainScreen == showOnMainScreen) {
        return;
    }
    _showOnMainScreen = showOnMainScreen;
    [dispatcher
        dispatch: @"WIDGET_SET_TO_MAIN_SCREEN"
        withPayload: _id
    ];
}

- (void)setShowOnAllScreens:(BOOL)showOnAllScreens
{
    if (_showOnAllScreens == showOnAllScreens) {
        return;
    }
    _showOnAllScreens = showOnAllScreens;
    [dispatcher
        dispatch: @"WIDGET_SET_TO_ALL_SCREENS"
        withPayload: _id
    ];
}

- (void)refresh:(NSScriptCommand*)command
{
    [dispatcher
        dispatch: @"WIDGET_WANTS_REFRESH"
        withPayload: _id
    ];
}

- (void)reload:(NSScriptCommand*)command
{
    [(GLAppDelegate*)NSApp.delegate reloadWidget: _id];
}

@end
