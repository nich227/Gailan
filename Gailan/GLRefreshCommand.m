//
//  GLRefreshCommand.m
//  Gailan
//
//  Created by Felix Hageloh on 2/1/17.
//  Copyright © 2017 tracesOf. All rights reserved.
//

#import "GLRefreshCommand.h"
#import "GLAppDelegate.h"

@implementation GLRefreshCommand

-(id)performDefaultImplementation
{
    [(GLAppDelegate*)[NSApp delegate] refreshWidgets:self];
    return nil;
}

@end
