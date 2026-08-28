//
//  GLWidgetForScripting.h
//  Gailan
//
//  Created by Felix Hageloh on 7/1/17.
//  Copyright © 2017 tracesOf. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface GLWidgetForScripting : NSObject

@property (nonatomic) NSString *id;
@property (nonatomic) BOOL hidden;
@property (nonatomic) BOOL showOnAllScreens;
@property (nonatomic) BOOL showOnMainScreen;
@property (nonatomic) BOOL inBackground;

-(id)initWithId:(NSString*)widgetId andSettings:(NSDictionary*)settings;
-(void)refresh:(NSScriptCommand*)command;
-(void)reload:(NSScriptCommand*)command;
// one of the widget's own settings, by the key it declared in its widget.json
-(void)setConfigValue:(id)value forKey:(NSString*)key;
@end
