//
//  GLWidgetUpdatesTests.swift
//  GailanTests
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

import XCTest

@testable import Gailan

final class GLWidgetUpdatesTests: XCTestCase {
    private var widgetDir: URL!

    override func setUpWithError() throws {
        widgetDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("widget-updates-\(UUID().uuidString)")
        try FileManager.default.createDirectory(
            at: widgetDir,
            withIntermediateDirectories: true
        )
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: widgetDir)
    }

    private func install(
        folder: String,
        name: String? = nil,
        version: String?
    ) throws {
        let dir = widgetDir.appendingPathComponent(folder)
        try FileManager.default.createDirectory(
            at: dir,
            withIntermediateDirectories: true
        )

        var manifest: [String: Any] = ["name": name ?? folder, "title": folder]
        if let version { manifest["version"] = version }

        try JSONSerialization
            .data(withJSONObject: manifest)
            .write(to: dir.appendingPathComponent("widget.json"))
    }

    // MARK: - comparing versions

    func testANewerVersionWins() {
        XCTAssertTrue(versionIsNewer("1.0.1", than: "1.0.0"))
        XCTAssertTrue(versionIsNewer("1.1.0", than: "1.0.9"))
        XCTAssertTrue(versionIsNewer("2.0.0", than: "1.9.9"))
    }

    func testTheSameVersionIsNotAnUpdate() {
        XCTAssertFalse(versionIsNewer("1.2.3", than: "1.2.3"))
    }

    func testAnOlderVersionIsNotAnUpdate() {
        XCTAssertFalse(versionIsNewer("1.0.0", than: "1.0.1"))
        XCTAssertFalse(versionIsNewer("1.9.9", than: "2.0.0"))
    }

    // the reason not to compare these as strings: "10" sorts before "9"
    func testTwoDigitPartsCompareAsNumbers() {
        XCTAssertTrue(versionIsNewer("1.0.10", than: "1.0.9"))
        XCTAssertTrue(versionIsNewer("1.10.0", than: "1.9.0"))
        XCTAssertFalse(versionIsNewer("1.0.9", than: "1.0.10"))
    }

    func testAMissingPartCountsAsZero() {
        XCTAssertTrue(versionIsNewer("1.1", than: "1.0.0"))
        XCTAssertFalse(versionIsNewer("1.0", than: "1.0.0"))
    }

    func testTrailingTextIsIgnoredRatherThanThrowingOffTheNumber() {
        XCTAssertTrue(versionIsNewer("1.2.0-beta", than: "1.1.0"))
        XCTAssertFalse(versionIsNewer("1.1.0-beta", than: "1.1.0"))
    }

    // MARK: - reading what is installed

    func testAWidgetWithAVersionIsFound() throws {
        try install(folder: "clock", version: "1.0.0")

        let installed = installedWidgets(in: widgetDir)
        XCTAssertEqual(installed.count, 1)
        XCTAssertEqual(installed["clock"]?.version, "1.0.0")
        XCTAssertEqual(installed["clock"]?.folder.lastPathComponent, "clock")
    }

    func testTheManifestNameWinsOverTheFolderName() throws {
        try install(folder: "my-clock", name: "clock", version: "1.0.0")

        let installed = installedWidgets(in: widgetDir)
        XCTAssertNotNil(installed["clock"])
        XCTAssertNil(installed["my-clock"])
        XCTAssertEqual(installed["clock"]?.folder.lastPathComponent, "my-clock")
    }

    func testAWidgetWithoutAVersionIsLeftAlone() throws {
        try install(folder: "homegrown", version: nil)

        XCTAssertTrue(installedWidgets(in: widgetDir).isEmpty)
    }

    func testAFolderWithoutAManifestIsLeftAlone() throws {
        try FileManager.default.createDirectory(
            at: widgetDir.appendingPathComponent("loose"),
            withIntermediateDirectories: true
        )

        XCTAssertTrue(installedWidgets(in: widgetDir).isEmpty)
    }

    func testUnreadableJSONDoesNotStopTheOtherWidgets() throws {
        try install(folder: "clock", version: "1.0.0")

        let broken = widgetDir.appendingPathComponent("broken")
        try FileManager.default.createDirectory(
            at: broken,
            withIntermediateDirectories: true
        )
        try "{ not json".write(
            to: broken.appendingPathComponent("widget.json"),
            atomically: true,
            encoding: .utf8
        )

        let installed = installedWidgets(in: widgetDir)
        XCTAssertEqual(installed.count, 1)
        XCTAssertNotNil(installed["clock"])
    }

    func testAMissingWidgetFolderReadsAsEmpty() {
        let nowhere = widgetDir.appendingPathComponent("gone")
        XCTAssertTrue(installedWidgets(in: nowhere).isEmpty)
    }

    // MARK: - choosing what to update

    @MainActor
    func testSelectionStartsOnAndCanBeChanged() async throws {
        let model = WidgetUpdatesModel(widgetDirectory: widgetDir)
        model.available = [
            update(name: "clock", installed: "1.0.0", hub: "1.1.0"),
            update(name: "weather", installed: "2.0.0", hub: "2.1.0"),
        ]

        XCTAssertEqual(model.selectedCount, 2)
        XCTAssertTrue(model.allSelected)

        model.toggle("clock")
        XCTAssertEqual(model.selectedCount, 1)
        XCTAssertFalse(model.allSelected)

        model.selectAll(false)
        XCTAssertEqual(model.selectedCount, 0)

        model.selectAll(true)
        XCTAssertEqual(model.selectedCount, 2)
    }

    @MainActor
    func testTogglingAWidgetThatIsNotThereChangesNothing() async throws {
        let model = WidgetUpdatesModel(widgetDirectory: widgetDir)
        model.available = [update(name: "clock", installed: "1.0.0", hub: "1.1.0")]

        model.toggle("absent")
        XCTAssertEqual(model.selectedCount, 1)
    }

    @MainActor
    func testNothingSelectedWhenThereIsNothingToUpdate() async throws {
        let model = WidgetUpdatesModel(widgetDirectory: widgetDir)

        XCTAssertEqual(model.selectedCount, 0)
        XCTAssertFalse(model.allSelected)
    }

    // MARK: - against the hub itself

    /// The whole path, against the real repository: read the index, notice the
    /// installed widget is behind, fetch it, and write it. Skipped rather than
    /// failed when there is no network, since that says nothing about the code.
    @MainActor
    func testAWidgetIsUpdatedFromTheHub() async throws {
        // the skip takes a value, not an await, so the probe runs first
        let reachable = await hubIsReachable()
        try XCTSkipUnless(reachable, "GailanHub is not reachable")

        // an old clock, and a settings file the user chose
        try install(folder: "clock", version: "0.0.1")
        let folder = widgetDir.appendingPathComponent("clock")
        let settings = folder.appendingPathComponent("settings.json")
        try #"{"format":"24h"}"#.write(to: settings, atomically: true, encoding: .utf8)

        let model = WidgetUpdatesModel(widgetDirectory: widgetDir)
        await model.check()

        XCTAssertEqual(model.phase, .ready)
        let clock = try XCTUnwrap(model.available.first { $0.id == "clock" })
        XCTAssertEqual(clock.installedVersion, "0.0.1")
        XCTAssertTrue(clock.selected)

        await model.updateSelected()

        XCTAssertEqual(model.phase, .finished)
        XCTAssertEqual(model.available.first { $0.id == "clock" }?.state, .done)

        // the widget's own files arrived
        let entry = folder.appendingPathComponent("index.tsx")
        XCTAssertTrue(FileManager.default.fileExists(atPath: entry.path))
        XCTAssertGreaterThan(try Data(contentsOf: entry).count, 100)

        // and the version on disk is the one the hub holds
        let manifest = try JSONSerialization.jsonObject(
            with: try Data(contentsOf: folder.appendingPathComponent("widget.json"))
        ) as? [String: Any]
        XCTAssertEqual(manifest?["version"] as? String, clock.widget.version)

        // the user's settings were not part of the update and are still there
        XCTAssertEqual(
            try String(contentsOf: settings, encoding: .utf8),
            #"{"format":"24h"}"#
        )
    }

    @MainActor
    func testAWidgetAtTheHubVersionIsNotOffered() async throws {
        // the skip takes a value, not an await, so the probe runs first
        let reachable = await hubIsReachable()
        try XCTSkipUnless(reachable, "GailanHub is not reachable")

        // read the version the hub holds, install exactly that, expect nothing
        let model = WidgetUpdatesModel(widgetDirectory: widgetDir)
        try install(folder: "clock", version: "0.0.1")
        await model.check()
        let hubVersion = try XCTUnwrap(
            model.available.first { $0.id == "clock" }?.widget.version
        )

        try FileManager.default.removeItem(
            at: widgetDir.appendingPathComponent("clock")
        )
        try install(folder: "clock", version: hubVersion)

        let second = WidgetUpdatesModel(widgetDirectory: widgetDir)
        await second.check()
        XCTAssertEqual(second.phase, .upToDate)
        XCTAssertTrue(second.available.isEmpty)
    }

    private func hubIsReachable() async -> Bool {
        var request = URLRequest(
            url: URL(
                string:
                    "https://raw.githubusercontent.com/nich227/GailanHub/main/index.json"
            )!
        )
        request.timeoutInterval = 10
        request.httpMethod = "HEAD"

        guard let (_, response) = try? await URLSession.shared.data(for: request),
            let http = response as? HTTPURLResponse
        else { return false }
        return http.statusCode == 200
    }

    private func update(
        name: String,
        installed: String,
        hub: String
    ) -> WidgetUpdatesModel.Available {
        WidgetUpdatesModel.Available(
            widget: HubWidget(
                name: name,
                title: name.capitalized,
                description: "a widget",
                author: "someone",
                version: hub,
                path: "widgets/\(name)",
                files: [HubFile(path: "index.tsx")]
            ),
            installedVersion: installed,
            folder: widgetDir.appendingPathComponent(name)
        )
    }
}
