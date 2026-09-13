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

# Something to click. The address is drawn into the background as well, but a window
# background is wallpaper and carries no link, so the clickable one is a file.
cat > "$STAGE/Gailan Website.webloc" <<'WEBLOC'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>URL</key>
	<string>https://gailanapp.pages.dev</string>
</dict>
</plist>
WEBLOC

# The window's backdrop, drawn in the same language as the website. Finder wants one
# file holding both sizes, so the two pngs are folded into a tiff; without the 2x the
# window looks soft on every display made in the last decade.
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$STAGE/.background"
MINIMUM="$(/usr/bin/plutil -extract LSMinimumSystemVersion raw -o - \
  "$APP/Contents/Info.plist" 2>/dev/null || echo "13.5")"
swift "$HERE/make-dmg-background.swift" "$VERSION" "$MINIMUM" \
  "$STAGE/.background" > /dev/null
tiffutil -cathidpicheck "$STAGE/.background/background.png" \
  "$STAGE/.background/background@2x.png" -out "$STAGE/.background/background.tiff"
rm -f "$STAGE/.background/background.png" "$STAGE/.background/background@2x.png"

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
    -- the height here is the background's height exactly: bounds give the content
      -- rectangle, with no title bar counted in it
      set the bounds of container window to {200, 100, 800, 620}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 96
    set background picture of viewOptions to file ".background:background.tiff"
    set position of item "Gailan.app" of container window to {150, 180}
    set position of item "Applications" of container window to {450, 180}
    set position of item "Gailan Website.webloc" of container window to {300, 350}
    -- shown as "Gailan Website", the way the Applications symlink is shown as a
    -- folder. A symlink cannot point at a url, so the link itself is a webloc.
    set extension hidden of item "Gailan Website.webloc" of container window to true
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
