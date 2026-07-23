// Genera los íconos PNG del manifest (192/512 + maskable) sin dependencias
// externas: escritor PNG mínimo (IHDR/IDAT/IEND) sobre un buffer RGBA pintado
// a mano. Un círculo blanco (silueta de micrófono simplificada) sobre azul
// corporativo (--primary).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const PRIMARY = [37, 99, 235]; // blue-600, ~ hsl(217 91% 60%) ajustado a sólido
const WHITE = [248, 250, 252];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** @param {(x:number,y:number,size:number)=>[number,number,number,number]} paint */
function buildPng(size, paint) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // sin filtro
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconPaint(maskable) {
  return (x, y, size) => {
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // En modo maskable dejamos margen de seguridad (safe zone ~40%).
    const outerR = maskable ? size * 0.5 : size * 0.5;
    const bg = dist <= outerR || !maskable;
    if (!bg) return [PRIMARY[0], PRIMARY[1], PRIMARY[2], 0];

    // "Cápsula" central estilo micrófono: óvalo blanco + base.
    const capW = size * 0.16;
    const capH = size * 0.28;
    const capCx = cx;
    const capCy = cy - size * 0.04;
    const inCapsule =
      Math.abs(dx) <= capW && Math.abs((y - capCy) / capH) <= 1 - (Math.abs(dx) / capW) ** 2 * 0;
    const capsule =
      ((x - capCx) / capW) ** 2 + ((y - capCy) / capH) ** 2 <= 1;
    if (capsule) return [WHITE[0], WHITE[1], WHITE[2], 255];

    // Base/soporte del micrófono.
    const standTop = capCy + capH;
    const standWidth = size * 0.03;
    if (
      Math.abs(x - capCx) <= standWidth &&
      y >= standTop &&
      y <= standTop + size * 0.14
    ) {
      return [WHITE[0], WHITE[1], WHITE[2], 255];
    }
    // Arco de la base.
    const arcCy = standTop;
    const arcR = size * 0.13;
    const arcDist = Math.sqrt((x - capCx) ** 2 + (y - arcCy) ** 2);
    if (arcDist <= arcR && arcDist >= arcR - size * 0.02 && y >= arcCy) {
      return [WHITE[0], WHITE[1], WHITE[2], 255];
    }

    return [PRIMARY[0], PRIMARY[1], PRIMARY[2], 255];
  };
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), buildPng(size, iconPaint(false)));
}
writeFileSync(join(outDir, "icon-maskable-512.png"), buildPng(512, iconPaint(true)));
writeFileSync(join(outDir, "apple-touch-icon.png"), buildPng(180, iconPaint(false)));

console.log("Iconos generados en", outDir);
