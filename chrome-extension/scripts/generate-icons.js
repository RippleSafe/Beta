const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128, 192];
const inputSvg = path.join(__dirname, '../../public/RippleSafeLogo/vector/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy SVG
fs.copyFileSync(inputSvg, path.join(outputDir, 'icon.svg'));

// Generate PNGs
sizes.forEach(size => {
  sharp(inputSvg)
    .resize(size, size)
    .png()
    .toFile(path.join(outputDir, `icon${size}.png`))
    .then(() => console.log(`Generated ${size}x${size} icon`))
    .catch(err => console.error(`Error generating ${size}x${size} icon:`, err));
}); 