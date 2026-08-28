//
//  GLAbout.swift
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

// The standard about panel puts the app icon next to a version number. This shows
// the same mark and wordmark the starter widget shows, from the same two images, so
// the app introduces itself the way it looks on the desktop and on the website.

private func bundleImage(_ name: String) -> NSImage? {
    guard let url = Bundle.main.url(forResource: name, withExtension: "png") else {
        return nil
    }
    return NSImage(contentsOf: url)
}

struct GLAbout: View {
    @Environment(\.colorScheme) private var colorScheme

    private var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let short = info["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = info["CFBundleVersion"] as? String ?? ""
        return build.isEmpty || build == short
            ? "Version \(short)"
            : "Version \(short) (\(build))"
    }

    private var copyright: String {
        Bundle.main.infoDictionary?["NSHumanReadableCopyright"] as? String ?? ""
    }

    private var brand: NSImage? {
        // the dark artwork is the light one inverted, so it needs the same swap the
        // widget makes with prefers-color-scheme
        bundleImage(colorScheme == .dark ? "gailan-brand-dark" : "gailan-brand")
    }

    var body: some View {
        VStack(spacing: 0) {
            if let brand {
                Image(nsImage: brand)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 167)
                    .padding(.top, 26)
                    .padding(.bottom, 20)
                    .accessibilityLabel("Gailan")
            }

            Text(version)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

            Divider()
                .padding(.horizontal, 30)
                .padding(.vertical, 18)

            VStack(spacing: 10) {
                Text("Widgets on your desktop, written as files in a folder.")
                    .font(.callout)
                    .multilineTextAlignment(.center)

                Text(
                    "A fork of Übersicht by Felix Hageloh, whose work this is built on."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 26)

            HStack(spacing: 14) {
                Link("Website", destination: URL(string: "https://gailanapp.pages.dev")!)
                Link(
                    "Widgets",
                    destination: URL(string: "https://gailanapp.pages.dev/hub")!
                )
                Link(
                    "Source",
                    destination: URL(string: "https://github.com/nich227/Gailan")!
                )
            }
            .font(.callout)
            .padding(.top, 18)

            Spacer(minLength: 18)

            Text(copyright)
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)
                .padding(.bottom, 18)
        }
        .frame(width: 340, height: 470)
    }
}

// Handed to the app delegate, which has no way to build a SwiftUI window itself.
@MainActor
@objc(GLAboutWindow)
final class GLAboutWindow: NSObject {
    private static var shared: GLAboutWindow?

    private var window: NSWindow?

    @objc static func show() {
        let about = shared ?? GLAboutWindow()
        shared = about
        about.present()
    }

    private func present() {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 470),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "About Gailan"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false
        window.center()
        window.contentView = NSHostingView(rootView: GLAbout())

        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
