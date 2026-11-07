//
//  GLNodeRuntimeTests.m
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
#import "GLNodeRuntime.h"

@interface GLNodeRuntimeTests : XCTestCase
@end

@implementation GLNodeRuntimeTests

- (BOOL)accepts:(NSString*)candidate
{
    return [GLNodeRuntime acceptsVersion:candidate bundled:@"26.13.0"];
}

- (void)testTheBundledVersionItselfIsAccepted
{
    XCTAssertTrue([self accepts:@"26.13.0"]);
}

- (void)testANewerReleaseOfTheSameMajorIsAccepted
{
    XCTAssertTrue([self accepts:@"26.13.1"]);
    XCTAssertTrue([self accepts:@"26.14.0"]);
}

- (void)testAnOlderReleaseOfTheSameMajorIsRefused
{
    XCTAssertFalse([self accepts:@"26.12.9"]);
    XCTAssertFalse([self accepts:@"26.0.0"]);
}

- (void)testAHigherEvenMajorIsAccepted
{
    XCTAssertTrue([self accepts:@"28.0.0"]);
}

// a newer minor elsewhere must not be read as newer when the major is behind
- (void)testALowerEvenMajorIsRefused
{
    XCTAssertFalse([self accepts:@"24.99.99"]);
}

- (void)testAnOddMajorIsRefusedEvenWhenNewer
{
    XCTAssertFalse([self accepts:@"27.0.0"]);
    XCTAssertFalse([self accepts:@"29.5.1"]);
}

- (void)testAVPrefixIsTolerated
{
    XCTAssertTrue([self accepts:@"v26.13.0"]);
    XCTAssertTrue([GLNodeRuntime acceptsVersion:@"26.13.0" bundled:@"v26.13.0"]);
    XCTAssertFalse([self accepts:@"v24.0.0"]);
}

- (void)testSurroundingWhitespaceIsTolerated
{
    XCTAssertTrue([self accepts:@"26.13.0\n"]);
}

- (void)testAnythingThatIsNotAVersionIsRefused
{
    XCTAssertFalse([self accepts:nil]);
    XCTAssertFalse([self accepts:@""]);
    XCTAssertFalse([self accepts:@"node"]);
    XCTAssertFalse([self accepts:@"26"]);
    XCTAssertFalse([self accepts:@"26.13"]);
    XCTAssertFalse([self accepts:@"26.13.0.1"]);
    XCTAssertFalse([self accepts:@"26.13.0-pre"]);
    XCTAssertFalse([self accepts:@"26..0"]);
    XCTAssertFalse([self accepts:@"-26.13.0"]);
}

- (void)testAnUnreadableBundledVersionRefusesEverything
{
    XCTAssertFalse([GLNodeRuntime acceptsVersion:@"26.13.0" bundled:nil]);
    XCTAssertFalse([GLNodeRuntime acceptsVersion:@"26.13.0" bundled:@""]);
    XCTAssertFalse([GLNodeRuntime acceptsVersion:@"26.13.0" bundled:@"garbage"]);
}

@end
