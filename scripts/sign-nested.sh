#!/bin/sh
#
#  sign-nested.sh
#  Gailan
#
#  Copyright (c) 2026 Kevin Chen.
#
#  Released under the terms of the GNU General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version. See <http://www.gnu.org/licenses/> for
#  details.
#
# Signs the executables Xcode does not sign itself: the bundled node runtimes, the
# native modules, the esbuild binaries, and everything inside Sparkle. Run from the
# "Sign nested code" build phase, so it has Xcode's environment.
#
# Notarization refuses a bundle holding any executable without a valid signature, so
# a path that no longer exists has to stop the build rather than scroll past. This
# script exits on the first failure and says which path it was.

set -e

BUILD="${BUILT_PRODUCTS_DIR}"
APP="$BUILD/$CONTENTS_FOLDER_PATH"
FRAMEWORKS="$BUILD/$FRAMEWORKS_FOLDER_PATH"

# stamp the year the build happened into the copyright, before signing
#
# plutil rather than PlistBuddy: PlistBuddy takes its whole instruction as one string
# and parses that string itself, so a value holding spaces and punctuation has to be
# quoted twice and answered "Parse Error: Unclosed Quotes" when it was not. plutil
# takes the value as its own argument, so there is no second round of parsing.
PLIST="$APP/Info.plist"
CURRENT=$(/usr/bin/plutil -extract NSHumanReadableCopyright raw -o - "$PLIST" 2>/dev/null || true)
if [ -n "$CURRENT" ]; then
    STAMPED=$(printf '%s' "$CURRENT" | /usr/bin/sed "s/[0-9]\{4\}/$(date +%Y)/")
    /usr/bin/plutil -replace NSHumanReadableCopyright -string "$STAMPED" "$PLIST"
fi

IDENTITY="${CODE_SIGN_IDENTITY}"
if [ -z "$IDENTITY" ]; then
    # nothing configured means a local build, which ad-hoc signing is enough for
    IDENTITY="-"
fi

# Signed one at a time, innermost first, rather than with --deep. Apple's guidance is
# that --deep is for repairing a signature rather than producing one: it hands every
# nested binary the same entitlements, which is wrong here, since only the runtimes
# that execute generated code need the memory exception.
sign() {
    entitlements="$1"
    target="$2"

    if [ ! -e "$target" ]; then
        echo "error: nothing to sign at $target" >&2
        exit 1
    fi

    if [ -n "$entitlements" ]; then
        codesign --verbose --force --options runtime \
            --entitlements "$entitlements" --sign "$IDENTITY" "$target"
    else
        codesign --verbose --force --options runtime --sign "$IDENTITY" "$target"
    fi
}

# node runs the server and executes JavaScript it compiles at runtime, so it needs the
# unsigned executable memory exception the app's entitlements carry. esbuild does not,
# and neither does a native module.
sign "$CODE_SIGN_ENTITLEMENTS" "$APP/Resources/node-arm64"
sign "$CODE_SIGN_ENTITLEMENTS" "$APP/Resources/node-x64"
sign "" "$APP/Resources/node_modules/fsevents/fsevents.node"

# esbuild bundles the widgets, one binary per arch
for ARCH in arm64 x64; do
    ESBUILD="$APP/Resources/node_modules/@esbuild/darwin-$ARCH/bin/esbuild"
    if [ -f "$ESBUILD" ]; then
        sign "" "$ESBUILD"
    fi
done

# Sparkle 2 keeps its own updater, its XPC services and the framework binary inside
# Versions/B. The path this used to name, Versions/A/Resources/AutoUpdate.app, is the
# Sparkle 1 layout: it stopped existing when the app moved to Sparkle 2, codesign said
# so, and nothing was listening.
SPARKLE="$FRAMEWORKS/Sparkle.framework/Versions/B"
if [ -d "$SPARKLE" ]; then
    sign "" "$SPARKLE/XPCServices/org.sparkle-project.Downloader.xpc"
    sign "" "$SPARKLE/XPCServices/org.sparkle-project.InstallerLauncher.xpc"
    sign "" "$SPARKLE/Updater.app"
    sign "" "$SPARKLE/Autoupdate"
    sign "" "$FRAMEWORKS/Sparkle.framework"
else
    echo "error: Sparkle is not where this expects it: $SPARKLE" >&2
    exit 1
fi
