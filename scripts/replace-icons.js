const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'frontend', 'public', 'icons', 'icon-512x512.png');

// PWA icons
const pwaDir = path.join(__dirname, '..', 'frontend', 'public', 'icons');
const pwaSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Android mipmap folders and their icon sizes
const androidBase = path.join(__dirname, '..', 'frontend', 'android', 'app', 'src', 'main', 'res');
const androidSizes = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

async function resizeTo(destPath, size) {
  const tmp = destPath + '.tmp';
  await sharp(src).resize(size, size).png().toFile(tmp);
  fs.renameSync(tmp, destPath);
}

async function run() {
  // Generate PWA icons (use temp file to avoid input=output conflict on 512)
  for (const size of pwaSizes) {
    const dest = path.join(pwaDir, `icon-${size}x${size}.png`);
    await resizeTo(dest, size);
    console.log(`PWA: icon-${size}x${size}.png`);
  }

  // apple-touch-icon (180x180)
  await resizeTo(path.join(__dirname, '..', 'frontend', 'public', 'apple-touch-icon.png'), 180);
  console.log('PWA: apple-touch-icon.png');

  // favicon-32 and favicon-16
  await resizeTo(path.join(__dirname, '..', 'frontend', 'public', 'favicon-32x32.png'), 32);
  await resizeTo(path.join(__dirname, '..', 'frontend', 'public', 'favicon-16x16.png'), 16);
  console.log('PWA: favicons done');

  // Generate Android icons
  for (const { folder, size } of androidSizes) {
    const dir = path.join(androidBase, folder);
    if (!fs.existsSync(dir)) {
      console.log(`Skipping ${folder} — folder not found`);
      continue;
    }
    await resizeTo(path.join(dir, 'ic_launcher.png'), size);
    await resizeTo(path.join(dir, 'ic_launcher_round.png'), size);
    await resizeTo(path.join(dir, 'ic_launcher_foreground.png'), size);
    console.log(`Android: ${folder} (${size}x${size})`);
  }

  console.log('\nAll icons replaced successfully!');
}

run().catch(console.error);
