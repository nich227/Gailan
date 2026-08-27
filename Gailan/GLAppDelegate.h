//
//  GLAppDelegate.h
//  Gailan
//
//  Created by Felix Hageloh on 20/9/13.
//  Copyright (c) 2013 Felix Hageloh.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import <Cocoa/Cocoa.h>
#import "GLScreenChangeListener.h"

@import UserNotifications;

@interface GLAppDelegate : NSObject <NSApplicationDelegate, UNUserNotificationCenterDelegate, GLScreenChangeListener>

@property (weak) IBOutlet NSMenu *statusBarMenu;
@property (readonly) NSArray* widgets;

- (void)widgetDirDidChange;
- (void)interactionDidChange;
- (void)screensChanged:(NSDictionary*)screens;
- (IBAction)showPreferences:(id)sender;
- (IBAction)openWidgetDir:(id)sender;
- (IBAction)showDebugConsole:(id)sender;
- (IBAction)refreshWidgets:(id)sender;
- (void)reloadWidget:(NSString*)widgetId;
- (void)loginShellDidChange;
- (void)shellDidChange;
- (void)alwaysOnTopDidChange;

@end
