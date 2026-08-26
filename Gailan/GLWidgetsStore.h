//
//  GLWidgetsStore.h
//  
//
//  Created by Felix Hageloh on 26/1/16.
//
//

#import <Foundation/Foundation.h>

@interface GLWidgetsStore : NSObject

- (void)onChange:(void (^)(NSDictionary*))aChangeHandler;
- (void)reset:(NSDictionary*)state;
- (NSDictionary*)get:(NSString*)widgetId;
- (NSDictionary*)getSettings:(NSString*)widgetId;
- (NSArray*)sortedWidgets;

@end
