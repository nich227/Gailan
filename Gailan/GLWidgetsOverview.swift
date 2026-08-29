//
//  GLWidgetsOverview.swift
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//

import AppKit
import SwiftUI

// A gallery of what is installed: a card each, showing the widget's own preview
// image, its name, a switch, and a button for the settings it declares. Both this
// and the status menu go through GLWidgetsController, so a change in either shows
// up in the other.

// MARK: - a setting a widget declares in its widget.json

struct WidgetSetting: Identifiable, Equatable {
    enum Kind: String {
        /* choice and list hold the same thing and differ only in the control: a row of
           segments reads well for two or three short options and badly for more, where
           a menu is what somebody expects. The widget says which it wants. */
        case choice, list, toggle, number, text, color
    }

    struct Option: Equatable {
        let value: String
        let label: String
    }

    let key: String
    let kind: Kind
    let label: String
    let help: String?
    let options: [Option]
    let min: Double
    let max: Double
    let step: Double
    /* What the widget says it should be when nothing has been chosen. Without
       this a picker has no selection and a switch reads off, which makes a
       widget look misconfigured before it has been touched. */
    let defaultValue: String?

    var id: String { key }

    init?(_ raw: [AnyHashable: Any]) {
        guard let key = raw["key"] as? String,
              let type = raw["type"] as? String,
              let kind = Kind(rawValue: type)
        else { return nil }

        self.key = key
        self.kind = kind
        label = raw["label"] as? String ?? key
        help = raw["help"] as? String
        min = raw["min"] as? Double ?? 0
        max = raw["max"] as? Double ?? 100
        step = raw["step"] as? Double ?? 1

        if let value = raw["default"] {
            defaultValue = value is Bool
                ? ((value as? Bool) == true ? "true" : "false")
                : String(describing: value)
        } else {
            defaultValue = nil
        }

        options = ((raw["options"] as? [[AnyHashable: Any]]) ?? []).compactMap {
            guard let value = $0["value"] else { return nil }
            let text = String(describing: value)
            return Option(value: text, label: $0["label"] as? String ?? text)
        }
    }
}

struct WidgetSummary: Identifiable, Equatable {
    let id: String
    let title: String
    let fileName: String
    let filePath: String
    let hidden: Bool
    let inBackground: Bool
    let showOnAllScreens: Bool
    let showOnMainScreen: Bool
    let hasError: Bool
    let settings: [WidgetSetting]
    private(set) var config: [String: String]

    enum Screens: String {
        case all, main, selected
    }

    var screens: Screens {
        if showOnAllScreens { return .all }
        if showOnMainScreen { return .main }
        return .selected
    }

    // the widget's own screenshot, if it shipped one beside its file
    var previewURL: URL? {
        guard !filePath.isEmpty else { return nil }
        let folder = (filePath as NSString).deletingLastPathComponent
        // a screenshot of a desktop is a photograph, so a jpeg is the usual answer
        for name in [
            "preview.jpg", "preview.jpeg", "preview.png", "preview@2x.png",
            "screenshot.png",
        ] {
            let candidate = (folder as NSString).appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: candidate) {
                return URL(fileURLWithPath: candidate)
            }
        }
        return nil
    }

    // used when a control has just been moved, before the change comes back
    func replacingConfig(_ config: [String: String]) -> WidgetSummary {
        var copy = self
        copy.config = config
        return copy
    }

    init(_ raw: [AnyHashable: Any]) {
        id = raw["id"] as? String ?? ""
        title = raw["title"] as? String ?? (raw["id"] as? String ?? "")
        fileName = raw["fileName"] as? String ?? ""
        filePath = raw["filePath"] as? String ?? ""
        hidden = raw["hidden"] as? Bool ?? false
        inBackground = raw["inBackground"] as? Bool ?? false
        showOnAllScreens = raw["showOnAllScreens"] as? Bool ?? false
        showOnMainScreen = raw["showOnMainScreen"] as? Bool ?? false
        hasError = raw["hasError"] as? Bool ?? false

        settings = ((raw["settingsSchema"] as? [[AnyHashable: Any]]) ?? [])
            .compactMap(WidgetSetting.init)

        // everything is kept as a string so one dictionary covers every kind
        var values: [String: String] = [:]
        for (key, value) in (raw["config"] as? [AnyHashable: Any]) ?? [:] {
            if let key = key as? String {
                values[key] = String(describing: value)
            }
        }
        config = values
    }
}

extension Notification.Name {
    static let widgetsDidChange = Notification.Name("GLWidgetsDidChange")
}

@MainActor
final class WidgetsOverviewModel: ObservableObject {
    @Published var widgets: [WidgetSummary] = []

    private let controller: GLWidgetsController
    private var observer: NSObjectProtocol?

    init(controller: GLWidgetsController) {
        self.controller = controller
        reload()

        observer = NotificationCenter.default.addObserver(
            forName: .widgetsDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.reload() }
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    func reload() {
        widgets = controller.widgetsOverview().map(WidgetSummary.init)
    }

    func widget(_ id: String) -> WidgetSummary? {
        widgets.first { $0.id == id }
    }

    func setHidden(_ hidden: Bool, for id: String) {
        controller.setHidden(hidden, forWidget: id)
    }

    func setInBackground(_ inBackground: Bool, for id: String) {
        controller.setInBackground(inBackground, forWidget: id)
    }

    func setScreens(_ screens: WidgetSummary.Screens, for id: String) {
        controller.setScreenMode(screens.rawValue, forWidget: id)
    }

    func refresh(_ id: String) {
        controller.refreshWidget(withId: id)
    }

    func edit(_ id: String) {
        controller.openWidgetFile(id)
    }

    func setValue(_ value: Any, forKey key: String, widget id: String) {
        controller.setConfigValue(value, forKey: key, widget: id)
        // the change goes out over the socket and comes back as a store update,
        // which takes a moment. show it immediately so the control does not
        // appear to bounce back.
        applyLocally(value, forKey: key, widget: id)
    }

    private func applyLocally(_ value: Any, forKey key: String, widget id: String) {
        guard let index = widgets.firstIndex(where: { $0.id == id }) else { return }

        let text = value is Bool
            ? ((value as? Bool) == true ? "true" : "false")
            : String(describing: value)

        var config = widgets[index].config
        config[key] = text
        widgets[index] = widgets[index].replacingConfig(config)
    }
}

// MARK: - the gallery

struct GLWidgetsOverview: View {
    @ObservedObject var model: WidgetsOverviewModel
    @State private var settingsFor: String?

    private let columns = [GridItem(.adaptive(minimum: 232), spacing: 18)]

    var body: some View {
        VStack(spacing: 0) {
            if model.widgets.isEmpty {
                empty
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 18) {
                        ForEach(model.widgets) { widget in
                            card(widget)
                        }
                    }
                    .padding(18)
                }
            }

            Divider()

            HStack {
                Text(count)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Open Widgets Folder") {
                    (NSApp.delegate as? GLAppDelegate)?.openWidgetDir(nil)
                }
            }
            .padding(12)
        }
        .frame(minWidth: 560, minHeight: 420)
        .sheet(
            isPresented: Binding(
                get: { settingsFor != nil },
                set: { if !$0 { settingsFor = nil } }
            )
        ) {
            if let id = settingsFor, let widget = model.widget(id) {
                GLWidgetSettings(
                    widgetId: widget.id,
                    model: model,
                    dismiss: { settingsFor = nil }
                )
            }
        }
    }

    private var count: String {
        model.widgets.count == 1 ? "1 widget" : "\(model.widgets.count) widgets"
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Text("No widgets yet")
                .font(.headline)
            Text("Put a .tsx or .jsx file in your widgets folder and it appears here.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    private func card(_ widget: WidgetSummary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            preview(widget)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(widget.title)
                        .fontWeight(.medium)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if widget.hasError {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .help("This widget failed to build")
                    }
                    Spacer()
                }

                HStack(spacing: 10) {
                    Toggle(
                        "",
                        isOn: Binding(
                            get: { !widget.hidden },
                            set: { model.setHidden(!$0, for: widget.id) }
                        )
                    )
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)

                    Spacer()

                    // only offered when the widget declares something to set
                    if !widget.settings.isEmpty {
                        Button {
                            settingsFor = widget.id
                        } label: {
                            Image(systemName: "slider.horizontal.3")
                        }
                        .buttonStyle(.borderless)
                        .help("Settings for this widget")
                    }

                    Menu {
                        Button("Refresh") { model.refresh(widget.id) }
                        Button("Edit…") { model.edit(widget.id) }
                        Divider()
                        Picker("Screens", selection: Binding(
                            get: { widget.screens },
                            set: { model.setScreens($0, for: widget.id) }
                        )) {
                            Text("All screens").tag(WidgetSummary.Screens.all)
                            Text("Main screen").tag(WidgetSummary.Screens.main)
                            Text("Chosen screens").tag(WidgetSummary.Screens.selected)
                        }
                        Toggle("Behind windows", isOn: Binding(
                            get: { widget.inBackground },
                            set: { model.setInBackground($0, for: widget.id) }
                        ))
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                }
            }
            .padding(12)
        }
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(.separator, lineWidth: 1)
        )
        .opacity(widget.hidden ? 0.55 : 1)
    }

    private func preview(_ widget: WidgetSummary) -> some View {
        ZStack {
            if let url = widget.previewURL, let image = NSImage(contentsOf: url) {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                // no screenshot shipped, so say so rather than showing a gap
                VStack(spacing: 6) {
                    Image(systemName: "square.dashed")
                        .font(.title2)
                        .foregroundStyle(.tertiary)
                    Text("No preview")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .frame(height: 116)
        .frame(maxWidth: .infinity)
        .background(.black.opacity(0.28))
        .clipped()
    }
}

// MARK: - the settings a widget declares, turned into controls

struct GLWidgetSettings: View {
    // the id rather than a copy: a snapshot would not see the change the control
    // just made, so every control would appear to bounce back
    let widgetId: String
    @ObservedObject var model: WidgetsOverviewModel
    let dismiss: () -> Void

    private var widget: WidgetSummary? { model.widget(widgetId) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(widget?.title ?? widgetId)
                        .fontWeight(.semibold)
                    Text(widget?.fileName ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(16)

            Divider()

            Form {
                ForEach(widget?.settings ?? []) { setting in
                    control(setting)
                }
            }
            .formStyle(.grouped)

            Divider()

            HStack {
                Spacer()
                Button("Done", action: dismiss)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(12)
        }
        .frame(width: 380, height: 340)
    }

    /* One control per declared kind. This is the whole translator: a widget says
       what sort of setting it has, and this decides what that looks like. */
    @ViewBuilder
    private func control(_ setting: WidgetSetting) -> some View {
        switch setting.kind {
        case .choice:
            Picker(setting.label, selection: binding(setting)) {
                ForEach(setting.options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .pickerStyle(.segmented)
            .help(setting.help ?? "")

        case .list:
            Picker(setting.label, selection: binding(setting)) {
                ForEach(setting.options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .pickerStyle(.menu)
            .help(setting.help ?? "")

        case .toggle:
            Toggle(
                setting.label,
                isOn: Binding(
                    get: { current(setting) == "true" || current(setting) == "1" },
                    set: { model.setValue($0, forKey: setting.key, widget: widgetId) }
                )
            )
            .help(setting.help ?? "")

        case .number:
            LabeledContent(setting.label) {
                HStack(spacing: 10) {
                    Slider(
                        value: Binding(
                            get: { Double(current(setting)) ?? setting.min },
                            set: {
                                model.setValue(
                                    ($0 / setting.step).rounded() * setting.step,
                                    forKey: setting.key,
                                    widget: widgetId
                                )
                            }
                        ),
                        in: setting.min...setting.max,
                        step: setting.step
                    )
                    Text(current(setting))
                        .font(.callout)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(width: 38, alignment: .trailing)
                }
            }
            .help(setting.help ?? "")

        case .text:
            LabeledContent(setting.label) {
                TextField("", text: binding(setting))
                    .textFieldStyle(.roundedBorder)
            }
            .help(setting.help ?? "")

        case .color:
            ColorPicker(
                setting.label,
                selection: Binding(
                    get: { Color(hexRGBA: current(setting)) },
                    set: {
                        model.setValue(
                            $0.hexRGBA, forKey: setting.key, widget: widgetId
                        )
                    }
                ),
                supportsOpacity: true
            )
        }
    }

    private func current(_ setting: WidgetSetting) -> String {
        widget?.config[setting.key] ?? setting.defaultValue ?? ""
    }

    private func binding(_ setting: WidgetSetting) -> Binding<String> {
        Binding(
            get: { current(setting) },
            set: { model.setValue($0, forKey: setting.key, widget: widgetId) }
        )
    }
}

// Handed to the app delegate, which has no way to build a SwiftUI window itself.
@MainActor
@objc(GLWidgetsOverviewWindow)
final class GLWidgetsOverviewWindow: NSObject {
    private static var shared: GLWidgetsOverviewWindow?

    private var window: NSWindow?
    private var model: WidgetsOverviewModel?

    @objc static func show(_ controller: GLWidgetsController) {
        let overview = shared ?? GLWidgetsOverviewWindow()
        shared = overview
        overview.present(controller)
    }

    private func present(_ controller: GLWidgetsController) {
        if let window {
            model?.reload()
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let model = WidgetsOverviewModel(controller: controller)
        self.model = model

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 460),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Widgets"
        window.isReleasedWhenClosed = false
        window.center()
        window.contentView = NSHostingView(
            rootView: GLWidgetsOverview(model: model)
        )

        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
