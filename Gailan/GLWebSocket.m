//
//  GLWebSocket.m
//  
//
//  Created by Felix Hageloh on 24/1/16.
//  Copyright (c) 2026 Kevin Chen.
//
//

#import "GLWebSocket.h"

@implementation GLWebSocket {
    NSMutableArray* listeners;
    NSMutableArray* queuedMessages;
    SRWebSocket* ws;
    NSURL* url;
    NSString* serverToken;
}


+ (id)sharedSocket {
    static GLWebSocket* sharedSocket = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedSocket = [[self alloc] init];
    });
    return sharedSocket;
}

- (id)init {

    if (self = [super init]) {
        listeners = [[NSMutableArray alloc] init];
        queuedMessages = [[NSMutableArray alloc] init];
    }
    return self;
}

- (void)send:(id)message
{
    if (ws && ws.readyState == SR_OPEN) {
        [ws send:message];
    } else {
        [queuedMessages addObject: message];
    }
}

- (void)listen:(void (^)(id))listener
{
    [listeners addObject:listener];
}

- (void)open:(NSURL*)aUrl withToken:(NSString*)token
{
    if (ws) {
        return;
    }
    
    url = aUrl;
    serverToken = token;
    NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:url];
    [request setValue:@"Gailan" forHTTPHeaderField:@"Origin"];
    if (token) {
        [request
            setValue:[NSString stringWithFormat:@"token=%@", token]
            forHTTPHeaderField:@"Cookie"
        ];
    }
    ws = [[SRWebSocket alloc] initWithURLRequest: request];
    ws.delegate = self;
    [ws open];
}

- (void)close
{
    if (ws) {
        ws.delegate = nil;
        [ws close];
        ws = nil;
        url = nil;
    }
}

- (void)reopen
{
    [self close];
    if (url) {
        [self open:url withToken:serverToken];
    }
}

- (void)webSocketDidOpen:(SRWebSocket *)webSocket
{
    for (id message in queuedMessages) {
        [ws send:message];
    }
    
    [queuedMessages removeAllObjects];
}

- (void)webSocket:(SRWebSocket *)webSocket didReceiveMessage:(id)message
{
    for (void (^listener)(id) in listeners) {
        listener(message);
    }
}

- (void)webSocket:(SRWebSocket *)webSocket didFailWithError:(NSError *)error
{
    [webSocket close];
    [self
        performSelector:@selector(reopen)
        withObject:nil
        afterDelay: 0.1
    ];
}

- (void)webSocket:(SRWebSocket *)webSocket
    didCloseWithCode:(NSInteger)code
    reason:(NSString *)reason
    wasClean:(BOOL)wasClean
{

    [self
        performSelector:@selector(reopen)
        withObject:nil
        afterDelay: 0.1
    ];
}

@end
