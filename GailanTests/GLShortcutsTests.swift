//
//  GLShortcutsTests.swift
//  GailanTests
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

import AppIntents
import XCTest

@testable import Gailan

// The tests run inside the app, so the intents see the real delegate and the
// real widget store. Declaring an action is not the same as it working, which
// is what these check.
final class GLShortcutsTests: XCTestCase {
    private let seeded = ["alpha-widget", "beta-widget"]
    private var widgets: [GLWidgetForScripting] = []

    // The app fetches its real state from the server just after launch and
    // resets the store, so anything seeded there gets wiped mid-test. These
    // hand the actions a known list instead.
    override func setUp() {
        super.setUp()
        widgets = [
            GLWidgetForScripting(
                id: "alpha-widget",
                andSettings: ["hidden": false, "showOnAllScreens": true]
            ),
            GLWidgetForScripting(
                id: "beta-widget",
                andSettings: ["hidden": true, "showOnMainScreen": true]
            ),
        ]
        WidgetLookup.all = { [widgets] in widgets }
    }

    override func tearDown() {
        WidgetLookup.all = {
            guard let delegate = NSApp.delegate as? GLAppDelegate else { return [] }
            return (delegate.widgets as? [GLWidgetForScripting]) ?? []
        }
        super.tearDown()
    }

    private func anyWidgetId() throws -> String {
        try XCTUnwrap(widgets.first?.id)
    }

    func testQueryOffersTheWidgetsOnScreen() async throws {
        let suggested = try await WidgetQuery().suggestedEntities()
            .map(\.id)
            .sorted()

        XCTAssertEqual(suggested, seeded, "the picker lists the live widgets")
    }

    func testQueryLooksUpByIdentifier() async throws {
        let id = try anyWidgetId()

        let found = try await WidgetQuery().entities(for: [id])
        XCTAssertEqual(found.map(\.id), [id])

        let missing = try await WidgetQuery().entities(for: ["not-a-widget"])
        XCTAssertTrue(missing.isEmpty, "unknown ids resolve to nothing")
    }

    func testQueryMatchesOnText() async throws {
        let id = try anyWidgetId()
        let fragment = String(id.prefix(4)).uppercased()

        let matched = try await WidgetQuery().entities(matching: fragment)
        XCTAssertTrue(
            matched.contains { $0.id == id },
            "matching ignores case"
        )
    }

    func testRefreshingEverythingRuns() async throws {
        let intent = RefreshAllWidgetsIntent()
        _ = try await intent.perform()
    }

    func testRefreshingOneWidgetRuns() async throws {
        let intent = RefreshWidgetIntent()
        intent.widget = WidgetEntity(id: try anyWidgetId())
        _ = try await intent.perform()
    }

    func testReloadingOneWidgetRuns() async throws {
        let intent = ReloadWidgetIntent()
        intent.widget = WidgetEntity(id: try anyWidgetId())
        _ = try await intent.perform()
    }

    func testLayerReachesTheWidget() async throws {
        let id = try anyWidgetId()

        let back = SetWidgetLayerIntent()
        back.widget = WidgetEntity(id: id)
        back.layer = .behindWindows
        _ = try await back.perform()
        XCTAssertTrue(widgets[0].inBackground, "sending it back reached the widget")

        let front = SetWidgetLayerIntent()
        front.widget = WidgetEntity(id: id)
        front.layer = .inFront
        _ = try await front.perform()
        XCTAssertFalse(widgets[0].inBackground, "bringing it forward reached it too")
    }

    func testASettingReachesTheWidget() async throws {
        let intent = SetWidgetSettingIntent()
        intent.widget = WidgetEntity(id: try anyWidgetId())
        intent.key = "face"
        intent.value = "analog"
        // nothing to read back: the value is dispatched to the store, and a widget
        // that is not there is the failure worth checking
        _ = try await intent.perform()
    }

    /// A shortcut hands over text, so "true" has to become a boolean and "12" a
    /// number before it reaches a widget that declared a toggle or a number.
    func testTextValuesBecomeWhatTheyLookLike() async throws {
        for spoken in ["true", "TRUE", "yes", "on", "false", "off", "12", "1.5", "anything"] {
            let intent = SetWidgetSettingIntent()
            intent.widget = WidgetEntity(id: try anyWidgetId())
            intent.key = "draggable"
            intent.value = spoken
            _ = try await intent.perform()
        }
    }

    func testSettingAWidgetThatIsNotThereFails() async throws {
        let intent = SetWidgetSettingIntent()
        intent.widget = WidgetEntity(id: "no-such-widget")
        intent.key = "face"
        intent.value = "analog"

        do {
            _ = try await intent.perform()
            XCTFail("it should have refused")
        } catch {
            // which is the point
        }
    }

    func testOpeningTheFileOfAWidgetThatIsNotThereFails() async throws {
        let intent = OpenWidgetFileIntent()
        intent.widget = WidgetEntity(id: "no-such-widget")

        do {
            _ = try await intent.perform()
            XCTFail("it should have refused")
        } catch {
            // which is the point
        }
    }

    func testVisibilityReachesTheWidget() async throws {
        let id = try anyWidgetId()

        let hide = SetWidgetVisibilityIntent()
        hide.widget = WidgetEntity(id: id)
        hide.visible = false
        _ = try await hide.perform()
        XCTAssertTrue(widgets[0].hidden, "hiding reached the widget")

        let show = SetWidgetVisibilityIntent()
        show.widget = WidgetEntity(id: id)
        show.visible = true
        _ = try await show.perform()
        XCTAssertFalse(widgets[0].hidden, "and showing it again")
    }

    func testScreenChoiceReachesTheWidget() async throws {
        let id = try anyWidgetId()

        let toAll = SetWidgetScreensIntent()
        toAll.widget = WidgetEntity(id: id)
        toAll.screens = .allScreens
        _ = try await toAll.perform()
        XCTAssertTrue(widgets[0].showOnAllScreens)

        let toMain = SetWidgetScreensIntent()
        toMain.widget = WidgetEntity(id: id)
        toMain.screens = .mainScreen
        _ = try await toMain.perform()
        XCTAssertTrue(widgets[0].showOnMainScreen)
    }

    func testActingOnAMissingWidgetFails() async throws {
        let intent = RefreshWidgetIntent()
        intent.widget = WidgetEntity(id: "not-a-widget")

        do {
            _ = try await intent.perform()
            XCTFail("should have refused an unknown widget")
        } catch let error as GailanIntentError {
            switch error {
            case .noSuchWidget(let id):
                XCTAssertEqual(id, "not-a-widget")
            case .notRunning:
                XCTFail("the app is what is running the test")
            }
        }
    }
}

// MARK: - a setting reading what was stored for it

extension GLShortcutsTests {
    /* Renaming an option is the ordinary way this happens: a widget offered auto and
       offers follow now, and somebody has auto saved. A picker with no selection is
       worse than the widget's own answer. */
    func testStoredValueNoLongerOfferedFallsBack() throws {
        let setting = WidgetSetting([
            "key": "background",
            "type": "list",
            "label": "Background",
            "default": "follow",
            "options": [
                ["value": "follow", "label": "Follow system"],
                ["value": "light", "label": "Light"],
                ["value": "dark", "label": "Dark"],
            ],
        ])

        let unwrapped = try XCTUnwrap(setting)

        XCTAssertEqual(unwrapped.resolved("dark"), "dark", "one it offers is kept")
        XCTAssertEqual(unwrapped.resolved("auto"), "follow", "one it dropped falls back")
        XCTAssertEqual(unwrapped.resolved(nil), "follow", "nothing stored is the default")
    }

    func testASettingWithNoOptionsKeepsWhateverWasStored() throws {
        let setting = try XCTUnwrap(WidgetSetting([
            "key": "accent",
            "type": "color",
            "label": "Accent",
            "default": "#d71921ff",
        ]))

        XCTAssertEqual(
            setting.resolved("#00ff88ff"), "#00ff88ff",
            "a colour is not one of a list, so it is taken as it is"
        )
        XCTAssertEqual(setting.resolved(nil), "#d71921ff", "and falls back to the default")
    }

    /* The clock's case: 12 or 24 hours means nothing on a dial, so it is offered and
       greyed while the face is analog. */
    func testASettingIsUsableOnlyWhileItsConditionHolds() throws {
        let setting = try XCTUnwrap(
            WidgetSetting([
                "key": "hours",
                "type": "choice",
                "label": "Hours",
                "default": "12",
                "options": [["value": "12", "label": "12"], ["value": "24", "label": "24"]],
                "enabledWhen": ["face": "digital"],
            ]))

        XCTAssertTrue(
            setting.isEnabled { _ in "digital" }, "the face it asked for makes it usable")
        XCTAssertFalse(setting.isEnabled { _ in "analog" }, "any other face greys it")
    }

    func testAConditionOnSeveralSettingsNeedsThemAll() throws {
        let setting = try XCTUnwrap(
            WidgetSetting([
                "key": "seconds",
                "type": "toggle",
                "label": "Show seconds",
                "enabledWhen": ["face": ["digital", "dots"], "compact": false],
            ]))

        let values = ["face": "dots", "compact": "false"]

        XCTAssertTrue(
            setting.isEnabled { values[$0] },
            "one of the faces it accepts, and the other condition met"
        )
        XCTAssertFalse(
            setting.isEnabled { $0 == "face" ? "analog" : "false" },
            "a face it does not accept is enough to grey it"
        )
        XCTAssertFalse(
            setting.isEnabled { $0 == "face" ? "dots" : "true" },
            "so is the second condition going the other way"
        )
    }

    /* A manifest naming a key the widget never declares is a mistake in the manifest.
       Greying the control on it would leave somebody with a setting they cannot reach
       and no way to see why. */
    func testAConditionOnAnUnknownSettingIsIgnored() throws {
        let setting = try XCTUnwrap(
            WidgetSetting([
                "key": "hours",
                "type": "choice",
                "label": "Hours",
                "options": [["value": "12", "label": "12"]],
                "enabledWhen": ["fase": "digital"],
            ]))

        XCTAssertTrue(setting.isEnabled { _ in nil }, "a key that is not there is skipped")
    }

    func testASettingWithoutAConditionIsAlwaysUsable() throws {
        let setting = try XCTUnwrap(
            WidgetSetting(["key": "opacity", "type": "number", "label": "Fill"]))

        XCTAssertTrue(setting.isEnabled { _ in nil })
        XCTAssertTrue(setting.enabledWhen.isEmpty, "and it carries no conditions")
    }
}
