// Adds a release to updates.xml.rss (the Sparkle appcast). Creates the file
// if this is the first release. Newest items go first.
//
//   node update-appcast.js <appcast> <version> <build> <url> <length> <signature>
const fs = require('fs');

const [file, version, build, url, length, signature] = process.argv.slice(2);
if (!signature) {
  console.error('usage: node update-appcast.js <appcast> <version> <build> <url> <length> <signature>');
  process.exit(1);
}

const skeleton = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Gailan</title>
    <link>https://github.com/nich227/Gailan</link>
    <description>Gailan updates</description>
    <language>en</language>
    <!-- items -->
  </channel>
</rss>
`;

const item = `    <item>
      <title>${version}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${build}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>13.5</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>https://github.com/nich227/Gailan/releases/tag/v${version}</sparkle:releaseNotesLink>
      <enclosure url="${url}" length="${length}" type="application/octet-stream" sparkle:edSignature="${signature}"/>
    </item>
`;

const marker = '    <!-- items -->\n';
let appcast = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : skeleton;
if (!appcast.includes(marker)) {
  console.error('appcast has no <!-- items --> marker');
  process.exit(1);
}
if (appcast.includes(`<sparkle:version>${build}</sparkle:version>`)) {
  console.error(`build ${build} is already in the appcast`);
  process.exit(1);
}

fs.writeFileSync(file, appcast.replace(marker, marker + item));
console.log(`added ${version} (build ${build}) to ${file}`);
