# AGENTS.md

Notes for coding agents working on Gailan. Gailan is a fork of
[Übersicht](https://github.com/felixhageloh/uebersicht); it runs shell commands on a
schedule and draws the output on the macOS desktop.

## Layout

    Gailan/            cocoa app (objective-c, GL class prefix)
    GailanTests/       xctest target
    Gailan.xcodeproj/  app project, target and scheme are all named Gailan
    Pods/              checked-in pods (SocketRocket, Sparkle)
    server/            node app: bundles widgets, serves them, runs commands
    server/src/        both halves of the node app, client and server
    server/release/    what gets copied into the app bundle
    scripts/           node runtime fetcher, icon renderer

The app spawns `server/release/localnode` (which picks the right bundled node binary)
and points a WKWebView per screen at it. Widgets are browserify bundles built on the
fly; the client mounts them with React.

## Building

Xcode drives everything: the "Compile JS" build phase runs `npm run release` in
`server/`, which fetches the node runtime and builds both bundles. From a terminal:

    make release     # fetch node + build both bundles
    make test        # npm install + npm test in server/
    ./scripts/fetch-node.sh

The bundled node binaries are not in git (~145MB each, over GitHub's file limit).
`scripts/fetch-node.sh` downloads them and checks them against the SHA256 sums
published by the Node project. To move versions, edit `NODE_VERSION` and both
checksums at the top of that script. Node 26 needs macOS 13.5, which is also the
project's deployment target — keep the two in step.

`scripts/build-icons.js` regenerates the app icon, status icon and wordmark from the
bootstrap window-dock and eyeglasses paths. It needs `@resvg/resvg-js`, which is not a
project dependency; install it ad hoc when you touch the branding.

## Tests

    cd server && npm test        # backend (tape) then frontend (tape-run, needs a browser)

`spec/backend` runs under plain node. `spec/frontend` needs a DOM and is driven by
tape-run/electron.

Electron cannot install on node 26: its postinstall downloads the zip fine, but
`extract-zip` never settles its promise, so the script exits successfully having
unpacked nothing and electron reports "failed to install correctly". CI therefore
enforces `npm run test-local` and treats `npm run test-browser` as best effort. To run
the frontend specs, use an older node for that step, or swap tape-run for a maintained
runner. `allowScripts` in package.json is what lets electron's postinstall run at all
under npm 11's script gating.

Two things bite on non-macOS machines:

  - `fsevents` is darwin-only. It sits in `optionalDependencies` so `npm install`
    works anywhere, but `directory_watcher_spec` cannot pass without it.
  - the socket and command-server specs prefer their usual ports and fall back to a
    random free one (`spec/helpers/testPort.js`), so a busy dev machine will not fail
    the run.

`directory_watcher_events_spec.js` fakes fsevents so the watcher's event handling can
be exercised anywhere; `directory_watcher_spec.js` uses the real thing and only reports
properly on a Mac. Prefer the fake one when changing event logic.

If a spec starts an http server, tear it down with `closeAllConnections()` and wait for
`close()` to call back. `close()` on its own leaves established keep-alive sockets up,
and a client holding one while the next server starts gets a hang-up mid-request, which
takes the whole run down.

Anything involving the cocoa app, the WKWebView, or real file-system events has to be
verified on macOS. Say so rather than implying it was tested.

## Conventions

  - Objective-C classes use the `GL` prefix. Two-space indent, brace on its own line
    for methods.
  - The node code is a mix of CoffeeScript (2.x) and JavaScript; prettier config is in
    `.prettierrc` (single quotes, trailing commas, no bracket spacing).
  - Comments are sparse and lowercase. Explain why, not what, and only when it is not
    obvious from the code.
  - Commit messages: short imperative subject, then prose explaining the reasoning.

## Compatibility to keep in mind

  - Widgets are user-written and live outside the repo. The public surface is the
    `gailan` module (`server/src/gailan.js`), the widget properties documented in
    the README, and `window.$`/`window.html`. Breaking any of it breaks other
    people's widgets.
  - `require('uebersicht')` still resolves, via `server/src/legacyAlias.js`. jQuery is
    pinned to 3.x because classic widgets use APIs that jQuery 4 removed.
  - The AppleScript dictionary (`Gailan/Gailan.sdef`) keeps upstream's four-character
    codes. They are opaque, and changing them buys nothing.
  - Settings live in `~/Library/Application Support/Gailan`, widgets in its `widgets`
    subdirectory.

## Known rough edges

  - `findFiles` stats every directory entry; `readdir` with `withFileTypes` would cut
    that down, but symlinked widget directories need the stat to keep working.
  - `WidgetBundler` calls `fs.statSync` inside an async callback.
  - `GLWidgetsStore deselectScreen` compares NSNumbers by pointer.
