const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../public/logo-source.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  // favicon.png 32x32 (fallback navigateurs)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, '../public/favicon-32.png'));

  // logo-512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, '../public/logo-512.png'));

  // apple-touch-icon.png 180x180 (iOS Safari)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, '../public/apple-touch-icon.png'));

  console.log('✓ favicon-32.png');
  console.log('✓ logo-512.png');
  console.log('✓ apple-touch-icon.png');
}

generate().catch(err => { console.error(err); process.exit(1); });
