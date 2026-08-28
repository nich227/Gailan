//
//  GLShortcuts.swift
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

import AppIntents
import AppKit

// Shortcuts actions for what AppleScript already exposes. Both go through the
// same dispatcher, so a shortcut and a script have the same effect.

// MARK: - the widget a shortcut acts on

struct WidgetEntity: AppEntity {
    let id: String

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: "Widget"
    )
    static let defaultQuery = WidgetQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(id)")
    }
}

// Reads the live widget list, so the Shortcuts picker offers what is actually
// on the desktop instead of asking for an id.
struct WidgetQuery: EntityQuery, EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [WidgetEntity] {
        let known = Set(await allWidgetIds())
        return identifiers.filter(known.contains).map(WidgetEntity.init(id:))
    }

    func suggestedEntities() async throws -> [WidgetEntity] {
        await allWidgetIds().map(WidgetEntity.init(id:))
    }

    func entities(matching string: String) async throws -> [WidgetEntity] {
        await allWidgetIds()
            .filter { $0.localizedCaseInsensitiveContains(string) }
            .map(WidgetEntity.init(id:))
    }
}

// Where the actions look for widgets. It reads the app's live list, and is a
// property so tests can hand over a known set instead of racing the state the
// app fetches from the server at launch.
enum WidgetLookup {
    static var all: () -> [GLWidgetForScripting] = {
        guard let delegate = NSApp.delegate as? GLAppDelegate else { return [] }
        return (delegate.widgets as? [GLWidgetForScripting]) ?? []
    }
}

private func scriptingWidgets() -> [GLWidgetForScripting] {
    WidgetLookup.all()
}

private func allWidgetIds() async -> [String] {
    await MainActor.run { scriptingWidgets().map(\.id) }
}

private func scriptingWidget(_ id: String) throws -> GLWidgetForScripting {
    guard let widget = scriptingWidgets().first(where: { $0.id == id }) else {
        throw GailanIntentError.noSuchWidget(id)
    }
    return widget
}

enum GailanIntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case noSuchWidget(String)
    case notRunning

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .noSuchWidget(let id):
            return "There is no widget called \(id)."
        case .notRunning:
            return "Gailan is not running."
        }
    }
}

// MARK: - where a widget is shown

enum WidgetScreens: String, AppEnum {
    case mainScreen
    case allScreens

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: "Screens"
    )
    static let caseDisplayRepresentations: [WidgetScreens: DisplayRepresentation] = [
        .mainScreen: "Main Screen",
        .allScreens: "All Screens",
    ]
}

// MARK: - the actions

struct RefreshWidgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Refresh Widget"
    static let description = IntentDescription(
        "Runs a widget's command again and redraws it."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Refresh \(\.$widget)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        try scriptingWidget(widget.id).refresh(nil)
        return .result()
    }
}

struct RefreshAllWidgetsIntent: AppIntent {
    static let title: LocalizedStringResource = "Refresh All Widgets"
    static let description = IntentDescription(
        "Runs every widget's command again and redraws them."
    )

    @MainActor
    func perform() async throws -> some IntentResult {
        (NSApp.delegate as? GLAppDelegate)?.refreshWidgets(nil)
        return .result()
    }
}

struct ReloadWidgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Reload Widget"
    static let description = IntentDescription(
        "Rebuilds a widget from its source file, the way saving it does."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Reload \(\.$widget)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        try scriptingWidget(widget.id).reload(nil)
        return .result()
    }
}

struct SetWidgetVisibilityIntent: AppIntent {
    static let title: LocalizedStringResource = "Show or Hide Widget"
    static let description = IntentDescription(
        "Shows a widget on the desktop, or hides it without deleting it."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    @Parameter(title: "Visible", default: true)
    var visible: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Set \(\.$widget) visible: \(\.$visible)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        try scriptingWidget(widget.id).hidden = !visible
        return .result()
    }
}

struct SetWidgetScreensIntent: AppIntent {
    static let title: LocalizedStringResource = "Choose Widget Screens"
    static let description = IntentDescription(
        "Puts a widget on the main screen only, or on every screen."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    @Parameter(title: "Screens")
    var screens: WidgetScreens

    static var parameterSummary: some ParameterSummary {
        Summary("Show \(\.$widget) on \(\.$screens)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        let target = try scriptingWidget(widget.id)
        switch screens {
        case .mainScreen:
            target.showOnMainScreen = true
        case .allScreens:
            target.showOnAllScreens = true
        }
        return .result()
    }
}

enum WidgetLayer: String, AppEnum {
    case behindWindows
    case inFront

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Layer")

    static let caseDisplayRepresentations: [WidgetLayer: DisplayRepresentation] = [
        .behindWindows: "Behind Windows",
        .inFront: "In Front",
    ]
}

struct SetWidgetLayerIntent: AppIntent {
    static let title: LocalizedStringResource = "Set Widget Layer"
    static let description = IntentDescription(
        "Puts a widget behind your windows, or in front of them."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    @Parameter(title: "Layer")
    var layer: WidgetLayer

    static var parameterSummary: some ParameterSummary {
        Summary("Put \(\.$widget) \(\.$layer)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        try scriptingWidget(widget.id).inBackground = layer == .behindWindows
        return .result()
    }
}

/// Changes one of the widget's own settings, the ones it declares in its widget.json
/// and Gailan shows as controls. The value arrives as text because a shortcut has no
/// way of knowing what a given key expects; "true", "false" and numbers are read as
/// what they look like, and anything else is passed through as it stands.
struct SetWidgetSettingIntent: AppIntent {
    static let title: LocalizedStringResource = "Change Widget Setting"
    static let description = IntentDescription(
        "Changes one of a widget's own settings, the same ones its settings window shows."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    @Parameter(title: "Setting", requestValueDialog: "Which setting?")
    var key: String

    @Parameter(title: "Value", requestValueDialog: "What should it be?")
    var value: String

    static var parameterSummary: some ParameterSummary {
        Summary("Set \(\.$key) of \(\.$widget) to \(\.$value)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        let target = try scriptingWidget(widget.id)

        let trimmed = value.trimmingCharacters(in: .whitespaces)
        let coerced: Any
        switch trimmed.lowercased() {
        case "true", "yes", "on":
            coerced = true
        case "false", "no", "off":
            coerced = false
        default:
            coerced = Double(trimmed) ?? trimmed
        }

        target.setConfigValue(coerced, forKey: key)
        return .result()
    }
}

struct OpenWidgetFileIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Widget File"
    static let description = IntentDescription(
        "Opens a widget's file in whichever editor you use for it."
    )

    @Parameter(title: "Widget")
    var widget: WidgetEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Open the file for \(\.$widget)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        // it has to exist before there is a file to open
        _ = try scriptingWidget(widget.id)
        guard let delegate = NSApp.delegate as? GLAppDelegate else {
            throw GailanIntentError.notRunning
        }
        delegate.openWidgetFile(withId: widget.id)
        return .result()
    }
}

struct KeepWidgetsInFrontIntent: AppIntent {
    static let title: LocalizedStringResource = "Keep Widgets in Front"
    static let description = IntentDescription(
        "Keeps every widget above your other windows, or lets them sit behind again."
    )

    @Parameter(title: "In Front", default: true)
    var inFront: Bool

    static var parameterSummary: some ParameterSummary {
        Summary("Keep widgets in front: \(\.$inFront)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let delegate = NSApp.delegate as? GLAppDelegate else {
            throw GailanIntentError.notRunning
        }
        delegate.setAlwaysOnTop(inFront)
        return .result()
    }
}

enum WidgetAppearance: String, AppEnum {
    case system
    case light
    case dark

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: "Appearance"
    )

    static let caseDisplayRepresentations: [WidgetAppearance: DisplayRepresentation] = [
        .system: "Follow System",
        .light: "Light",
        .dark: "Dark",
    ]
}

struct SetAppearanceIntent: AppIntent {
    static let title: LocalizedStringResource = "Set Widget Appearance"
    static let description = IntentDescription(
        "Draws widgets light, dark, or however the system is set."
    )

    @Parameter(title: "Appearance")
    var appearance: WidgetAppearance

    static var parameterSummary: some ParameterSummary {
        Summary("Draw widgets \(\.$appearance)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let delegate = NSApp.delegate as? GLAppDelegate else {
            throw GailanIntentError.notRunning
        }
        // the tags the preferences pane already uses: 0 system, 1 light, 2 dark
        let tag: Int
        switch appearance {
        case .system: tag = 0
        case .light: tag = 1
        case .dark: tag = 2
        }
        delegate.setAppearanceTag(tag)
        return .result()
    }
}

// MARK: - phrases for Siri and Spotlight

struct GailanShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RefreshAllWidgetsIntent(),
            phrases: [
                "Refresh \(.applicationName) widgets",
                "Refresh all widgets in \(.applicationName)",
            ],
            shortTitle: "Refresh All Widgets",
            systemImageName: "arrow.clockwise"
        )
    }
}
