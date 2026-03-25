const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Premium icon — dark charcoal, custom gold F paths, integrated diagonal arrow
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <!-- Charcoal background — matches reference's warm dark grey -->
    <radialGradient id="bgGrad" cx="42%" cy="38%" r="72%">
      <stop offset="0%"   stop-color="#2a2b3d"/>
      <stop offset="50%"  stop-color="#1a1b2c"/>
      <stop offset="100%" stop-color="#0c0c18"/>
    </radialGradient>

    <!-- Edge vignette -->
    <radialGradient id="vignette" cx="50%" cy="50%" r="68%">
      <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>

    <!-- Metallic gold: diagonal light from upper-right -->
    <linearGradient id="goldMetal" x1="0%" y1="100%" x2="100%" y2="0%"
                    gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#5a3e0a"/>
      <stop offset="20%"  stop-color="#a87828"/>
      <stop offset="42%"  stop-color="#e8c858"/>
      <stop offset="58%"  stop-color="#f8ec90"/>
      <stop offset="75%"  stop-color="#d4a840"/>
      <stop offset="90%"  stop-color="#a07828"/>
      <stop offset="100%" stop-color="#7a5c18"/>
    </linearGradient>

    <!-- Gold mapped to full canvas for consistent F + arrow colour -->
    <linearGradient id="goldCanvas"
                    gradientUnits="userSpaceOnUse"
                    x1="60" y1="450" x2="460" y2="100">
      <stop offset="0%"   stop-color="#4a3008"/>
      <stop offset="15%"  stop-color="#9a7020"/>
      <stop offset="35%"  stop-color="#ddb840"/>
      <stop offset="52%"  stop-color="#f8ec90"/>
      <stop offset="68%"  stop-color="#e8c858"/>
      <stop offset="82%"  stop-color="#c09030"/>
      <stop offset="100%" stop-color="#e0b040"/>
    </linearGradient>

    <!-- Clip path: italic bold F with forced skew for strong italic lean -->
    <clipPath id="fClip">
      <text x="256" y="368"
            font-family="'Arial Black', Impact, 'Franklin Gothic Heavy', sans-serif"
            font-size="318" font-weight="900" font-style="italic"
            text-anchor="middle"
            transform="translate(256,368) skewX(-14) translate(-256,-368)">F</text>
    </clipPath>

    <!-- F ambient bloom (blurred gold behind letter) -->
    <filter id="fBloom" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>

    <!-- F crisp shadow -->
    <filter id="fShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000" flood-opacity="0.9"/>
    </filter>

    <!-- Arrow glow -->
    <filter id="arrowGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background layers -->
  <rect width="512" height="512" rx="90" fill="url(#bgGrad)"/>
  <rect width="512" height="512" rx="90" fill="url(#vignette)"/>
  <!-- Top gloss sheen -->
  <rect x="18" y="18" width="476" height="210" rx="74" fill="white" opacity="0.028"/>

  <!-- F ambient glow behind the letter -->
  <rect width="512" height="512"
        fill="#c8a040" opacity="0.22"
        clip-path="url(#fClip)"
        filter="url(#fBloom)"/>

  <!-- F — gold metallic fill via clip path -->
  <rect width="512" height="512"
        fill="url(#goldCanvas)"
        clip-path="url(#fClip)"
        filter="url(#fShadow)"/>

  <!-- F highlight layer: subtle bright overlay for metallic sheen -->
  <rect width="512" height="512"
        fill="white" opacity="0.08"
        clip-path="url(#fClip)"/>

  <!-- Arrow: cuts diagonally across F from lower-left to upper-right -->
  <!-- Glow bloom -->
  <line x1="82" y1="448" x2="452" y2="110"
        stroke="#d4a840" stroke-width="68" stroke-linecap="round"
        opacity="0.18"/>
  <!-- Main stroke -->
  <line x1="82" y1="448" x2="452" y2="110"
        stroke="url(#goldCanvas)" stroke-width="32" stroke-linecap="round"
        filter="url(#arrowGlow)"/>
  <!-- Arrowhead: solid gold triangle -->
  <polygon points="452,103 438,156 414,140"
           fill="#f8ec90" filter="url(#arrowGlow)"/>
</svg>`;

const svgBuffer = Buffer.from(svgIcon);

async function generateIcons() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`Generated ${size}x${size}`);
  }

  // Apple touch icon (180x180)
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(__dirname, '..', 'public', 'apple-touch-icon.png'));

  // favicon (32x32)
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(__dirname, '..', 'public', 'favicon-32x32.png'));

  // favicon (16x16)
  await sharp(svgBuffer).resize(16, 16).png().toFile(path.join(__dirname, '..', 'public', 'favicon-16x16.png'));

  console.log('All icons generated!');
}

generateIcons();
