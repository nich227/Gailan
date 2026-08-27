// Signs a release archive with the Sparkle EdDSA key and prints
// GITHUB_OUTPUT lines. The key arrives as the base64 raw ed25519 seed in
// SPARKLE_ED_PRIVATE_KEY; the signature is what Sparkle checks against
// SUPublicEDKey from the app's Info.plist.
const crypto = require('crypto');
const fs = require('fs');

const file = process.argv[2];
if (!file || !process.env.SPARKLE_ED_PRIVATE_KEY) {
  console.error('usage: SPARKLE_ED_PRIVATE_KEY=<b64 seed> node sign-release.js <archive>');
  process.exit(1);
}

const seed = Buffer.from(process.env.SPARKLE_ED_PRIVATE_KEY.trim(), 'base64');
if (seed.length !== 32) {
  console.error('the key must be the base64 of a 32 byte ed25519 seed');
  process.exit(1);
}

// pkcs8 wrapper for a raw ed25519 seed
const pkcs8 = Buffer.concat([
  Buffer.from('302e020100300506032b657004220420', 'hex'),
  seed,
]);
const key = crypto.createPrivateKey({key: pkcs8, format: 'der', type: 'pkcs8'});

const data = fs.readFileSync(file);
const signature = crypto.sign(null, data, key).toString('base64');

console.log(`signature=${signature}`);
console.log(`length=${data.length}`);
