//
//  GLWebSocket.h
//  
//
//  Created by Felix Hageloh on 24/1/16.
//  Copyright (c) 2026 Kevin Chen.
//
//

#import <Foundation/Foundation.h>
#import <SocketRocket/SRWebSocket.h>

@interface GLWebSocket : NSObject <SRWebSocketDelegate>

+ (id)sharedSocket;
- (void)open:(NSURL*)aUrl withToken:(NSString*)token;
- (void)close;
- (void)send:(id)message;
- (void)listen:(void (^)(id))listener;

@end
