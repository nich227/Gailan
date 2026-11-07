//
//  GLNodeRuntime.h
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.

#import <Foundation/Foundation.h>

/* Which node the widget server runs on: the bundled one behind localnode, or, with
   useSystemNode on, an installed node that is at least as new as the bundled one. */
@interface GLNodeRuntime : NSObject

/* Resolves afresh, probing the system node when the preference asks for it, and logs
   what was chosen. Blocks for as long as the probe takes, a few seconds at worst. */
+ (NSString*)executablePath;

/* What the last executablePath answered, without probing again; localnode before the
   server has been started. */
+ (NSString*)chosenPath;

/* A pure function. Accepts only an even major at least the bundled major, and on the
   same major a version at least the bundled one. */
+ (BOOL)acceptsVersion:(NSString*)candidate bundled:(NSString*)bundled;

@end
