/**
 * Pure-TS WMF & EMF to SVG converter tailored for MathType / Word vector formulas.
 * Tracks GDI Window/Viewport origins & extents and computes safe bounding boxes
 * so formulas are never clipped even when Placeable/Bounds units differ from logical GDI units.
 */

const SYMBOL_FONT_MAP: Record<number, string> = {
  0x22: '∀',
  0x24: '∃',
  0x27: '∋',
  0x2a: '∗',
  0x2d: '−',
  0x40: '≅',
  0x41: 'Α',
  0x42: 'Β',
  0x43: 'Χ',
  0x44: 'Δ',
  0x45: 'Ε',
  0x46: 'Φ',
  0x47: 'Γ',
  0x48: 'Η',
  0x49: 'Ι',
  0x4a: 'ϑ',
  0x4b: 'Κ',
  0x4c: 'Λ',
  0x4d: 'Μ',
  0x4e: 'Ν',
  0x4f: 'Ο',
  0x50: 'Π',
  0x51: 'Θ',
  0x52: 'Ρ',
  0x53: 'Σ',
  0x54: 'Τ',
  0x55: 'Υ',
  0x56: 'ς',
  0x57: 'Ω',
  0x58: 'Ξ',
  0x59: 'Ψ',
  0x5a: 'Ζ',
  0x5c: '∴',
  0x5e: '⊥',
  0x61: 'α',
  0x62: 'β',
  0x63: 'χ',
  0x64: 'δ',
  0x65: 'ε',
  0x66: 'φ',
  0x67: 'γ',
  0x68: 'η',
  0x69: 'ι',
  0x6a: 'ϕ',
  0x6b: 'κ',
  0x6c: 'λ',
  0x6d: 'μ',
  0x6e: 'ν',
  0x6f: 'ο',
  0x70: 'π',
  0x71: 'θ',
  0x72: 'ρ',
  0x73: 'σ',
  0x74: 'τ',
  0x75: 'υ',
  0x76: 'ϖ',
  0x77: 'ω',
  0x78: 'ξ',
  0x79: 'ψ',
  0x7a: 'ζ',
  0x7e: '∼',
  0xa3: '≤',
  0xa5: '∞',
  0xab: '↔',
  0xac: '←',
  0xad: '↑',
  0xae: '→',
  0xaf: '↓',
  0xb0: '°',
  0xb1: '±',
  0xb2: '″',
  0xb3: '≥',
  0xb4: '×',
  0xb5: '∝',
  0xb6: '∂',
  0xb7: '•',
  0xb8: '÷',
  0xb9: '≠',
  0xba: '≡',
  0xbb: '≈',
  0xbc: '…',
  0xbd: '|',
  0xbe: '—',
  0xc0: 'ℵ',
  0xc1: 'ℑ',
  0xc2: 'ℜ',
  0xc3: '℘',
  0xc4: '⊗',
  0xc5: '⊕',
  0xc6: '∅',
  0xc7: '∩',
  0xc8: '∪',
  0xc9: '⊃',
  0xca: '⊇',
  0xcb: '⊄',
  0xcc: '⊂',
  0xcd: '⊆',
  0xce: '∈',
  0xcf: '∉',
  0xd0: '∠',
  0xd1: '∇',
  0xd5: '∏',
  0xd6: '√',
  0xd7: '⋅',
  0xd8: '¬',
  0xd9: '∧',
  0xda: '∨',
  0xdb: '⇔',
  0xdc: '⇐',
  0xdd: '⇑',
  0xde: '⇒',
  0xdf: '⇓',
  0xe5: '∑',
  0xf2: '∫',
};

const MT_EXTRA_MAP: Record<number, string> = {
  0x20: ' ',
  0x22: '″',
  0x27: '′',
  0x2f: '/',
  0x3c: '⟨',
  0x3e: '⟩',
  0x43: '⋯',
  0x44: '⋮',
  0x45: '⋱',
  0x46: '⋰',
  0x49: '∩',
  0x4a: '∪',
  0x4d: '∓',
  0x4f: '∘',
  0x50: '∥',
  0x51: '∦',
  0x52: '∼',
  0x55: '≍',
  0x57: '△',
  0x59: '→',
  0x61: '→',
  0x62: '←',
  0x63: '↔',
  0x68: 'ℏ',
  0x6c: 'ℓ',
  0x6e: 'ℕ',
  0x70: '℘',
  0x71: 'ℚ',
  0x72: 'ℝ',
  0x7a: 'ℤ',
  0x7b: '⌢',
  0x7d: '⌣',
};

function escapeSvgText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colorRefToHex(color: number): string {
  const r = color & 0xff;
  const g = (color >> 8) & 0xff;
  const b = (color >> 16) & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function decodeTextBytes(
  bytes: Uint8Array,
  fontName: string,
  charSet: number,
  isUtf16: boolean
): string {
  const isMtExtra = /mt\s*extra/i.test(fontName);
  const isSymbol = !isMtExtra && (/symbol/i.test(fontName) || charSet === 2);
  const map = isMtExtra ? MT_EXTRA_MAP : isSymbol ? SYMBOL_FONT_MAP : null;

  if (isUtf16) {
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      if (code === 0) break;
      if (map && map[code & 0xff] && (code < 0x100 || (code >= 0xf000 && code <= 0xf0ff))) {
        out += map[code & 0xff];
      } else if (code >= 0xf020 && code <= 0xf0ff && SYMBOL_FONT_MAP[code & 0xff]) {
        out += SYMBOL_FONT_MAP[code & 0xff];
      } else {
        out += String.fromCharCode(code);
      }
    }
    return out;
  }

  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0) break;
    out += map && map[b] ? map[b] : String.fromCharCode(b);
  }
  return out;
}

interface GdiFont {
  kind: 'font';
  height: number;
  italic: boolean;
  bold: boolean;
  face: string;
  charSet: number;
}
interface GdiPen {
  kind: 'pen';
  style: number;
  width: number;
  color: string;
}
interface GdiBrush {
  kind: 'brush';
  style: number;
  color: string;
}
type GdiObject = GdiFont | GdiPen | GdiBrush | null;

class BBoxTracker {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  addPoint(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  addText(x: number, y: number, text: string, fontSize: number, align: number) {
    const estW = Math.max(fontSize * 0.5, text.length * fontSize * 0.56);
    const hAlign = align & 0x06;
    const x0 = hAlign === 0x06 ? x - estW / 2 : hAlign === 0x02 ? x - estW : x;
    const x1 = x0 + estW;

    const vAlign = align & 0x18;
    const y0 = vAlign === 0x18 ? y - fontSize * 0.95 : vAlign === 0x08 ? y - fontSize : y;
    const y1 = vAlign === 0x18 ? y + fontSize * 0.3 : vAlign === 0x08 ? y + fontSize * 0.1 : y + fontSize * 1.15;

    this.addPoint(x0, y0);
    this.addPoint(x1, y1);
  }

  isValid(): boolean {
    return (
      Number.isFinite(this.minX) &&
      Number.isFinite(this.minY) &&
      this.maxX > this.minX &&
      this.maxY > this.minY
    );
  }
}

function buildTextSvg(
  tx: number,
  ty: number,
  txt: string,
  textColor: string,
  font: GdiFont,
  textAlign: number,
  bbox: BBoxTracker
): string {
  const vAlign = textAlign & 0x18;
  const baseline = vAlign === 0x18 ? 'alphabetic' : vAlign === 0x08 ? 'text-after-edge' : 'hanging';
  const hAlign = textAlign & 0x06;
  const anchor = hAlign === 0x06 ? 'middle' : hAlign === 0x02 ? 'end' : 'start';
  const fontStyle = font.italic ? 'italic' : 'normal';
  const fontWeight = font.bold ? 'bold' : 'normal';
  const fontFamily = /mt\s*extra|symbol/i.test(font.face)
    ? "'Cambria Math', 'Times New Roman', serif"
    : `'${escapeSvgText(font.face)}', 'Times New Roman', serif`;

  bbox.addText(tx, ty, txt, font.height, textAlign);
  return `<text x="${tx}" y="${ty}" fill="${textColor}" font-size="${font.height}" font-family="${fontFamily}" font-style="${fontStyle}" font-weight="${fontWeight}" dominant-baseline="${baseline}" text-anchor="${anchor}">${escapeSvgText(txt)}</text>`;
}

function createSvgOutput(
  elements: string[],
  logicalBox: { x: number; y: number; w: number; h: number } | null,
  bbox: BBoxTracker,
  displayWidthPx?: number,
  displayHeightPx?: number
): string | null {
  if (elements.length === 0) return null;

  let vx = 0;
  let vy = 0;
  let vw = 0;
  let vh = 0;

  if (logicalBox && logicalBox.w > 0 && logicalBox.h > 0) {
    vx = logicalBox.x;
    vy = logicalBox.y;
    vw = logicalBox.w;
    vh = logicalBox.h;
    // If drawn elements sit outside logicalBox OR occupy a tiny corner of logicalBox, fit to actual bbox
    if (bbox.isValid()) {
      const bw = bbox.maxX - bbox.minX;
      const bh = bbox.maxY - bbox.minY;
      const outside =
        bbox.minX < vx - vw * 0.2 ||
        bbox.maxX > vx + vw * 1.2 ||
        bbox.minY < vy - vh * 0.2 ||
        bbox.maxY > vy + vh * 1.2;
      const tooSmall = bw < vw * 0.4 && bh < vh * 0.4;
      if (outside || tooSmall) {
        const padX = bw * 0.04;
        const padY = bh * 0.06;
        vx = bbox.minX - padX;
        vy = bbox.minY - padY;
        vw = bw + padX * 2;
        vh = bh + padY * 2;
      }
    }
  } else if (bbox.isValid()) {
    const padX = (bbox.maxX - bbox.minX) * 0.04;
    const padY = (bbox.maxY - bbox.minY) * 0.06;
    vx = bbox.minX - padX;
    vy = bbox.minY - padY;
    vw = bbox.maxX - bbox.minX + padX * 2;
    vh = bbox.maxY - bbox.minY + padY * 2;
  }

  if (vw <= 0 || vh <= 0) return null;

  const targetH =
    displayHeightPx && displayHeightPx >= 14 && displayHeightPx <= 500 ? displayHeightPx : 22;
  const targetW = Math.max(10, Math.round((vw / vh) * targetH));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" width="${Math.round(targetW)}" height="${Math.round(targetH)}" style="vertical-align:middle;display:inline-block;">${elements.join('')}</svg>`;
}

export function convertWmfToSvg(buf: Buffer): string | null {
  if (buf.length < 18) return null;
  let offset = 0;
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  let inch = 1440;
  let hasPlaceable = false;

  // Aldus Placeable Header: 0x9AC6CDD7
  if (buf.readUInt32LE(0) === 0x9ac6cdd7 && buf.length >= 40) {
    hasPlaceable = true;
    left = buf.readInt16LE(6);
    top = buf.readInt16LE(8);
    right = buf.readInt16LE(10);
    bottom = buf.readInt16LE(12);
    inch = buf.readUInt16LE(14) || 1440;
    offset = 22;
  }

  const headerSizeWords = buf.readUInt16LE(offset + 2);
  offset += headerSizeWords * 2;
  if (offset >= buf.length) return null;

  let winOrgX = 0;
  let winOrgY = 0;
  let winExtX = 0;
  let winExtY = 0;
  let hasWindowExt = false;
  let curX = 0;
  let curY = 0;
  let textColor = '#0f172a';
  let textAlign = 0;

  const objects: GdiObject[] = [];
  const addObject = (obj: GdiObject) => {
    const freeIdx = objects.indexOf(null);
    if (freeIdx !== -1) objects[freeIdx] = obj;
    else objects.push(obj);
  };

  let activeFont: GdiFont = {
    kind: 'font',
    height: 240,
    italic: false,
    bold: false,
    face: 'Times New Roman',
    charSet: 0,
  };
  let activePen: GdiPen = { kind: 'pen', style: 0, width: 12, color: '#0f172a' };
  let activeBrush: GdiBrush = { kind: 'brush', style: 1, color: 'none' };

  const elements: string[] = [];
  const bbox = new BBoxTracker();

  while (offset + 6 <= buf.length) {
    const sizeWords = buf.readUInt32LE(offset);
    const func = buf.readUInt16LE(offset + 4);
    const recBytes = sizeWords * 2;
    if (func === 0x0000 || sizeWords < 3 || offset + recBytes > buf.length) break;

    const p = offset + 6;
    switch (func) {
      case 0x020b: // SETWINDOWORG (y, x)
        if (recBytes >= 10) {
          winOrgY = buf.readInt16LE(p);
          winOrgX = buf.readInt16LE(p + 2);
        }
        break;
      case 0x020c: // SETWINDOWEXT (cy, cx)
        if (recBytes >= 10) {
          winExtY = buf.readInt16LE(p);
          winExtX = buf.readInt16LE(p + 2);
          hasWindowExt = winExtX !== 0 && winExtY !== 0;
        }
        break;
      case 0x0209: // SETTEXTCOLOR
        if (recBytes >= 10) textColor = colorRefToHex(buf.readUInt32LE(p));
        break;
      case 0x012e: // SETTEXTALIGN
        if (recBytes >= 8) textAlign = buf.readUInt16LE(p);
        break;
      case 0x02fa: // CREATEPENINDIRECT
        if (recBytes >= 16) {
          const style = buf.readUInt16LE(p);
          const width = Math.max(1, Math.abs(buf.readInt16LE(p + 2)));
          const color = colorRefToHex(buf.readUInt32LE(p + 6));
          addObject({ kind: 'pen', style, width, color });
        }
        break;
      case 0x02fc: // CREATEBRUSHINDIRECT
        if (recBytes >= 14) {
          const style = buf.readUInt16LE(p);
          const color = colorRefToHex(buf.readUInt32LE(p + 2));
          addObject({ kind: 'brush', style, color });
        }
        break;
      case 0x02fb: // CREATEFONTINDIRECT
        if (recBytes >= 24) {
          const rawH = buf.readInt16LE(p);
          const height =
            rawH === 0
              ? Math.max(16, Math.round(Math.abs(winExtY || 400) * 0.55))
              : rawH < 0
              ? Math.abs(rawH)
              : Math.max(1, Math.round(rawH * 0.85));
          const weight = buf.readInt16LE(p + 8);
          const italic = buf.readUInt8(p + 10) !== 0;
          const charSet = buf.readUInt8(p + 13);
          const faceBytes = buf.subarray(p + 18, offset + recBytes);
          const face = faceBytes.toString('latin1').split('\0')[0] || 'serif';
          addObject({ kind: 'font', height, italic, bold: weight >= 600, face, charSet });
        }
        break;
      case 0x012d: // SELECTOBJECT
        if (recBytes >= 8) {
          const idx = buf.readUInt16LE(p);
          const obj = objects[idx];
          if (obj) {
            if (obj.kind === 'font') activeFont = obj;
            else if (obj.kind === 'pen') activePen = obj;
            else if (obj.kind === 'brush') activeBrush = obj;
          }
        }
        break;
      case 0x01f0: // DELETEOBJECT
        if (recBytes >= 8) {
          const idx = buf.readUInt16LE(p);
          if (idx < objects.length) objects[idx] = null;
        }
        break;
      case 0x0214: // MOVETO (y, x)
        if (recBytes >= 10) {
          curY = buf.readInt16LE(p);
          curX = buf.readInt16LE(p + 2);
        }
        break;
      case 0x0213: // LINETO (y, x)
        if (recBytes >= 10 && activePen.style !== 5) {
          const ny = buf.readInt16LE(p);
          const nx = buf.readInt16LE(p + 2);
          bbox.addPoint(curX, curY);
          bbox.addPoint(nx, ny);
          elements.push(
            `<line x1="${curX}" y1="${curY}" x2="${nx}" y2="${ny}" stroke="${activePen.color}" stroke-width="${activePen.width}" stroke-linecap="round"/>`
          );
          curX = nx;
          curY = ny;
        }
        break;
      case 0x041b: // RECTANGLE (bottom, right, top, left)
        if (recBytes >= 14) {
          const rB = buf.readInt16LE(p);
          const rR = buf.readInt16LE(p + 2);
          const rT = buf.readInt16LE(p + 4);
          const rL = buf.readInt16LE(p + 6);
          const rx = Math.min(rL, rR);
          const ry = Math.min(rT, rB);
          const rw = Math.abs(rR - rL);
          const rh = Math.abs(rB - rT);
          bbox.addPoint(rx, ry);
          bbox.addPoint(rx + rw, ry + rh);
          const stroke = activePen.style === 5 ? 'none' : activePen.color;
          const fill = activeBrush.style === 1 ? 'none' : activeBrush.color;
          if (stroke !== 'none' || fill !== 'none') {
            elements.push(
              `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="${stroke}" stroke-width="${activePen.width}"/>`
            );
          }
        }
        break;
      case 0x0418: // ELLIPSE
        if (recBytes >= 14) {
          const rB = buf.readInt16LE(p);
          const rR = buf.readInt16LE(p + 2);
          const rT = buf.readInt16LE(p + 4);
          const rL = buf.readInt16LE(p + 6);
          bbox.addPoint(rL, rT);
          bbox.addPoint(rR, rB);
          const stroke = activePen.style === 5 ? 'none' : activePen.color;
          const fill = activeBrush.style === 1 ? 'none' : activeBrush.color;
          elements.push(
            `<ellipse cx="${(rL + rR) / 2}" cy="${(rT + rB) / 2}" rx="${Math.abs(rR - rL) / 2}" ry="${Math.abs(rB - rT) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${activePen.width}"/>`
          );
        }
        break;
      case 0x0325: // POLYLINE
      case 0x0324: // POLYGON
        if (recBytes >= 8) {
          const count = buf.readUInt16LE(p);
          const pts: string[] = [];
          for (let i = 0; i < count && p + 2 + i * 4 + 4 <= offset + recBytes; i++) {
            const px = buf.readInt16LE(p + 2 + i * 4);
            const py = buf.readInt16LE(p + 4 + i * 4);
            bbox.addPoint(px, py);
            pts.push(`${px},${py}`);
          }
          if (pts.length >= 2) {
            const stroke = activePen.style === 5 ? 'none' : activePen.color;
            const fill = func === 0x0324 && activeBrush.style !== 1 ? activeBrush.color : 'none';
            const tag = func === 0x0324 ? 'polygon' : 'polyline';
            elements.push(
              `<${tag} points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${activePen.width}" stroke-linejoin="round" stroke-linecap="round"/>`
            );
          }
        }
        break;
      case 0x0521: // TEXTOUT
        if (recBytes >= 12) {
          const len = buf.readInt16LE(p);
          if (len > 0) {
            const padded = len + (len % 2);
            const strEnd = Math.min(p + 2 + len, offset + recBytes);
            const yPos = p + 2 + padded;
            if (yPos + 4 <= offset + recBytes) {
              const rawY = buf.readInt16LE(yPos);
              const rawX = buf.readInt16LE(yPos + 2);
              const tx = (textAlign & 0x01) !== 0 ? curX : rawX;
              const ty = (textAlign & 0x01) !== 0 ? curY : rawY;
              const txt = decodeTextBytes(
                buf.subarray(p + 2, strEnd),
                activeFont.face,
                activeFont.charSet,
                false
              );
              if (txt) {
                elements.push(buildTextSvg(tx, ty, txt, textColor, activeFont, textAlign, bbox));
              }
            }
          }
        }
        break;
      case 0x0a32: // EXTTEXTOUT
        if (recBytes >= 14) {
          const rawY = buf.readInt16LE(p);
          const rawX = buf.readInt16LE(p + 2);
          const len = buf.readInt16LE(p + 4);
          const opts = buf.readUInt16LE(p + 6);
          const strStart = p + 8 + ((opts & 0x06) !== 0 ? 8 : 0);
          if (len > 0 && strStart + len <= offset + recBytes) {
            const tx = (textAlign & 0x01) !== 0 ? curX : rawX;
            const ty = (textAlign & 0x01) !== 0 ? curY : rawY;
            const txt = decodeTextBytes(
              buf.subarray(strStart, strStart + len),
              activeFont.face,
              activeFont.charSet,
              false
            );
            if (txt) {
              elements.push(buildTextSvg(tx, ty, txt, textColor, activeFont, textAlign, bbox));
            }
          }
        }
        break;
    }
    offset += recBytes;
  }

  let logicalBox: { x: number; y: number; w: number; h: number } | null = null;
  if (hasWindowExt) {
    const x = winExtX >= 0 ? winOrgX : winOrgX + winExtX;
    const y = winExtY >= 0 ? winOrgY : winOrgY + winExtY;
    logicalBox = { x, y, w: Math.abs(winExtX), h: Math.abs(winExtY) };
  } else if (hasPlaceable && right > left && bottom > top) {
    logicalBox = { x: left, y: top, w: right - left, h: bottom - top };
  }

  const displayW = hasPlaceable && right > left ? ((right - left) / inch) * 96 : undefined;
  const displayH = hasPlaceable && bottom > top ? ((bottom - top) / inch) * 96 : undefined;
  return createSvgOutput(elements, logicalBox, bbox, displayW, displayH);
}

export function convertEmfToSvg(buf: Buffer): string | null {
  if (buf.length < 88 || buf.readUInt32LE(0) !== 1) return null;
  const boundsLeft = buf.readInt32LE(8);
  const boundsTop = buf.readInt32LE(12);
  const boundsRight = buf.readInt32LE(16);
  const boundsBottom = buf.readInt32LE(20);
  const frameLeft = buf.readInt32LE(24);
  const frameTop = buf.readInt32LE(28);
  const frameRight = buf.readInt32LE(32);
  const frameBottom = buf.readInt32LE(36);

  let offset = buf.readUInt32LE(4);
  let winOrgX = 0;
  let winOrgY = 0;
  let winExtX = 0;
  let winExtY = 0;
  let hasWindowExt = false;
  let curX = 0;
  let curY = 0;
  let textColor = '#0f172a';
  let textAlign = 0;

  const objects: Record<number, GdiObject> = {};
  let activeFont: GdiFont = {
    kind: 'font',
    height: 24,
    italic: false,
    bold: false,
    face: 'Times New Roman',
    charSet: 0,
  };
  let activePen: GdiPen = { kind: 'pen', style: 0, width: 1, color: '#0f172a' };
  let activeBrush: GdiBrush = { kind: 'brush', style: 1, color: 'none' };

  const elements: string[] = [];
  const bbox = new BBoxTracker();

  while (offset + 8 <= buf.length) {
    const type = buf.readUInt32LE(offset);
    const size = buf.readUInt32LE(offset + 4);
    if (type === 14 || size < 8 || offset + size > buf.length) break;

    switch (type) {
      case 9: // EMR_SETWINDOWEXTEX
        if (size >= 16) {
          winExtX = buf.readInt32LE(offset + 8);
          winExtY = buf.readInt32LE(offset + 12);
          hasWindowExt = winExtX !== 0 && winExtY !== 0;
        }
        break;
      case 10: // EMR_SETWINDOWORGEX
        if (size >= 16) {
          winOrgX = buf.readInt32LE(offset + 8);
          winOrgY = buf.readInt32LE(offset + 12);
        }
        break;
      case 24: // EMR_SETTEXTCOLOR
        if (size >= 12) textColor = colorRefToHex(buf.readUInt32LE(offset + 8));
        break;
      case 22: // EMR_SETTEXTALIGN
        if (size >= 12) textAlign = buf.readUInt32LE(offset + 8);
        break;
      case 38: // EMR_CREATEPEN
        if (size >= 28) {
          const ih = buf.readUInt32LE(offset + 8);
          const style = buf.readUInt32LE(offset + 12);
          const width = Math.max(1, buf.readInt32LE(offset + 16));
          const color = colorRefToHex(buf.readUInt32LE(offset + 24));
          objects[ih] = { kind: 'pen', style, width, color };
        }
        break;
      case 95: // EMR_EXTCREATEPEN
        if (size >= 52) {
          const ih = buf.readUInt32LE(offset + 8);
          const style = buf.readUInt32LE(offset + 28);
          const width = Math.max(1, buf.readInt32LE(offset + 32));
          const color = colorRefToHex(buf.readUInt32LE(offset + 40));
          objects[ih] = { kind: 'pen', style, width, color };
        }
        break;
      case 39: // EMR_CREATEBRUSHINDIRECT
        if (size >= 24) {
          const ih = buf.readUInt32LE(offset + 8);
          const style = buf.readUInt32LE(offset + 12);
          const color = colorRefToHex(buf.readUInt32LE(offset + 16));
          objects[ih] = { kind: 'brush', style, color };
        }
        break;
      case 82: // EMR_EXTCREATEFONTINDIRECTW
        if (size >= 104) {
          const ih = buf.readUInt32LE(offset + 8);
          const rawH = buf.readInt32LE(offset + 12);
          const height =
            rawH === 0
              ? Math.max(16, Math.round(Math.abs(winExtY || boundsBottom - boundsTop || 40) * 0.55))
              : rawH < 0
              ? Math.abs(rawH)
              : Math.max(1, Math.round(rawH * 0.85));
          const weight = buf.readInt32LE(offset + 28);
          const italic = buf.readUInt8(offset + 32) !== 0;
          const charSet = buf.readUInt8(offset + 35);
          const face = decodeTextBytes(buf.subarray(offset + 40, offset + 104), '', 0, true);
          objects[ih] = {
            kind: 'font',
            height,
            italic,
            bold: weight >= 600,
            face: face || 'serif',
            charSet,
          };
        }
        break;
      case 37: // EMR_SELECTOBJECT
        if (size >= 12) {
          const ih = buf.readUInt32LE(offset + 8);
          const obj = objects[ih];
          if (obj) {
            if (obj.kind === 'font') activeFont = obj;
            else if (obj.kind === 'pen') activePen = obj;
            else if (obj.kind === 'brush') activeBrush = obj;
          }
        }
        break;
      case 40: // EMR_DELETEOBJECT
        if (size >= 12) delete objects[buf.readUInt32LE(offset + 8)];
        break;
      case 27: // EMR_MOVETOEX
        if (size >= 16) {
          curX = buf.readInt32LE(offset + 8);
          curY = buf.readInt32LE(offset + 12);
        }
        break;
      case 54: // EMR_LINETO
        if (size >= 16 && activePen.style !== 5) {
          const nx = buf.readInt32LE(offset + 8);
          const ny = buf.readInt32LE(offset + 12);
          bbox.addPoint(curX, curY);
          bbox.addPoint(nx, ny);
          elements.push(
            `<line x1="${curX}" y1="${curY}" x2="${nx}" y2="${ny}" stroke="${activePen.color}" stroke-width="${activePen.width}" stroke-linecap="round"/>`
          );
          curX = nx;
          curY = ny;
        }
        break;
      case 3: // EMR_POLYGON
      case 4: // EMR_POLYLINE
        if (size >= 28) {
          const count = buf.readUInt32LE(offset + 24);
          const pts: string[] = [];
          for (let i = 0; i < count && offset + 28 + i * 8 + 8 <= offset + size; i++) {
            const px = buf.readInt32LE(offset + 28 + i * 8);
            const py = buf.readInt32LE(offset + 32 + i * 8);
            bbox.addPoint(px, py);
            pts.push(`${px},${py}`);
          }
          if (pts.length >= 2) {
            const stroke = activePen.style === 5 ? 'none' : activePen.color;
            const fill = type === 3 && activeBrush.style !== 1 ? activeBrush.color : 'none';
            const tag = type === 3 ? 'polygon' : 'polyline';
            elements.push(
              `<${tag} points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${activePen.width}" stroke-linejoin="round"/>`
            );
          }
        }
        break;
      case 86: // EMR_POLYGON16
      case 87: // EMR_POLYLINE16
        if (size >= 28) {
          const count = buf.readUInt32LE(offset + 24);
          const pts: string[] = [];
          for (let i = 0; i < count && offset + 28 + i * 4 + 4 <= offset + size; i++) {
            const px = buf.readInt16LE(offset + 28 + i * 4);
            const py = buf.readInt16LE(offset + 30 + i * 4);
            bbox.addPoint(px, py);
            pts.push(`${px},${py}`);
          }
          if (pts.length >= 2) {
            const stroke = activePen.style === 5 ? 'none' : activePen.color;
            const fill = type === 86 && activeBrush.style !== 1 ? activeBrush.color : 'none';
            const tag = type === 86 ? 'polygon' : 'polyline';
            elements.push(
              `<${tag} points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${activePen.width}" stroke-linejoin="round"/>`
            );
          }
        }
        break;
      case 83: // EMR_EXTTEXTOUTA
      case 84: // EMR_EXTTEXTOUTW
        if (size >= 76) {
          const rawX = buf.readInt32LE(offset + 36);
          const rawY = buf.readInt32LE(offset + 40);
          const tx = (textAlign & 0x01) !== 0 ? curX : rawX;
          const ty = (textAlign & 0x01) !== 0 ? curY : rawY;
          const nChars = buf.readUInt32LE(offset + 44);
          const offString = buf.readUInt32LE(offset + 48);
          const isUtf16 = type === 84;
          const byteLen = nChars * (isUtf16 ? 2 : 1);
          if (nChars > 0 && offString > 0 && offset + offString + byteLen <= offset + size) {
            const txt = decodeTextBytes(
              buf.subarray(offset + offString, offset + offString + byteLen),
              activeFont.face,
              activeFont.charSet,
              isUtf16
            );
            if (txt) {
              elements.push(buildTextSvg(tx, ty, txt, textColor, activeFont, textAlign, bbox));
            }
          }
        }
        break;
      case 108: // EMR_SMALLTEXTOUT
        if (size >= 36) {
          const rawX = buf.readInt32LE(offset + 8);
          const rawY = buf.readInt32LE(offset + 12);
          const tx = (textAlign & 0x01) !== 0 ? curX : rawX;
          const ty = (textAlign & 0x01) !== 0 ? curY : rawY;
          const nChars = buf.readUInt32LE(offset + 16);
          const fuOptions = buf.readUInt32LE(offset + 20);
          const noRect = (fuOptions & 0x0100) !== 0;
          const smallChars = (fuOptions & 0x0200) !== 0;
          const strOffset = noRect ? 36 : 52;
          const byteLen = nChars * (smallChars ? 1 : 2);
          if (nChars > 0 && offset + strOffset + byteLen <= offset + size) {
            const txt = decodeTextBytes(
              buf.subarray(offset + strOffset, offset + strOffset + byteLen),
              activeFont.face,
              activeFont.charSet,
              !smallChars
            );
            if (txt) {
              elements.push(buildTextSvg(tx, ty, txt, textColor, activeFont, textAlign, bbox));
            }
          }
        }
        break;
    }
    offset += size;
  }

  let logicalBox: { x: number; y: number; w: number; h: number } | null = null;
  if (hasWindowExt) {
    const x = winExtX >= 0 ? winOrgX : winOrgX + winExtX;
    const y = winExtY >= 0 ? winOrgY : winOrgY + winExtY;
    logicalBox = { x, y, w: Math.abs(winExtX), h: Math.abs(winExtY) };
  } else if (boundsRight > boundsLeft && boundsBottom > boundsTop) {
    logicalBox = {
      x: boundsLeft,
      y: boundsTop,
      w: boundsRight - boundsLeft,
      h: boundsBottom - boundsTop,
    };
  }

  const displayW = frameRight > frameLeft ? ((frameRight - frameLeft) / 2540) * 96 : undefined;
  const displayH = frameBottom > frameTop ? ((frameBottom - frameTop) / 2540) * 96 : undefined;
  return createSvgOutput(elements, logicalBox, bbox, displayW, displayH);
}
