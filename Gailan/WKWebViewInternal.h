/*
 * Reaches _pageForTesting, which is how the debug console gets at the page
 * behind a web view. Declared as a category on the real class: redeclaring
 * WKWebView outright, as this header used to, conflicts with WebKit's own
 * definition once anything imports the framework.
 *
 * See https://github.com/WebKit/webkit/blob/master/Source/WebKit2/UIProcess/API/Cocoa/WKWebViewInternal.h
 * Copyright (C) 2010 Apple Inc. All rights reserved.
 */

#ifndef WKWebViewInternal_h
#define WKWebViewInternal_h

#import <WebKit/WebKit.h>
#include "WKBase.h"

@interface WKWebView (GailanInternal)
- (WKPageRef)_pageForTesting;
@end

#endif
