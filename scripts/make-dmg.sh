#!/bin/bash
#
# Builds the drag-to-Applications disk image from a built Gailan.app.
#
#   scripts/make-dmg.sh <path to Gailan.app> <version> [output.dmg]
#
# The window opens at a fixed size with the app on the left and an alias to
# /Applications on the right, which is the whole installer: drag one onto the
# other.

set -euo pipefail

APP="${1:?usage: make-dmg.sh <Gailan.app> <version> [out.dmg]}"
VERSION="${2:?missing version}"
OUT="${3:-Gailan-${VERSION}.dmg}"

STAGE="$(mktemp -d)/Gailan"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

RW="$(mktemp -u).dmg"
# room for the app plus slack; hdiutil grows the image as needed anyway
hdiutil create -srcfolder "$STAGE" -volname "Gailan $VERSION" \
  -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW -quiet "$RW"

MOUNT="$(hdiutil attach -readwrite -noverify -noautoopen "$RW" | \
  grep -Eo '/Volumes/.*$' | head -1)"

# icon positions and window geometry, the part that makes it look deliberate
osascript <<APPLESCRIPT
tell application "Finder"
  tell disk "$(basename "$MOUNT")"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 800, 480}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 96
    set position of item "Gailan.app" of container window to {150, 180}
    set position of item "Applications" of container window to {450, 180}
    close
    open
    update without registering applications
    delay 1
  end tell
end tell
APPLESCRIPT

chmod -Rf go-w "$MOUNT" || true
sync
hdiutil detach "$MOUNT" -quiet

rm -f "$OUT"
hdiutil convert "$RW" -format UDZO -imagekey zlib-level=9 -o "$OUT" -quiet
rm -f "$RW"

echo "$OUT"
