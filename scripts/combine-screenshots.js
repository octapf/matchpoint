/**
 * Une dos PNG en horizontal: quita fondo claro (opaco o semitransparente) y acerca los móviles.
 * Uso: node scripts/combine-screenshots.js
 */
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '../assets/images/screenshots');
const LEFT = path.join(DIR, 'screenshot-01-tournaments.png');
const RIGHT = path.join(DIR, 'screenshot-02-detail-phone-left.png');
const OUT = path.join(DIR, 'screenshot-01-02-combined.png');
/** Solapamiento horizontal en px (más valor = más pegados) */
const OVERLAP = 32;

/**
 * Inundación desde todos los bordes: borra fondo claro conectado al exterior.
 * No atraviesa píxeles muy oscuros (marco del móvil / UI).
 */
function floodRemoveBackgroundFromEdges(data, width, height, channels, opts = {}) {
  const stopDark = opts.stopDark ?? 72; // por debajo = móvil / contenido oscuro, no borrar ni atravesar mal
  const seedMinLum = opts.seedMinLum ?? 140; // semillas solo en bordes bastante claros

  const visited = new Uint8Array(width * height);
  const queue = [];
  const idx = (x, y) => y * width + x;

  function lumAt(x, y) {
    const i = (y * width + x) * channels;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  }

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      if (lumAt(x, y) >= seedMinLum) queue.push([x, y]);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      if (lumAt(x, y) >= seedMinLum) queue.push([x, y]);
    }
  }

  while (queue.length) {
    const [x, y] = queue.shift();
    const vi = idx(x, y);
    if (visited[vi]) continue;
    visited[vi] = 1;

    const i = vi * channels;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum < stopDark) continue;

    data[i + 3] = 0;

    const n = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of n) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) queue.push([nx, ny]);
    }
  }
}

/**
 * Limpia halos con alpha bajo.
 */
function flattenFringeAlpha(data, width, height, channels, alphaCut = 90) {
  for (let i = 0; i < data.length; i += channels) {
    if (data[i + 3] < alphaCut) data[i + 3] = 0;
  }
}

/**
 * Bounding box por alpha.
 */
function bboxByAlpha(data, width, height, channels, alphaMin = 40) {
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * channels + 3];
      if (a > alphaMin) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function processImage(buf, kind) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const copy = Buffer.from(data);

  if (kind === 'left') {
    floodRemoveBackgroundFromEdges(copy, info.width, info.height, info.channels, {
      stopDark: 72,
      seedMinLum: 135,
    });
  } else {
    floodRemoveBackgroundFromEdges(copy, info.width, info.height, info.channels, {
      stopDark: 88,
      seedMinLum: 150,
    });
  }

  flattenFringeAlpha(copy, info.width, info.height, info.channels, 40);
  const box = bboxByAlpha(copy, info.width, info.height, info.channels, 35);
  if (!box) throw new Error(`bbox vacío (${kind})`);

  return sharp(copy, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .png()
    .toBuffer();
}

async function main() {
  const raw1 = await sharp(LEFT).png().toBuffer();
  const raw2 = await sharp(RIGHT).png().toBuffer();

  const [buf1, buf2] = await Promise.all([
    processImage(raw1, 'left'),
    processImage(raw2, 'right'),
  ]);

  const [meta1, meta2] = await Promise.all([sharp(buf1).metadata(), sharp(buf2).metadata()]);
  const w1 = meta1.width;
  const h1 = meta1.height;
  const w2 = meta2.width;
  const h2 = meta2.height;

  const gap = -OVERLAP;
  const totalW = Math.max(1, w1 + gap + w2);
  const totalH = Math.max(h1, h2);
  const top1 = Math.floor((totalH - h1) / 2);
  const top2 = Math.floor((totalH - h2) / 2);

  await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: buf1, left: 0, top: top1 },
      { input: buf2, left: w1 + gap, top: top2 },
    ])
    .png()
    .toFile(OUT);

  console.log('OK:', OUT);
  console.log(`Recortes: izq ${w1}x${h1}, der ${w2}x${h2}, solapamiento ${OVERLAP}px, canvas ${totalW}x${totalH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
