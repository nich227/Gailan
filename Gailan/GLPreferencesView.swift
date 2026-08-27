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

    // two glasses, and they are easy to mix up, so each says what it is
    @ViewBuilder private var glass: some View {
        Section {
            Picker("Frost the desktop", selection: $prefs.desktopGlassTag) {
                Text("Off").tag(0)
                Text("Subtle").tag(1)
                Text("Frosted").tag(2)
                Text("Heavy").tag(3)
            }
        } header: {
            heading(
                "System glass",
                help: """
                    macOS frosts your wallpaper underneath a widget that asks \
                    for it. The widget draws nothing: the system draws the \
                    material behind the page, in the shape the widget claims. \
                    The sliders below do not apply to it, because macOS has no \
                    refraction to tune.
                    """
            )
        }

        Section {
            Toggle("Available to widgets", isOn: $prefs.glassEnabled)
            optic("Refraction", $prefs.glassStrength, max: 1)
            optic("Depth", $prefs.glassDepth, max: 1)
            optic("Curvature", $prefs.glassCurvature, max: 1)
            optic("Dispersion", $prefs.glassDispersion, max: 1)
            optic("Frost", $prefs.glassFrost, max: 10)
        } header: {
            heading(
                "Widget glass",
                help: """
                    A lens the widget draws itself, with <Glass> from the \
                    gailan module. It bends what is inside the page: the \
                    widget's own content, or another widget behind it. It \
                    cannot reach your wallpaper, so use System glass for that.
                    """
            )
        } footer: {
            Text("These are the defaults widgets inherit. A widget can override any of them.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private func heading(_ title: String, help: String) -> some View {
        HStack(spacing: 4) {
            Text(title)
            GLHelpButton(text: help)
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

// The info button next to a section title. .help alone is hover only, which
// makes an icon that looks clickable do nothing when clicked.
private struct GLHelpButton: View {
    let text: String
    @State private var showing = false

    var body: some View {
        Button {
            showing.toggle()
        } label: {
            Image(systemName: "info.circle")
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .help(text)
        .popover(isPresented: $showing, arrowEdge: .bottom) {
            Text(text)
                .font(.callout)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(width: 280, alignment: .leading)
                .padding(14)
        }
        .accessibilityLabel("About this setting")
    }
}
