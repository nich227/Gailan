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

// Everything the status menu offers per widget, in one window instead of five
// submenus. Both go through GLWidgetsController, so a change made in either
// shows up in the other.

struct WidgetSummary: Identifiable, Equatable {
    let id: String
    let fileName: String
    let hidden: Bool
    let inBackground: Bool
    let showOnAllScreens: Bool
    let showOnMainScreen: Bool
    let hasError: Bool

    enum Screens: String {
        case all, main, selected
    }

    var screens: Screens {
        if showOnAllScreens { return .all }
        if showOnMainScreen { return .main }
        return .selected
    }

    init(_ raw: [String: Any]) {
        id = raw["id"] as? String ?? ""
        fileName = raw["fileName"] as? String ?? ""
        hidden = raw["hidden"] as? Bool ?? false
        inBackground = raw["inBackground"] as? Bool ?? false
        showOnAllScreens = raw["showOnAllScreens"] as? Bool ?? false
        showOnMainScreen = raw["showOnMainScreen"] as? Bool ?? false
        hasError = raw["hasError"] as? Bool ?? false
    }
}

// The store notifies through a single block that the app delegate already owns,
// so it reposts a notification and this listens for that.
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
}

struct GLWidgetsOverview: View {
    @ObservedObject var model: WidgetsOverviewModel

    var body: some View {
        VStack(spacing: 0) {
            if model.widgets.isEmpty {
                empty
            } else {
                List(model.widgets) { widget in
                    row(widget)
                        .padding(.vertical, 6)
                }
                .listStyle(.inset)
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
        .frame(minWidth: 520, minHeight: 340)
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

    private func row(_ widget: WidgetSummary) -> some View {
        HStack(alignment: .center, spacing: 12) {
            // shown or hidden, which is the one thing people come here for
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

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(widget.id)
                        .fontWeight(.medium)
                    if widget.hasError {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .help("This widget failed to build")
                    }
                }
                Text(widget.fileName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Picker(
                "",
                selection: Binding(
                    get: { widget.screens },
                    set: { model.setScreens($0, for: widget.id) }
                )
            ) {
                Text("All screens").tag(WidgetSummary.Screens.all)
                Text("Main screen").tag(WidgetSummary.Screens.main)
                Text("Chosen screens").tag(WidgetSummary.Screens.selected)
            }
            .labelsHidden()
            .frame(width: 140)

            Toggle(
                "Behind windows",
                isOn: Binding(
                    get: { widget.inBackground },
                    set: { model.setInBackground($0, for: widget.id) }
                )
            )
            .toggleStyle(.checkbox)
            .help("Keep this widget behind your windows")

            Menu {
                Button("Refresh") { model.refresh(widget.id) }
                Button("Edit…") { model.edit(widget.id) }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
    }
}

// Handed to the app delegate, which has no way to build a SwiftUI window itself.
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
            // already built: freshen it and bring it forward
            model?.reload()
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let model = WidgetsOverviewModel(controller: controller)
        self.model = model

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 580, height: 380),
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
