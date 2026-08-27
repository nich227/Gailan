//
//  GLPreferencesController.h
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

#import <Cocoa/Cocoa.h>

@interface GLPreferencesController : NSWindowController

@property (weak) IBOutlet NSPopUpButton *filePicker;
@property BOOL startAtLogin;
@property BOOL compatibilityMode;
@property NSURL* widgetDir;
@property BOOL loginShell;
@property BOOL enableInteraction;
@property NSInteger shellTag;
@property BOOL alwaysOnTop;
@property BOOL glassEnabled;
@property double glassStrength;
@property double glassDepth;
@property double glassCurvature;
@property double glassDispersion;
@property double glassFrost;
@property NSInteger desktopGlassTag;

- (NSString*)desktopGlassMaterial;

- (NSString*)glassSettingsJSON;
- (NSDictionary*)glassSettings;
@property NSInteger appearanceTag;

- (NSString*)shell;
+ (void)applyAppearance;

- (IBAction)showFilePicker:(id)sender;
- (void)chooseWidgetDir:(void (^)(NSURL* url))completion;

@end
