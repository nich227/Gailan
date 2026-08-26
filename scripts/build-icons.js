// Renders the Gailan branding assets: bootstrap window-dock with a tiny pair of
// eyeglasses sitting in the middle of the desktop area.
const fs = require('fs');
const {Resvg} = require('@resvg/resvg-js');

const OUT = require('path').join(__dirname, '..', 'Gailan');
const NAVY = '#151b2c';

// bootstrap-icons 1.11.3, window-dock
const DOCK_KEYS =
  'M3.5 11a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm3.5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm4.5-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5z';
const DOCK_FRAME =
  'M14 1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zM2 14h12a1 1 0 0 0 1-1V5H1v8a1 1 0 0 0 1 1M2 2a1 1 0 0 0-1 1v1h14V3a1 1 0 0 0-1-1z';
// bootstrap-icons 1.11.3, eyeglasses
const GLASSES =
  'M4 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4m2.625.547a3 3 0 0 0-5.584.953H.5a.5.5 0 0 0 0 1h.541A3 3 0 0 0 7 8a1 1 0 0 1 2 0 3 3 0 0 0 5.959.5h.541a.5.5 0 0 0 0-1h-.541a3 3 0 0 0-5.584-.953A2 2 0 0 0 8 6c-.532 0-1.016.208-1.375.547M14 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0';

// glasses centred in the desktop area, between title bar and dock
function mark(color, glassesScale) {
  return `
    <g fill="${color}">
      <path d="${DOCK_FRAME}"/>
      <path d="${DOCK_KEYS}"/>
      <g transform="translate(8 7.9) scale(${glassesScale}) translate(-8 -8)">
        <path d="${GLASSES}"/>
      </g>
    </g>`;
}

function render(svg, width) {
  return new Resvg(svg, {
    font: {loadSystemFonts: true, defaultFontFamily: 'Noto Sans'},
    fitTo: {mode: 'width', value: width},
  })
    .render()
    .asPng();
}

function write(file, buffer) {
  fs.writeFileSync(`${OUT}/${file}`, buffer);
  console.log(file, buffer.length, 'bytes');
}

// app icon: mark on the tinted disc upstream used
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="disc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7ecf0"/>
      <stop offset="0.55" stop-color="#eaeaf1"/>
      <stop offset="1" stop-color="#dae5f1"/>
    </linearGradient>
  </defs>
  <circle cx="512" cy="512" r="502" fill="url(#disc)" stroke="${NAVY}" stroke-width="6"/>
  <g transform="translate(212 250) scale(37.5)">${mark(NAVY, 0.4)}</g>
</svg>`;

const appIconSizes = [
  ['16.png', 16],
  ['16@2x.png', 32],
  ['32.png', 32],
  ['32@2x.png', 64],
  ['128.png', 128],
  ['128@2x.png', 256],
  ['256.png', 256],
  ['256@2x.png', 512],
  ['512.png', 512],
  ['512@2x.png', 1024],
];
for (const [file, size] of appIconSizes) {
  write(`Images.xcassets/AppIcon.appiconset/${file}`, render(appIcon, size));
}

// menu bar icon: template image, needs to read at 16pt so the glasses are bigger
const statusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 0.5 17 15">
  ${mark(NAVY, 0.46)}
</svg>`;
write('status-icon.png', render(statusIcon, 16));
write('status-icon@2x.png', render(statusIcon, 32));

// wordmark, copied into the default widget directory as logo.png
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 168">
  <g transform="translate(6 18) scale(6.5)">${mark(NAVY, 0.4)}</g>
  <text x="124" y="104" font-family="Noto Sans" font-size="62" fill="${NAVY}">Gailan</text>
  <line x1="6" y1="132" x2="346" y2="132" stroke="${NAVY}" stroke-width="1" opacity="0.35"/>
  <text x="346" y="158" font-family="Noto Sans" font-size="20" fill="#5b6070"
        text-anchor="end">概览 · gàilǎn</text>
</svg>`;

write('gailan-logo.png', render(logo, 352));
