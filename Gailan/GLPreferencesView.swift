//
//  GLPreferencesView.swift
//  Gailan
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
//  The preferences window. GLPreferencesController stays the model: its
//  property setters restart the server, apply the appearance, move window
//  levels and broadcast the glass settings, so every control here writes
//  through it rather than touching user defaults itself.

import AppKit
import SwiftUI

// Mirrors the controller's values so SwiftUI has something to observe, and
// forwards each change back to it.
final class GLPreferences: ObservableObject {
    private let controller: GLPreferencesController

    @Published var startAtLogin: Bool { didSet { controller.startAtLogin = startAtLogin } }
    @Published var enableInteraction: Bool { didSet { controller.enableInteraction = enableInteraction } }
    @Published var alwaysOnTop: Bool { didSet { controller.alwaysOnTop = alwaysOnTop } }
    @Published var appearanceTag: Int { didSet { controller.appearanceTag = appearanceTag } }
    @Published var shellTag: Int { didSet { controller.shellTag = shellTag } }
    @Published var loginShell: Bool { didSet { controller.loginShell = loginShell } }
    @Published var glassEnabled: Bool { didSet { controller.glassEnabled = glassEnabled } }
    @Published var glassStrength: Double { didSet { controller.glassStrength = glassStrength } }
    @Published var glassDepth: Double { didSet { controller.glassDepth = glassDepth } }
    @Published var glassCurvature: Double { didSet { controller.glassCurvature = glassCurvature } }
    @Published var glassDispersion: Double { didSet { controller.glassDispersion = glassDispersion } }
    @Published var glassFrost: Double { didSet { controller.glassFrost = glassFrost } }
    @Published var desktopGlassTag: Int { didSet { controller.desktopGlassTag = desktopGlassTag } }
    @Published var widgetPath: String

    init(controller: GLPreferencesController) {
        self.controller = controller
        startAtLogin = controller.startAtLogin
        enableInteraction = controller.enableInteraction
        alwaysOnTop = controller.alwaysOnTop
        appearanceTag = controller.appearanceTag
        shellTag = controller.shellTag
        loginShell = controller.loginShell
        glassEnabled = controller.glassEnabled
        glassStrength = controller.glassStrength
        glassDepth = controller.glassDepth
        glassCurvature = controller.glassCurvature
        glassDispersion = controller.glassDispersion
        glassFrost = controller.glassFrost
        desktopGlassTag = controller.desktopGlassTag
        widgetPath = controller.widgetDir?.path ?? ""
    }

    var widgetFolderIcon: NSImage {
        NSWorkspace.shared.icon(forFile: widgetPath)
    }

    func chooseWidgetFolder() {
        controller.chooseWidgetDir { [weak self] url in
            self?.widgetPath = url?.path ?? ""
        }
    }
}

struct GLPreferencesView: View {
    @ObservedObject var prefs: GLPreferences
    @State private var pane: Pane = .general

    enum Pane: String, CaseIterable, Identifiable {
        case general = "General"
        case appearance = "Appearance"
        case shell = "Shell"
        case glass = "Liquid Glass"

        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .general: return "gearshape"
            case .appearance: return "paintbrush"
            case .shell: return "terminal"
            case .glass: return "drop.halffull"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            List(Pane.allCases, selection: $pane) { item in
                Label(item.rawValue, systemImage: item.symbol).tag(item)
            }
            .navigationSplitViewColumnWidth(min: 176, ideal: 186, max: 220)
        } detail: {
            Form {
                switch pane {
                case .general: general
                case .appearance: appearance
                case .shell: shell
                case .glass: glass
                }
            }
            .formStyle(.grouped)
            .navigationTitle(pane.rawValue)
        }
        .frame(minWidth: 660, minHeight: 420)
    }

    private var general: some View {
        Section {
            Toggle("Open Gailan at Login", isOn: $prefs.startAtLogin)
            LabeledContent("Widgets Folder") {
                HStack(spacing: 6) {
                    Image(nsImage: prefs.widgetFolderIcon)
                        .resizable().frame(width: 16, height: 16)
                    Text(prefs.widgetPath)
                        .truncationMode(.head)
                        .lineLimit(1)
                    Spacer()
                    Button("Change\u{2026}") { prefs.chooseWidgetFolder() }
                }
            }
            Toggle("Enable interaction", isOn: $prefs.enableInteraction)
            Toggle("Keep widgets above other windows", isOn: $prefs.alwaysOnTop)
        } footer: {
            Text("Interaction lets widgets receive clicks. It needs an interaction shortcut and accessibility access.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var appearance: some View {
        Section {
            Picker("Theme", selection: $prefs.appearanceTag) {
                Text("System").tag(0)
                Text("Light").tag(1)
                Text("Dark").tag(2)
            }
        } footer: {
            Text("Widgets follow this through prefers-color-scheme and a data-appearance attribute.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var shell: some View {
        Section {
            Picker("Shell", selection: $prefs.shellTag) {
                Text("zsh").tag(0)
                Text("fish").tag(1)
            }
            Toggle("Load shell env", isOn: $prefs.loginShell)
        } footer: {
            Text("Loading your shell's env keeps your locale and PATH. A misconfigured shell can stop widgets working.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    // two sections now, so the builder has to be explicit
    @ViewBuilder private var glass: some View {
        Section {
            Toggle("Available to widgets", isOn: $prefs.glassEnabled)
            optic("Refraction", $prefs.glassStrength, max: 1)
            optic("Depth", $prefs.glassDepth, max: 1)
            optic("Curvature", $prefs.glassCurvature, max: 1)
            optic("Dispersion", $prefs.glassDispersion, max: 1)
            optic("Frost", $prefs.glassFrost, max: 10)
        } footer: {
            Text("These are the defaults widgets inherit. A widget can override any of them.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }

        Section {
            Picker("Behind widgets", selection: $prefs.desktopGlassTag) {
                Text("Off").tag(0)
                Text("Sidebar").tag(1)
                Text("HUD").tag(2)
                Text("Popover").tag(3)
                Text("Window").tag(4)
                Text("Menu").tag(5)
            }
        } footer: {
            Text("The system glasses the desktop behind widgets that ask for it. The optics above do not apply, because macOS draws this one.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private func optic(
        _ label: String, _ value: Binding<Double>, max upper: Double
    ) -> some View {
        LabeledContent(label) {
            HStack(spacing: 8) {
                TextField("", value: value, format: .number.precision(.fractionLength(2)))
                    .frame(width: 54)
                    .multilineTextAlignment(.trailing)
                Slider(value: value, in: 0...upper)
            }
        }
        .disabled(!prefs.glassEnabled)
    }
}

// Handed to the window controller, which has no way to build a SwiftUI view
// itself.
@objc(GLPreferencesHosting)
final class GLPreferencesHosting: NSObject {
    @objc static func viewFor(_ controller: GLPreferencesController) -> NSView {
        let prefs = GLPreferences(controller: controller)
        return NSHostingView(rootView: GLPreferencesView(prefs: prefs))
    }
}
