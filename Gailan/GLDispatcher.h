//
//  GLDispatcher.h
//  
//
//  Created by Felix Hageloh on 11/1/16.
//
//

#import <Foundation/Foundation.h>


@interface GLDispatcher : NSObject

- (void)dispatch:(NSString*)type withPayload:(id)payload;

@end
