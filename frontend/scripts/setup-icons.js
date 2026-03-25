const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..', 'public', 'icons');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const REQUIRED_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Map each required size to its canonical filename
const requiredFiles = REQUIRED_SIZES.map(size => ({
  size,
  filename: `icon-${size}x${size}.png`,
  filepath: path.join(SOURCE_DIR, `icon-${size}x${size}.png`),
}));

// Also check for root-level files
const ROOT_TARGETS = [
  { filename: 'apple-touch-icon.png', size: 180 },
  { filename: 'favicon-32x32.png',    size: 32  },
  { filename: 'favicon-16x16.png',    size: 16  },
];

async function findLargestSource() {
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.png'));
  let best = null;
  let bestSize = 0;

  for (const file of files) {
    // Try to parse size from icon-NxN.png or N.png or icon-N.png
    const match = file.match(/(\d+)/);
    if (!match) continue;
    const n = parseInt(match[1], 10);
    if (n > bestSize) {
      bestSize = n;
      best = path.join(SOURCE_DIR, file);
    }
  }
  return best;
}

async function run() {
  if (!fs.existsSync(SOURCE_DIR)) fs.mkdirSync(SOURCE_DIR, { recursive: true });

  // Inventory what we already have (correctly named)
  const existing = new Set(fs.readdirSync(SOURCE_DIR));

  const missing = requiredFiles.filter(r => !existing.has(r.filename));

  if (missing.length === 0) {
    console.log('All required icon sizes already present in public/icons/');
  } else {
    console.log(`Missing sizes: ${missing.map(r => r.size).join(', ')}px — generating from largest source...`);

    const src = await findLargestSource();
    if (!src) {
      console.error('No source PNG found in public/icons/ to resize from. Aborting.');
      process.exit(1);
    }
    console.log(`Using source: ${path.basename(src)}`);

    for (const { size, filename, filepath } of missing) {
      await sharp(src).resize(size, size).png().toFile(filepath);
      console.log(`  Generated ${filename}`);
    }
  }

  // Ensure root-level files exist (apple-touch-icon, favicons)
  const src512 = path.join(SOURCE_DIR, 'icon-512x512.png');
  const fallbackSrc = (await findLargestSource()) || src512;

  for (const { filename, size } of ROOT_TARGETS) {
    const dest = path.join(PUBLIC_DIR, filename);
    if (!fs.existsSync(dest)) {
      await sharp(fallbackSrc).resize(size, size).png().toFile(dest);
      console.log(`Generated public/${filename}`);
    } else {
      console.log(`Exists:  public/${filename}`);
    }
  }

  console.log('\nDone. Final public/icons/ contents:');
  fs.readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.png'))
    .sort()
    .forEach(f => console.log(`  ${f}`));
}

run().catch(err => { console.error(err); process.exit(1); });
