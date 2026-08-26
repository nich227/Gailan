//
//  GLWidgetsController.h
//  
//
//  Created by Felix Hageloh on 2/12/15.
//
//

#import <Cocoa/Cocoa.h>
@class GLScreensController;
@class GLWidgetsStore;
@class GLPreferencesController;

@interface GLWidgetsController : NSController

- (id)initWithMenu:(NSMenu*)menu
           widgets:(GLWidgetsStore*)theWidgets
           screens:(GLScreensController*)screens
       preferences:(GLPreferencesController*)preferences;
- (void)render;
- (NSArray*)widgetsForScripting;
- (void)reloadWidget:(NSString*)widgetId;

@end
