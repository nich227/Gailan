// Adds a release to updates.xml.rss (the Sparkle appcast). Creates the file
// if this is the first release. Newest items go first.
//
//   node update-appcast.js <appcast> <version> <build> <url> <length> <signature> [notes.md]
const fs = require('fs');

const [file, version, build, url, length, signature, notesFile] =
  process.argv.slice(2);
if (!signature) {
  console.error(
    'usage: node update-appcast.js <appcast> <version> <build> <url> <length> <signature> [notes]',
  );
  process.exit(1);
}

const skeleton = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Gailan</title>
    <link>https://gailanapp.pages.dev</link>
    <description>Gailan updates</description>
    <language>en</language>
    <!-- items -->
  </channel>
</rss>
`;

/* Enough markdown for release notes: paragraphs, bullets, bold, code and links.
   A full parser is not worth a dependency here, and the notes are ours, so what
   they use is known. */
function htmlFromMarkdown(markdown) {
  const inline = (text) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const blocks = markdown.trim().split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim());

      if (lines.every((line) => /^[-*] /.test(line))) {
        const items = lines
          .map((line) => `      <li>${inline(line.slice(2))}</li>`)
          .join('\n');
        return `      <ul>\n${items}\n      </ul>`;
      }

      const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        // the update window is small, so nothing above h3, which is what Übersicht used
        const level = Math.max(3, Math.min(6, heading[1].length));
        return `      <h${level}>${inline(heading[2])}</h${level}>`;
      }

      return `      <p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}

/* Sparkle shows either the notes carried in the item or a page fetched from
   sparkle:releaseNotesLink, and the link wins where both are present. Pointing it at
   the GitHub release meant the update window rendered that whole page, repository
   furniture and all, rather than what changed. So the notes travel in the item, which
   is what Übersicht did, and the window shows a changelog. */
function releaseNotes() {
  if (!notesFile || !fs.existsSync(notesFile)) {
    return `      <p>Gailan ${version}.</p>`;
  }
  return htmlFromMarkdown(fs.readFileSync(notesFile, 'utf8'));
}

const notes = `${releaseNotes()}
      <p>
        <a href="https://github.com/nich227/Gailan/releases/tag/v${version}">All the
        details for ${version}</a>
      </p>`;

const item = `    <item>
      <title>${version}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${build}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>13.5</sparkle:minimumSystemVersion>
      <description>
        <![CDATA[
${notes}
        ]]>
      </description>
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
