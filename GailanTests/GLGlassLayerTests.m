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
#import "GLPreferencesController.h"

/* Private to the layer, named here so the tests can ask it what it worked out rather
   than inferring it from what got drawn. */
@interface GLGlassLayer (Testing)
- (NSString*)resolvedStyle;
- (NSColor*)effectiveTintForStyle:(NSString*)style;
- (void)systemAppearanceChanged;
- (void)rebuild;
@end

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
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];
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
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    NSView* first = layer.subviews[0];

    [layer setRegions:[self regionWithId:@"a" y:90 height:200]];

    XCTAssertEqual(layer.subviews.count, 1);
    XCTAssertEqual(layer.subviews[0], first, @"same view, moved");
    XCTAssertEqual([layer.subviews[0] frame].origin.y, 510);
}

- (void)testWithdrawnRegionsAreRemoved
{
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    XCTAssertEqual(layer.subviews.count, 1);

    [layer setRegions:@[]];
    XCTAssertEqual(layer.subviews.count, 0);
}

- (void)testTurningItOffClearsWhatWasThere
{
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];
    [layer setRegions:[self regionWithId:@"a" y:50 height:200]];
    XCTAssertEqual(layer.subviews.count, 1);

    [layer setMaterialName:@"off" style:@"regular" tint:nil opacity:1.0];
    XCTAssertEqual(layer.subviews.count, 0);
}

- (void)testJunkRegionsAreIgnored
{
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];
    [layer setRegions:@[
        @{@"id": @42, @"x": @0, @"y": @0, @"w": @10, @"h": @10},
        @{@"id": @"flat", @"x": @0, @"y": @0, @"w": @0, @"h": @0},
        @{@"id": @"ok", @"x": @0, @"y": @0, @"w": @10, @"h": @10}
    ]];

    XCTAssertEqual(layer.subviews.count, 1, @"only the usable one");
}


/* Following the system means reading what macOS is set to rather than asking twice.
   The names it uses carry the appearance as well as the style, so a name is read for
   what it says. */
- (void)testFollowingTheSystemReadsTheLiquidGlassSetting
{
    GLGlassLayer* layer = [[GLGlassLayer alloc]
        initWithFrame: NSMakeRect(0, 0, 400, 400)
    ];

    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id before = [defaults objectForKey:@"NSGlassDiffusionSetting"];

    [defaults setInteger:0 forKey:@"NSGlassDiffusionSetting"];
    [layer setMaterialName:@"frosted" style:@"follow" tint:nil opacity:1.0];
    XCTAssertEqualObjects([layer resolvedStyle], @"clear",
                          @"a clear system reads as clear glass");

    [defaults setInteger:1 forKey:@"NSGlassDiffusionSetting"];
    XCTAssertEqualObjects([layer resolvedStyle], @"tinted",
                          @"a tinted system reads as tinted glass");

    [defaults removeObjectForKey:@"NSGlassDiffusionSetting"];
    XCTAssertEqualObjects([layer resolvedStyle], @"clear",
                          @"nothing stored is clear, which is what macOS defaults to and "
                          @"what every system older than 26.1 looks like");

    if (before) {
        [defaults setObject:before forKey:@"NSGlassDiffusionSetting"];
    } else {
        [defaults removeObjectForKey:@"NSGlassDiffusionSetting"];
    }
}

/* A style chosen outright is held whatever the system says. */
- (void)testAChosenStyleIgnoresTheSystem
{
    GLGlassLayer* layer = [[GLGlassLayer alloc]
        initWithFrame: NSMakeRect(0, 0, 400, 400)
    ];

    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id before = [defaults objectForKey:@"NSGlassDiffusionSetting"];
    [defaults setInteger:0 forKey:@"NSGlassDiffusionSetting"];

    [layer setMaterialName:@"frosted" style:@"tinted" tint:nil opacity:1.0];
    XCTAssertEqualObjects([layer resolvedStyle], @"tinted",
                          @"tinted stays tinted next to a clear system");

    if (before) {
        [defaults setObject:before forKey:@"NSGlassDiffusionSetting"];
    } else {
        [defaults removeObjectForKey:@"NSGlassDiffusionSetting"];
    }
}

/* The two choices macOS offers differ in exactly this: clear glass carries no tint and
   tinted glass carries one. The color is never asked of the user, so there is nothing to
   fall back to and nothing to borrow. */
- (void)testClearCarriesNoTintAndTintedCarriesTheOneItWasGiven
{
    NSColor* wallpaper = [NSColor colorWithSRGBRed:0.36 green:0.33 blue:0.24 alpha:0.35];

    [layer setMaterialName:@"frosted" style:@"tinted" tint:wallpaper opacity:1.0];
    XCTAssertEqualObjects(
        [layer effectiveTintForStyle:@"tinted"], wallpaper,
        @"tinted glass wears the color it was handed, which is the wallpaper's"
    );

    XCTAssertNil(
        [layer effectiveTintForStyle:@"clear"],
        @"and clear glass wears none, whatever it was handed"
    );
}


/* Changing the Icon & widget style in System Settings has to show up without anything
   else happening. There is no notification for it, so the layer watches the defaults;
   what this checks is the outcome, that the glass is rebuilt and is there afterwards. */
- (void)testFollowingTheSystemRepaintsWhenTheSystemChanges
{
    GLGlassLayer* layer = [[GLGlassLayer alloc]
        initWithFrame: NSMakeRect(0, 0, 400, 400)
    ];
    [layer setMaterialName:@"frosted" style:@"follow" tint:nil opacity:1.0];

    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id before = [defaults objectForKey:@"NSGlassDiffusionSetting"];
    [defaults setInteger:0 forKey:@"NSGlassDiffusionSetting"];

    [layer setRegions:@[@{
        @"id": @"widget", @"x": @10, @"y": @10, @"w": @100, @"h": @80, @"radius": @18
    }]];
    XCTAssertEqual(layer.subviews.count, 1UL, @"one claim, one glass view");
    NSView* first = layer.subviews.firstObject;
    XCTAssertEqualObjects([layer resolvedStyle], @"clear", @"following a clear system");

    // the system becomes tinted, which is a different glass
    [defaults setInteger:1 forKey:@"NSGlassDiffusionSetting"];

    XCTAssertEqualObjects([layer resolvedStyle], @"tinted", @"the layer reads the change");
    XCTAssertEqual(layer.subviews.count, 1UL,
                   @"and the glass is still there rather than gone until something moves");
    XCTAssertNotEqual(layer.subviews.firstObject, first,
                      @"built again, because the style it was built from changed");

    if (before) {
        [defaults setObject:before forKey:@"NSGlassDiffusionSetting"];
    } else {
        [defaults removeObjectForKey:@"NSGlassDiffusionSetting"];
    }
}

/* The setting is written whenever anything in the Appearance pane is touched, so a value
   arriving that comes to the same glass has to leave the standing views alone. Rebuilding
   on every write would discard glass a widget is sitting behind for no reason. */
- (void)testAChangeThatComesToTheSameGlassIsLeftAlone
{
    GLGlassLayer* layer = [[GLGlassLayer alloc]
        initWithFrame: NSMakeRect(0, 0, 400, 400)
    ];
    [layer setMaterialName:@"frosted" style:@"follow" tint:nil opacity:1.0];

    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id before = [defaults objectForKey:@"NSGlassDiffusionSetting"];
    [defaults setInteger:0 forKey:@"NSGlassDiffusionSetting"];

    [layer setRegions:@[@{
        @"id": @"widget", @"x": @10, @"y": @10, @"w": @100, @"h": @80, @"radius": @18
    }]];
    NSView* first = layer.subviews.firstObject;

    // written again with what it already held
    [defaults setInteger:0 forKey:@"NSGlassDiffusionSetting"];

    XCTAssertEqual(layer.subviews.firstObject, first,
                   @"same glass either way, so the view it had is the view it keeps");

    if (before) {
        [defaults setObject:before forKey:@"NSGlassDiffusionSetting"];
    } else {
        [defaults removeObjectForKey:@"NSGlassDiffusionSetting"];
    }
}

/* Turning glass on, or changing its style, used to clear the views and wait for the page
   to report regions again, which only happens when a widget moves. */
- (void)testChangingTheSettingsPutsTheGlassBackAtOnce
{
    GLGlassLayer* layer = [[GLGlassLayer alloc]
        initWithFrame: NSMakeRect(0, 0, 400, 400)
    ];
    [layer setMaterialName:@"off" style:@"regular" tint:nil opacity:1.0];
    [layer setRegions:@[@{
        @"id": @"widget", @"x": @10, @"y": @10, @"w": @100, @"h": @80, @"radius": @18
    }]];
    XCTAssertEqual(layer.subviews.count, 0UL, @"off, so nothing is drawn");

    // glass is turned on, and the page has said nothing new
    [layer setMaterialName:@"frosted" style:@"regular" tint:nil opacity:1.0];

    XCTAssertEqual(layer.subviews.count, 1UL,
                   @"the claim it already knew about is answered straight away");
}


/* Turning glass on, or changing its style, discarded the standing views and stopped
   there. Regions live in the page and are only sent when they change, so the desktop
   stayed bare until a widget happened to move. */
- (void)testRebuildingPutsTheGlassBack
{
    [layer setMaterialName:@"frosted"
                     style:@"regular"
                      tint:nil
                   opacity:1.0];
    [layer setRegions:[self regionWithId:@"one" y:100 height:80]];
    XCTAssertEqual(layer.subviews.count, 1UL, @"a region asks for a view");

    [layer rebuild];

    XCTAssertEqual(
        layer.subviews.count, 1UL,
        @"and the view is there again without the page reporting anything"
    );
}

- (void)testRebuildingWithNothingReportedDrawsNothing
{
    [layer setMaterialName:@"frosted"
                     style:@"regular"
                      tint:nil
                   opacity:1.0];

    [layer rebuild];

    XCTAssertEqual(layer.subviews.count, 0UL, @"no regions, no views");
}

/* The colour macOS draws for each choice, each one read from a fresh process while
   System Settings was set to it. NSColor's controlAccentColor is settled once per
   process and goes stale the moment the choice changes, so the app reads the
   preference itself and this table is what it answers with. A CSS AccentColor in a
   WKWebView is no help either: it reports the default blue whatever macOS is set to.
*/
- (void)testTheAccentTableMatchesWhatMacOSDraws
{
    NSDictionary<NSNumber*, NSString*>* expected = @{
        @(-1): @"8c8c8c",
        @(0): @"ff5257",
        @(1): @"f7821b",
        @(2): @"ffc600",
        @(3): @"62ba46",
        @(4): @"007aff",
        @(5): @"a550a7",
        @(6): @"f74f9e",
    };

    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id restore = [defaults objectForKey:@"AppleAccentColor"];

    for (NSNumber* choice in expected) {
        [defaults setObject:choice forKey:@"AppleAccentColor"];

        NSColor* answered = [[GLPreferencesController systemAccentColor]
            colorUsingColorSpace:[NSColorSpace sRGBColorSpace]];
        NSString* hex = [NSString
            stringWithFormat:@"%02x%02x%02x",
                             (int)round(answered.redComponent * 255),
                             (int)round(answered.greenComponent * 255),
                             (int)round(answered.blueComponent * 255)];

        XCTAssertEqualObjects(
            hex, expected[choice], @"choice %@ draws as #%@", choice, expected[choice]
        );
    }

    /* nothing chosen is multicolour, which macOS draws blue */
    [defaults removeObjectForKey:@"AppleAccentColor"];
    NSColor* multicolour = [[GLPreferencesController systemAccentColor]
        colorUsingColorSpace:[NSColorSpace sRGBColorSpace]];
    XCTAssertEqual(
        (int)round(multicolour.blueComponent * 255), 255,
        @"multicolour draws as the blue"
    );

    if (restore) {
        [defaults setObject:restore forKey:@"AppleAccentColor"];
    } else {
        [defaults removeObjectForKey:@"AppleAccentColor"];
    }
}


/* AppleReduceDesktopTinting counts the other way round: 1 means reduce the tinting, so
   absent or 0 means macOS is tinting window backgrounds with the wallpaper. Reading it
   the wrong way would tint exactly when the user asked for less. */
- (void)testTheSystemTintingFlagIsReadTheRightWayRound
{
    NSUserDefaults* defaults = [NSUserDefaults standardUserDefaults];
    id restore = [defaults objectForKey:@"AppleReduceDesktopTinting"];

    [defaults setBool:YES forKey:@"AppleReduceDesktopTinting"];
    XCTAssertFalse(
        [GLPreferencesController systemTintsWindowBackgrounds],
        @"reduce tinting on means the system is not tinting"
    );

    [defaults setBool:NO forKey:@"AppleReduceDesktopTinting"];
    XCTAssertTrue([GLPreferencesController systemTintsWindowBackgrounds]);

    [defaults removeObjectForKey:@"AppleReduceDesktopTinting"];
    XCTAssertTrue(
        [GLPreferencesController systemTintsWindowBackgrounds],
        @"and nothing stored means it is tinting, which is the macOS default"
    );

    if (restore) [defaults setObject:restore forKey:@"AppleReduceDesktopTinting"];
}

/* AppKit will not hand over the tint it uses, so the wallpaper is averaged into a single
   pixel. The alpha is held well down, since a tint at full strength stops glass reading
   as glass. */
- (void)testTheWallpaperIsSampledForATint
{
    NSColor* tint = [GLPreferencesController wallpaperTint];

    if (!NSScreen.mainScreen
        || ![[NSWorkspace sharedWorkspace] desktopImageURLForScreen:NSScreen.mainScreen]) {
        XCTAssertNil(tint, @"no wallpaper to read means no tint");
        return;
    }

    XCTAssertNotNil(tint, @"a readable wallpaper gives a colour");
    XCTAssertEqualWithAccuracy(tint.alphaComponent, 0.35, 0.001);
    XCTAssertEqualObjects(
        [GLPreferencesController wallpaperTint], tint,
        @"and asking again gives the same one rather than reading the picture afresh"
    );
}

@end
