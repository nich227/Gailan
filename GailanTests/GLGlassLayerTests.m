//
//  GLGlassLayerTests.m
//  GailanTests
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

#import <XCTest/XCTest.h>
#import "GLGlassLayer.h"

@interface GLGlassLayerTests : XCTestCase
@end

@implementation GLGlassLayerTests {
    GLGlassLayer* layer;
}

- (void)setUp
{
    [super setUp];
    layer = [[GLGlassLayer alloc] initWithFrame:NSMakeRect(0, 0, 1000, 800)];
}

- (NSArray*)regionWithId:(NSString*)rid y:(CGFloat)y height:(CGFloat)h
{
    return @[@{
        @"id": rid,
        @"x": @100,
        @"y": @(y),
        @"w": @300,
        @"h": @(h),
        @"radius": @12
    }];
}

- (void)testOffDrawsNothing
{
    // the default: a widget can ask, and nothing answers
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    XCTAssertEqual(layer.subviews.count, 0);
}

- (void)testRegionBecomesAViewInAppKitCoordinates
{
    [layer setMaterialName:@"frosted" clear:NO tint:nil];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];

    XCTAssertEqual(layer.subviews.count, 1);
    NSRect frame = [layer.subviews[0] frame];
    XCTAssertEqual(frame.origin.x, 100);
    // css y counts down from the top: 800 - (50 + 200)
    XCTAssertEqual(frame.origin.y, 550);
    XCTAssertEqual(frame.size.width, 300);
    XCTAssertEqual(frame.size.height, 200);
}

- (void)testMovingAWidgetReusesItsView
{
    [layer setMaterialName:@"frosted" clear:NO tint:nil];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    NSView* first = layer.subviews[0];

    [layer setRegions:[self regionWithId:@"a" y:90 height:200]];

    XCTAssertEqual(layer.subviews.count, 1);
    XCTAssertEqual(layer.subviews[0], first, @"same view, moved");
    XCTAssertEqual([layer.subviews[0] frame].origin.y, 510);
}

- (void)testWithdrawnRegionsAreRemoved
{
    [layer setMaterialName:@"frosted" clear:NO tint:nil];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    XCTAssertEqual(layer.subviews.count, 1);

    [layer setRegions:@[]];
    XCTAssertEqual(layer.subviews.count, 0);
}

- (void)testTurningItOffClearsWhatWasThere
{
    [layer setMaterialName:@"frosted" clear:NO tint:nil];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    XCTAssertEqual(layer.subviews.count, 1);

    [layer setMaterialName:@"off" clear:NO tint:nil];
    XCTAssertEqual(layer.subviews.count, 0);
}

- (void)testJunkRegionsAreIgnored
{
    [layer setMaterialName:@"frosted" clear:NO tint:nil];
    [layer setRegions:@[
        @{@"id": @42, @"x": @0, @"y": @0, @"w": @10, @"h": @10},
        @{@"id": @"flat", @"x": @0, @"y": @0, @"w": @0, @"h": @0},
        @{@"id": @"ok", @"x": @0, @"y": @0, @"w": @10, @"h": @10}
    ]];

    XCTAssertEqual(layer.subviews.count, 1, @"only the usable one");
}

@end
