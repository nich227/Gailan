//
//  GLWidgetUpdates.swift
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

// Widgets update the way the app does: a version is declared, somewhere upstream
// holds a newer one, and you are asked before anything is replaced. Gailan gets its
// versions from Sparkle's appcast; widgets get theirs from GailanHub's index.

private let hubIndexURL = URL(
    string: "https://raw.githubusercontent.com/nich227/GailanHub/main/index.json"
)!
private let hubRawBase = "https://raw.githubusercontent.com/nich227/GailanHub/main/"
private let lastCheckKey = "lastWidgetUpdateCheck"

// MARK: - the index

struct HubFile: Decodable {
    let path: String
}

struct HubWidget: Decodable {
    let name: String
    let title: String
    let description: String
    let author: String
    let version: String
    let path: String
    let files: [HubFile]
}

private struct HubIndex: Decodable {
    let widgets: [HubWidget]
}

/// Compares `1.2.10` against `1.2.9` as numbers rather than as text, and treats a
/// version it cannot read as older so a malformed one is offered rather than stuck.
func versionIsNewer(_ candidate: String, than installed: String) -> Bool {
    func parts(_ version: String) -> [Int] {
        version
            .split(separator: ".")
            .map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }

    let new = parts(candidate)
    let old = parts(installed)

    for index in 0..<max(new.count, old.count) {
        let left = index < new.count ? new[index] : 0
        let right = index < old.count ? old[index] : 0
        if left != right { return left > right }
    }
    return false
}

// MARK: - what is installed

struct InstalledWidget {
    let name: String
    let version: String
    let folder: URL
}

/// Reads the `widget.json` beside each widget. A widget without one, or without a
/// version, cannot be matched against the hub and is left alone.
func installedWidgets(in widgetDirectory: URL) -> [String: InstalledWidget] {
    let contents =
        (try? FileManager.default.contentsOfDirectory(
            at: widgetDirectory,
            includingPropertiesForKeys: [.isDirectoryKey]
        )) ?? []

    var found: [String: InstalledWidget] = [:]

    for folder in contents {
        let manifest = folder.appendingPathComponent("widget.json")
        guard
            let data = try? Data(contentsOf: manifest),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let version = json["version"] as? String
        else { continue }

        // the name in the manifest wins, so a renamed folder still matches the hub
        let name = (json["name"] as? String) ?? folder.lastPathComponent
        found[name] = InstalledWidget(name: name, version: version, folder: folder)
    }

    return found
}

// MARK: - the model

@MainActor
final class WidgetUpdatesModel: ObservableObject {
    struct Available: Identifiable {
        let widget: HubWidget
        let installedVersion: String
        let folder: URL
        var selected: Bool = true
        var state: State = .waiting

        var id: String { widget.name }

        enum State: Equatable {
            case waiting
            case updating
            case done
            case failed(String)
        }
    }

    enum Phase: Equatable {
        case checking
        case ready
        case updating
        case finished
        case upToDate
        case failed(String)
    }

    @Published var available: [Available] = []
    @Published var phase: Phase = .checking

    private let widgetDirectory: URL

    init(widgetDirectory: URL) {
        self.widgetDirectory = widgetDirectory
    }

    var selectedCount: Int {
        available.filter(\.selected).count
    }

    var allSelected: Bool {
        !available.isEmpty && available.allSatisfy(\.selected)
    }

    func selectAll(_ selected: Bool) {
        for index in available.indices { available[index].selected = selected }
    }

    func toggle(_ id: String) {
        guard let index = available.firstIndex(where: { $0.id == id }) else { return }
        available[index].selected.toggle()
    }

    func check() async {
        phase = .checking

        let hub: [HubWidget]
        do {
            hub = try await fetchIndex()
        } catch {
            phase = .failed(error.localizedDescription)
            return
        }

        UserDefaults.standard.set(Date(), forKey: lastCheckKey)

        let installed = installedWidgets(in: widgetDirectory)
        available = hub.compactMap { widget in
            guard
                let local = installed[widget.name],
                versionIsNewer(widget.version, than: local.version)
            else { return nil }

            return Available(
                widget: widget,
                installedVersion: local.version,
                folder: local.folder
            )
        }

        phase = available.isEmpty ? .upToDate : .ready
    }

    func updateSelected() async {
        phase = .updating

        for index in available.indices where available[index].selected {
            available[index].state = .updating
            do {
                try await install(available[index].widget, into: available[index].folder)
                available[index].state = .done
            } catch {
                available[index].state = .failed(error.localizedDescription)
            }
        }

        phase = .finished
    }

    private func fetchIndex() async throws -> [HubWidget] {
        var request = URLRequest(url: hubIndexURL)
        request.timeoutInterval = 20
        // GitHub caches raw files, and a check that returns yesterday's index is worse
        // than a slow one
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(HubIndex.self, from: data).widgets
    }

    /// Fetches every file first and only then writes, so a connection that drops
    /// halfway leaves the installed widget as it was rather than half replaced.
    /// Files the hub does not ship are left alone, which is what keeps the user's
    /// own `settings.json` through an update.
    private func install(_ widget: HubWidget, into folder: URL) async throws {
        var fetched: [(path: String, body: Data)] = []

        for file in widget.files {
            guard
                let url = URL(
                    string: hubRawBase
                        + "\(widget.path)/\(file.path)"
                            .addingPercentEncoding(
                                withAllowedCharacters: .urlPathAllowed
                            )!
                )
            else { continue }

            var request = URLRequest(url: url)
            request.timeoutInterval = 30
            let (body, response) = try await URLSession.shared.data(for: request)

            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw NSError(
                    domain: "GLWidgetUpdates",
                    code: http.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "\(file.path) answered \(http.statusCode)"
                    ]
                )
            }
            fetched.append((file.path, body))
        }

        for file in fetched {
            let destination = folder.appendingPathComponent(file.path)
            try FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try file.body.write(to: destination, options: .atomic)
        }
    }
}

// MARK: - the window

struct GLWidgetUpdates: View {
    @ObservedObject var model: WidgetUpdatesModel
    var close: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header

            Divider()

            switch model.phase {
            case .checking:
                message {
                    ProgressView()
                        .controlSize(.small)
                    Text("Checking GailanHub…")
                        .foregroundStyle(.secondary)
                }

            case .upToDate:
                message {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("Your widgets are up to date.")
                }

            case .failed(let reason):
                message {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("Could not reach GailanHub.")
                    Text(reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

            case .ready, .updating, .finished:
                list
            }

            Divider()

            footer
        }
        .frame(width: 520, height: 400)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 26, weight: .light))
                .foregroundStyle(.tint)

            VStack(alignment: .leading, spacing: 2) {
                Text("Widget Updates")
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(16)
    }

    private var subtitle: String {
        switch model.phase {
        case .checking:
            return "Reading the hub"
        case .upToDate:
            return "Nothing to install"
        case .failed:
            return "The check did not finish"
        case .updating:
            return "Installing"
        case .finished:
            let failed = model.available.filter {
                if case .failed = $0.state { return true }
                return false
            }.count
            return failed == 0 ? "Done" : "\(failed) could not be installed"
        case .ready:
            let count = model.available.count
            return count == 1
                ? "One widget has a newer version"
                : "\(count) widgets have newer versions"
        }
    }

    private var list: some View {
        ScrollView {
            // eager: a handful of rows, and a lazy stack draws nothing until it
            // has scroll geometry to work from
            VStack(spacing: 0) {
                ForEach(model.available) { item in
                    row(item)
                    Divider()
                }
            }
        }
    }

    private func row(_ item: WidgetUpdatesModel.Available) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Toggle(
                isOn: Binding(
                    get: { item.selected },
                    set: { _ in model.toggle(item.id) }
                )
            ) {
                EmptyView()
            }
            .labelsHidden()
            .disabled(model.phase != .ready)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(item.widget.title)
                        .fontWeight(.medium)
                    Text("\(item.installedVersion) to \(item.widget.version)")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }

                Text(item.widget.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if case .failed(let reason) = item.state {
                    Text(reason)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }

            Spacer()

            state(item.state)
                .frame(width: 18)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture {
            if model.phase == .ready { model.toggle(item.id) }
        }
    }

    @ViewBuilder
    private func state(_ state: WidgetUpdatesModel.Available.State) -> some View {
        switch state {
        case .waiting:
            EmptyView()
        case .updating:
            ProgressView().controlSize(.small)
        case .done:
            Image(systemName: "checkmark").foregroundStyle(.secondary)
        case .failed:
            Image(systemName: "exclamationmark.circle").foregroundStyle(.red)
        }
    }

    private func message<Content: View>(
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(spacing: 10, content: content)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
    }

    private var footer: some View {
        HStack {
            if model.phase == .ready {
                Button(model.allSelected ? "Deselect All" : "Select All") {
                    model.selectAll(!model.allSelected)
                }
                .buttonStyle(.borderless)
            }

            Spacer()

            switch model.phase {
            case .ready:
                Button("Not Now", action: close)
                Button(
                    model.selectedCount == 1
                        ? "Update 1 Widget"
                        : "Update \(model.selectedCount) Widgets"
                ) {
                    Task { await model.updateSelected() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(model.selectedCount == 0)

            case .updating:
                Button("Updating…") {}.disabled(true)

            case .checking:
                Button("Cancel", action: close)

            case .upToDate, .finished, .failed:
                Button("Done", action: close)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(12)
    }
}

// Handed to the app delegate, which has no way to build a SwiftUI window itself.
@MainActor
@objc(GLWidgetUpdatesWindow)
final class GLWidgetUpdatesWindow: NSObject {
    private static var shared: GLWidgetUpdatesWindow?

    private var window: NSWindow?
    private var model: WidgetUpdatesModel?

    /// Opened from the menu: the window appears first and reports what it finds,
    /// including that there was nothing to do.
    @objc static func show(_ widgetDirectory: String) {
        let updates = shared ?? GLWidgetUpdatesWindow()
        shared = updates
        updates.present(URL(fileURLWithPath: widgetDirectory), quietly: false)
    }

    /// Called on launch: checks first and stays out of the way unless there is
    /// something to install. Once a day is enough for widgets that ship as a few
    /// files.
    @objc static func checkQuietly(_ widgetDirectory: String) {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "checkWidgetUpdates") else { return }

        if let last = defaults.object(forKey: lastCheckKey) as? Date,
            Date().timeIntervalSince(last) < 60 * 60 * 24
        {
            return
        }

        let updates = shared ?? GLWidgetUpdatesWindow()
        shared = updates
        updates.present(URL(fileURLWithPath: widgetDirectory), quietly: true)
    }

    private func present(_ widgetDirectory: URL, quietly: Bool) {
        if let window, let model {
            if !quietly {
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
                Task { await model.check() }
            }
            return
        }

        let model = WidgetUpdatesModel(widgetDirectory: widgetDirectory)
        self.model = model

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 400),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Widget Updates"
        window.isReleasedWhenClosed = false
        window.center()
        window.contentView = NSHostingView(
            rootView: GLWidgetUpdates(model: model) { [weak self] in
                self?.window?.close()
            }
        )
        self.window = window

        if quietly {
            Task {
                await model.check()
                // nothing to install, so the user never learns a check happened
                guard case .ready = model.phase else { return }
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
            return
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Task { await model.check() }
    }
}
