//
//  GLWidgetsController.h
//  
//
//  Created by Felix Hageloh on 2/12/15.
//  Copyright (c) 2026 Kevin Chen.
//
//

#import <Cocoa/Cocoa.h>
@class GLScreensController;
@class GLWidgetsStore;
@class GLPreferencesController;

@interface GLWidgetsController : NSController <NSMenuDelegate>

- (id)initWithMenu:(NSMenu*)menu
           widgets:(GLWidgetsStore*)theWidgets
           screens:(GLScreensController*)screens
       preferences:(GLPreferencesController*)preferences;
- (void)render;
- (NSArray*)widgetsForScripting;

// For the overview window. One dictionary per widget, and setters that go
// through the same dispatcher the menu does, so both stay in step.
- (NSArray<NSDictionary*>*)widgetsOverview;
- (void)setHidden:(BOOL)hidden forWidget:(NSString*)widgetId;
- (void)setInBackground:(BOOL)inBackground forWidget:(NSString*)widgetId;
- (void)setScreenMode:(NSString*)mode forWidget:(NSString*)widgetId;
- (void)refreshWidgetWithId:(NSString*)widgetId;
- (void)openWidgetFile:(NSString*)widgetId;
- (void)setConfigValue:(id)value
                forKey:(NSString*)key
                widget:(NSString*)widgetId;
- (void)reloadWidget:(NSString*)widgetId;

@end
