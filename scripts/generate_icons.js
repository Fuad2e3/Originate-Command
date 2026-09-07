const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePNG(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  let pos = 8;
  const idats = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idats.push(buffer.slice(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idats));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);

  let srcPos = 0;
  let dstPos = 0;

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    for (let x = 0; x < stride; x++) {
      const raw = decompressed[srcPos++];
      const a = x >= 4 ? pixels[dstPos - 4] : 0;
      const b = y > 0 ? pixels[dstPos - stride] : 0;
      const c = (x >= 4 && y > 0) ? pixels[dstPos - stride - 4] : 0;
      let val = raw;
      if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (raw + paeth(a, b, c)) & 0xff;
      pixels[dstPos++] = val;
    }
  }

  return { width, height, pixels };
}

function createPNG(width, height, pixels) {
  const stride = width * 4;
  const rawData = Buffer.alloc(height * (stride + 1));
  let srcPos = 0;
  let dstPos = 0;
  for (let y = 0; y < height; y++) {
    rawData[dstPos++] = 0; // Filter none
    for (let x = 0; x < stride; x++) {
      rawData[dstPos++] = pixels[srcPos++];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
    return chunk;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const chunks = [
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ];

  return Buffer.concat(chunks);
}

function resizeBilinear(srcWidth, srcHeight, srcPixels, dstWidth, dstHeight) {
  const dst = Buffer.alloc(dstWidth * dstHeight * 4);
  const xRatio = (srcWidth - 1) / Math.max(1, dstWidth - 1);
  const yRatio = (srcHeight - 1) / Math.max(1, dstHeight - 1);

  for (let y = 0; y < dstHeight; y++) {
    const srcY = y * yRatio;
    const yFloor = Math.floor(srcY);
    const yCeil = Math.min(srcHeight - 1, Math.ceil(srcY));
    const yWeight = srcY - yFloor;

    for (let x = 0; x < dstWidth; x++) {
      const srcX = x * xRatio;
      const xFloor = Math.floor(srcX);
      const xCeil = Math.min(srcWidth - 1, Math.ceil(srcX));
      const xWeight = srcX - xFloor;

      const idx00 = (yFloor * srcWidth + xFloor) * 4;
      const idx10 = (yFloor * srcWidth + xCeil) * 4;
      const idx01 = (yCeil * srcWidth + xFloor) * 4;
      const idx11 = (yCeil * srcWidth + xCeil) * 4;
      const dstIdx = (y * dstWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = srcPixels[idx00 + c] * (1 - xWeight) + srcPixels[idx10 + c] * xWeight;
        const bottom = srcPixels[idx01 + c] * (1 - xWeight) + srcPixels[idx11 + c] * xWeight;
        dst[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dst;
}

const inputPath = path.join(__dirname, '..', 'assets', 'icons', 'oc-mark-original.png');
const decoded = decodePNG(fs.readFileSync(inputPath));
console.log('Decoded source:', decoded.width, 'x', decoded.height);

// First make it a clean square by padding/squaring
const size = Math.max(decoded.width, decoded.height);
const squarePixels = Buffer.alloc(size * size * 4);
const xOff = Math.floor((size - decoded.width) / 2);
const yOff = Math.floor((size - decoded.height) / 2);

// Fill with background color or transparent
for (let y = 0; y < decoded.height; y++) {
  for (let x = 0; x < decoded.width; x++) {
    const srcIdx = (y * decoded.width + x) * 4;
    const dstIdx = ((y + yOff) * size + (x + xOff)) * 4;
    for (let c = 0; c < 4; c++) {
      squarePixels[dstIdx + c] = decoded.pixels[srcIdx + c];
    }
  }
}

// Generate 512x512
const p512 = resizeBilinear(size, size, squarePixels, 512, 512);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icons', 'icon-512.png'), createPNG(512, 512, p512));
console.log('Generated icon-512.png');

// Generate 192x192
const p192 = resizeBilinear(size, size, squarePixels, 192, 192);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icons', 'icon-192.png'), createPNG(192, 192, p192));
console.log('Generated icon-192.png');

// Generate 32x32 favicon
const p32 = resizeBilinear(size, size, squarePixels, 32, 32);
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icons', 'favicon-32x32.png'), createPNG(32, 32, p32));
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icons', 'favicon.png'), createPNG(32, 32, p32));
console.log('Generated favicon-32x32.png & favicon.png');
