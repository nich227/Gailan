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
and points a WKWebView per screen at it. Widgets are esbuild bundles built on the fly;
the client mounts them with React. browserify still builds the client and server bundles.

`src/esbuildWidget.js` holds the widget pipeline. esbuild has no opinion about the parts
that are ours, so they are plugins: wrapping a classic widget's object
literal so `widgetify` can rewrite it (stylus in `style`, `ms` in `refreshFrequency`, the
injected `id`), and resolving `gailan` out of the client bundle through
`globalThis.require` so widgets do not each carry a copy of React. Only builds the watcher
starts emit `update`; rebuilds we ask for do not, or `WidgetBundler` rebuilding on `update`
would loop forever.

Bundles publish themselves into `globalThis.__gailanWidgets[id]`, which is what
`client.ts` reads after the script tag loads. esbuild ships as a native binary per
architecture, fetched by `scripts/fetch-esbuild.sh` with pinned hashes and ad-hoc signed
there, because Xcode's strip phase errors on an unsigned binary and skips a signed one.

## Building

Xcode drives everything: the "Compile JS" build phase runs `npm run release` in
`server/`, which fetches the node runtime and builds both bundles. From a terminal:

    make release     # fetch node + build both bundles
    make test        # npm install + npm test in server/
    ./scripts/fetch-node.sh

The bundled node binaries are not in git (~145MB each, over GitHub's file limit).
`scripts/fetch-node.sh` downloads them and checks them against the SHA256 sums
published by the Node project. To move versions, edit `NODE_VERSION` and both
checksums at the top of that script. Node 24 needs macOS 13.5, which is also the
project's deployment target, so keep the two in step.

`scripts/build-icons.js` regenerates the app icon, status icon and wordmark from the
bootstrap window-dock and eyeglasses paths. It needs `@resvg/resvg-js`, which is not a
project dependency; install it ad hoc when you touch the branding.

## Tests

    cd server && npm test        # backend then frontend
    npm run test-local           # spec/backend, plain node
    npm run test-dom             # spec/frontend, jsdom

Run them on macOS. This is a macOS app, and the directory watcher specs need real
fsevents: on Linux they need a stub that npm prunes on every install, and five of them
fail whatever you do. On a Mac the whole suite passes.

Neither half needs a browser. `spec/frontend` used to be bundled and handed to
tape-run/electron, whose installer could not unpack itself here: the download works,
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

1.0.0 was published and taken down because it was only ad-hoc signed. See
`docs/RERELEASING-1.0.0.md` for what is left to do once an Apple Developer
certificate exists.


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
  - The node code is TypeScript and JavaScript, no build step: node strips the types,
    which is why requires of `.ts` files carry the extension. prettier config is in
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
bash keep the stdin protocol. The deployment target is 13.5 (Node 24 requires it, so does
SMAppService), and `LSMinimumSystemVersion` enforces it at launch. Posting a widget-error
notification uses UserNotifications, which asks the user for authorization once.

## Migrating a widget from Übersicht

Asked to port a widget, the work is usually nothing. Check these in order and change only
what matches:

  - `#uebersicht` in a selector becomes `#gailan`. Check `main.css` in the widgets folder
    too, not just the widget. This is the only change most widgets need.
  - `from "uebersicht"` can stay. `server/src/legacyAlias.js` exposes the module under that
    id as well, so rewriting the import is optional.
  - `tracesOf.Uebersicht` in an AppleScript call becomes `com.nich227.Gailan`.
  - bash-only syntax in `command` (`shopt`, `[[ -o ...]]` idioms differing from zsh, bash
    arrays) either gets rewritten for zsh or the user switches the shell in Preferences.
  - a vendored native module gets rebuilt against Node 24.
  - `.jsx` still works, so do not convert a widget to `.tsx` unless asked; if converting,
    remember types are stripped and never checked, so a type error will not fail a build.

Paths, for copying widgets:

    ~/Library/Application Support/Übersicht/widgets     # source, the ü may be decomposed
    ~/Library/Application Support/Gailan/widgets        # destination

Settings do not transfer: per-widget screen and visibility choices live in the app, not in
the widget files, and have to be redone through the status bar menu. Do not try to migrate
`WidgetSettings.json` between the two, the widget ids differ once the file names do.

Do not suggest running both apps at once. Each renders every widget, and the app already
offers to quit Übersicht at launch.

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

  - a login shell that emits OSC escape sequences (shell integrations do this) prepends
    them to widget command output. `command_server_spec`'s login shell test fails on such
    a machine for the same reason.

  - the status menu is built lazily: store changes set a dirty flag, the top-level
    items are rebuilt when tracking starts (`NSMenuDidBeginTrackingNotification`), and
    each widget's submenu is populated by `menuNeedsUpdate:` when it is about to be
    displayed (the submenu's title carries the widget id). Changes arriving while the
    menu is open render immediately, and widget error notifications stay on the eager
    path in `render`. Keep those splits if you touch `GLWidgetsController`.
