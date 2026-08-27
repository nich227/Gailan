# Releasing 1.0.0, signed

1.0.0 was built, published, and then taken down because the app was only ad-hoc
signed: every download hit Gatekeeper and needed a right-click to open. The release,
the tag, and the appcast entry are all gone, so nobody is running it and 1.0.0 can be
reused as the version number.

Everything below is what remains to be done once an Apple Developer Program
membership is active. The release pipeline itself already works: it built, signed with
the Sparkle key, notarized nothing, published a dmg and a zip, and updated the appcast.
Only Apple signing is missing.

## Compatibility

Gailan is not backwards compatible with Übersicht. The app name, bundle id
(`com.nich227.Gailan`) and support directory are all different, so it installs alongside
Übersicht rather than upgrading it, and no Übersicht install will ever see this release
through its own updater. Widget code is compatible, since the widget API did not change;
settings and the widgets folder are not carried over. Node went from 16 to 26, so a widget
that depends on old Node behaviour or ships a native module built against Node 16 has to be
rebuilt. None of this changes what the release process does, but it is what the release
notes have to keep saying.

## What is already in place

- `.github/workflows/release.yml` builds on a tag, makes the zip and the dmg, signs the
  zip with the Sparkle EdDSA key, publishes the GitHub release, and adds an item to
  `updates.xml.rss` on the `gh-pages` branch.
- `scripts/make-dmg.sh` produces the drag-to-Applications image.
- `docs/release-notes/1.0.0.md` is the changelog the release body is taken from. It
  covers the compatibility break, the dependency jumps, the security work, and the
  measured performance figures. Keep the numbers in it measured rather than estimated.
- `SPARKLE_ED_PRIVATE_KEY` is a repository secret. The matching public key is
  `SUPublicEDKey` in `Gailan/Gailan-Info.plist`.
- The build number comes from the tag, `x*10000 + y*100 + z`, so `v1.0.0` is 10000.

## What is needed from Apple

1. A **Developer ID Application** certificate. Either export it from Keychain Access as
   a `.p12` with a password, or generate the CSR on the Mac so the private key never
   leaves it and download the certificate from the developer portal.
2. An **app-specific password** for notarization, from appleid.apple.com under Sign-In
   and Security.
3. The **Team ID**, visible in the membership details of the developer portal.

## Secrets to add

    gh secret set APPLE_CERT_P12 --repo nich227/Gailan < cert.p12.base64
    gh secret set APPLE_CERT_PASSWORD --repo nich227/Gailan
    gh secret set APPLE_ID --repo nich227/Gailan
    gh secret set APPLE_APP_PASSWORD --repo nich227/Gailan
    gh secret set APPLE_TEAM_ID --repo nich227/Gailan

The `.p12` has to be base64 encoded to survive as a secret:

    base64 -i cert.p12 -o cert.p12.base64

## Workflow changes

In the `release` job, before the build:

- Create a temporary keychain, import the `.p12` into it, unlock it, and set it as the
  default so `xcodebuild` can find the identity. Delete it in an `always()` step.

In the build step:

- Replace `CODE_SIGN_IDENTITY=-` and `CODE_SIGNING_REQUIRED=NO` with the real identity
  (`"Developer ID Application: <name> (<team id>)"`), `CODE_SIGNING_REQUIRED=YES`, and
  `DEVELOPMENT_TEAM=<team id>`.
- Turn on the hardened runtime (`ENABLE_HARDENED_RUNTIME=YES`). The existing "Run
  Script" build phase already signs the two bundled `node` binaries, the fsevents
  native module, and Sparkle's AutoUpdate app individually, which the hardened runtime
  requires; it uses `${CODE_SIGN_IDENTITY}`, so it picks up the real identity without
  changes.

After the build:

- Notarize the zip and staple the dmg:

      xcrun notarytool submit "Gailan-$VERSION.zip" \
        --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
        --password "$APPLE_APP_PASSWORD" --wait
      xcrun stapler staple "Gailan-$VERSION.dmg"

  Notarization is what removes the Gatekeeper warning. It usually takes a few minutes,
  so the job gets slower but stays unattended. Staple the dmg after notarizing, then
  attach both files to the release as it already does.

## Cutting the release

    git tag v1.0.0
    git push origin v1.0.0

The workflow does the rest. If a run fails partway, delete the release, the tag, and
the appcast item before retrying, the same cleanup that was done when 1.0.0 came down:

    gh release delete v1.0.0 --repo nich227/Gailan --yes
    git push --delete origin v1.0.0 && git tag -d v1.0.0
    # then remove the <item> from updates.xml.rss on gh-pages

## Verifying afterwards

Signing and the hardened runtime change how the app talks to the system, so check these
on a Mac rather than assuming:

    spctl --assess --type execute -vv /Applications/Gailan.app   # should say accepted
    codesign --verify --deep --strict --verbose=2 /Applications/Gailan.app
    xcrun stapler validate Gailan-1.0.0.dmg

Then download the dmg, drag it to Applications, and confirm it opens with a double
click and no warning. After that, exercise the parts most likely to be affected:

- widgets render, which means the token handoff over the server's stdin still works
- Open Gailan at Login toggles, which is `SMAppService` and is registration-sensitive
- a widget error produces a notification, which needs the UserNotifications
  authorization prompt to appear
- Check for Updates reports no update available, since 1.0.0 will be the newest entry

## If 1.0.0 has already been downloaded by then

Reusing a version number is only safe while nobody has it installed, because Sparkle
compares build numbers and would not offer 10000 to someone already on 10000. If the
unsigned dmg has escaped by the time this is done, release 1.0.1 instead and let the
update mechanism carry people forward.
