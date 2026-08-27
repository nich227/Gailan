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
    private var delegate: GLAppDelegate {
        NSApp.delegate as! GLAppDelegate
    }

    private var store: GLWidgetsStore {
        delegate.value(forKey: "widgetsStore") as! GLWidgetsStore
    }

    private let seeded = ["alpha-widget", "beta-widget"]

    // The host app has only just launched, so nothing has been bundled yet.
    // Seeding the store keeps these from depending on load timing or on
    // whatever happens to be in the widget folder.
    override func setUp() {
        super.setUp()
        store.reset([
            "widgets": [
                "alpha-widget": ["id": "alpha-widget"],
                "beta-widget": ["id": "beta-widget"],
            ],
            "settings": [
                "alpha-widget": ["hidden": false, "showOnAllScreens": true],
                "beta-widget": ["hidden": true, "showOnMainScreen": true],
            ],
        ])
    }

    override func tearDown() {
        store.reset(["widgets": [:], "settings": [:]])
        super.tearDown()
    }

    private func anyWidgetId() throws -> String {
        let widgets = (delegate.widgets as? [GLWidgetForScripting]) ?? []
        return try XCTUnwrap(widgets.first?.id, "the store was not seeded")
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

    func testVisibilityReachesTheWidget() async throws {
        let id = try anyWidgetId()

        let hide = SetWidgetVisibilityIntent()
        hide.widget = WidgetEntity(id: id)
        hide.visible = false
        _ = try await hide.perform()

        let show = SetWidgetVisibilityIntent()
        show.widget = WidgetEntity(id: id)
        show.visible = true
        _ = try await show.perform()
    }

    func testScreenChoiceReachesTheWidget() async throws {
        let id = try anyWidgetId()

        for choice in [WidgetScreens.allScreens, .mainScreen] {
            let intent = SetWidgetScreensIntent()
            intent.widget = WidgetEntity(id: id)
            intent.screens = choice
            _ = try await intent.perform()
        }
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
            }
        }
    }
}
