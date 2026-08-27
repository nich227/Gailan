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
project's deployment target, so keep the two in step.

`scripts/build-icons.js` regenerates the app icon, status icon and wordmark from the
bootstrap window-dock and eyeglasses paths. It needs `@resvg/resvg-js`, which is not a
project dependency; install it ad hoc when you touch the branding.

## Tests

    cd server && npm test        # backend then frontend
    npm run test-local           # spec/backend, plain node
    npm run test-dom             # spec/frontend, jsdom

Neither half needs a browser. `spec/frontend` used to be bundled and handed to
tape-run/electron, which cannot be installed on node 26 at all: the download works,
but `extract-zip` never settles its promise, so the postinstall exits successfully
having unpacked nothing. Those specs now run in jsdom via `spec/helpers/domEnv.js`,
which also maps `superagent` to its xhr build, because that is what browserify picks
for the widget bundle and what the specs' fake server can intercept.

Run tape through `spec/run.js` rather than piping to a formatter directly. `tape | tap-arc`
throws away tape's exit status, so a suite that dies on load prints "total: 0" and exits
0, and sh has no pipefail.

Two things bite on non-macOS machines:

  - `fsevents` is darwin-only. It sits in `optionalDependencies` so `npm install`
    works anywhere, but `directory_watcher_spec` cannot pass without it, and any
    `npm install` will prune a hand-made stub in `node_modules`.
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

Three deprecation warnings survive `npm install`: `glob@10` via stylus, and `glob@7` plus
`inflight` via browserify and tape. All three are already at their latest versions, so
there is nothing to bump.

Anything involving the cocoa app, the WKWebView, or real file-system events has to be
verified on macOS. Say so rather than implying it was tested.

## Releasing

Push a tag like `v1.0.2` and the release workflow does the rest: builds the app,
zips it, signs the zip with the EdDSA key in the `SPARKLE_ED_PRIVATE_KEY` secret,
publishes a GitHub Release, and adds an item to `updates.xml.rss` on `gh-pages`,
the appcast running apps poll via `SUFeedURL`. Sparkle compares the build number,
derived from the tag as `x*10000 + y*100 + z`, so it rises with the version; the
`CURRENT_PROJECT_VERSION` in the project stays at its dev value and is overridden
per release. The public key lives in `Gailan-Info.plist` as `SUPublicEDKey`; the
updater is a `SPUStandardUpdaterController` instantiated in `MainMenu.xib` (do not
reintroduce the deprecated `SUUpdater`). Signing happens in node
(`scripts/sign-release.js`) rather than Sparkle's `sign_update`, because CI has no
Keychain; the output is the same ed25519 signature either way.

## Conventions

  - Objective-C classes use the `GL` prefix. Two-space indent, brace on its own line
    for methods.
  - The node code is a mix of CoffeeScript (2.x) and JavaScript; prettier config is in
    `.prettierrc` (single quotes, trailing commas, no bracket spacing).
  - Comments are sparse and lowercase. Explain why, not what, and only when it is not
    obvious from the code.
  - Commit messages: short imperative subject, then prose explaining the reasoning.

## Settings

User defaults (registered in `GLPreferencesController`): `shell` (`zsh` default, `fish`),
`appearance` (`system`, `light`, `dark`, applied to `NSApp.appearance`, which widgets see
via `prefers-color-scheme`), `loginShell`, `enableInteraction`, `widgetDirectory`. The
shell reaches the node server as `--shell`; changing it restarts the server. fish gets
commands via `-c` because it cannot read them from the stdin pipe node hands it; zsh and
bash keep the stdin protocol. The deployment target is 13.5 (Node 26 requires it, so does
SMAppService), and `LSMinimumSystemVersion` enforces it at launch. Posting a widget-error
notification uses UserNotifications, which asks the user for authorization once.

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

  - `GLWidgetsStore deselectScreen` compares NSNumbers by pointer.
  - the status menu is built lazily: store changes set a dirty flag, the top-level
    items are rebuilt when tracking starts (`NSMenuDidBeginTrackingNotification`), and
    each widget's submenu is populated by `menuNeedsUpdate:` when it is about to be
    displayed (the submenu's title carries the widget id). Changes arriving while the
    menu is open render immediately, and widget error notifications stay on the eager
    path in `render`. Keep those splits if you touch `GLWidgetsController`.
