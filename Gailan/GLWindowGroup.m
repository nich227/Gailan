//
//  GLWindowGroup.m
//  Gailan
//
//  Created by Felix Hageloh on 05/10/2020.
//  Copyright © 2020 tracesOf. All rights reserved.
//  Copyright (c) 2026 Kevin Chen.
//

#import "GLWindowGroup.h"
#import "GLWindow.h"

@implementation GLWindowGroup

@synthesize foreground;
@synthesize background;


- (id)initWithInteractionEnabled:(BOOL)interactionEnabled
{
    self = [super init];
    if (self) {
        if (interactionEnabled) {
            foreground = [[GLWindow alloc]
                initWithWindowType: GLWindowTypeForeground
            ];
            [foreground orderFront:self];
        }
        
        background = [[GLWindow alloc]
            initWithWindowType: interactionEnabled
                ? GLWindowTypeBackground
                : GLWindowTypeAgnostic
        ];
        [background orderFront:self];
    }
    return self;
}

- (void)setGlassMaterial:(NSString*)name
                   style:(NSString*)style
                    tint:(NSColor*)tint
                 opacity:(double)opacity
{
    [foreground setGlassMaterial:name style:style tint:tint opacity:opacity];
    [background setGlassMaterial:name style:style tint:tint opacity:opacity];
}

- (void)setAlwaysOnTop:(BOOL)flag
{
    [foreground setAlwaysOnTop:flag];
    [background setAlwaysOnTop:flag];
}

- (void)close
{
    [foreground close];
    [background close];
}

- (void)reload
{
    [foreground reload];
    [background reload];
}

- (void)loadUrl:(NSURL*)url
{
    [foreground loadUrl: url];
    [background loadUrl: url];
}

- (void)setFrame:(NSRect)frame display:(BOOL)flag
{
    [foreground setFrame:frame display:flag];
    [background setFrame:frame display:flag];
}

- (void)wallpaperChanged
{
    [foreground wallpaperChanged];
    [background wallpaperChanged];
}

- (void)applySystemAccent
{
    [foreground applySystemAccent];
    [background applySystemAccent];
}

- (void)workspaceChanged
{
    [foreground workspaceChanged];
    [background workspaceChanged];
}

@end
