import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import { convertOmmlNodesToLatex, type OrderedXmlNode } from './ommlToLatex.ts';

export interface MathMeta {
  ommlCount: number;
  mathTypeOleCount: number;
  formulaImageCount?: number;
  convertedCount: number;
  fallbackImagesCount: number;
  preCheckTotal?: number;
  postCheckPreserved?: number;
  supportsFullPreview: boolean;
  warnings: string[];
}

export interface DocumentPreviewPayload {
  kind: 'pdf' | 'word' | 'slides' | 'sheet' | 'unsupported';
  pages?: Array<{ pageNumber: number; html: string }>;
  slides?: Array<{
    slideNumber: number;
    title: string;
    blocks: Array<{ type: 'text' | 'math' | 'list'; content: string }>;
  }>;
  sheets?: Array<{ name: string; rows: string[][] }>;
  mathMeta: MathMeta;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTagKey(node: OrderedXmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return null;
}

function getChildren(node: OrderedXmlNode, tag: string): OrderedXmlNode[] {
  const val = node[tag];
  return Array.isArray(val) ? (val as OrderedXmlNode[]) : [];
}

function getAttr(node: OrderedXmlNode, name: string): string | undefined {
  return node[':@']?.[name];
}

function extractInlineText(nodes: OrderedXmlNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n['#text'] !== undefined && n['#text'] !== null) {
      out += String(n['#text']);
      continue;
    }
    const k = getTagKey(n);
    if (!k) continue;
    out += extractInlineText(getChildren(n, k));
  }
  return out;
}

interface RenderContext {
  rels: Record<string, string>;
  mediaDataUris: Record<string, string>;
  mathMeta: MathMeta;
}

function renderRun(runNode: OrderedXmlNode, ctx: RenderContext): string {
  const children = getChildren(runNode, 'w:r');
  let bold = false;
  let italic = false;
  let underline = false;
  let vertAlign: 'superscript' | 'subscript' | null = null;
  let hasPageBreak = false;
  let html = '';

  for (const child of children) {
    const k = getTagKey(child);
    if (!k) continue;

    if (k === 'w:rPr') {
      const props = getChildren(child, 'w:rPr');
      for (const p of props) {
        const pk = getTagKey(p);
        if (pk === 'w:b') bold = getAttr(p, '@_w:val') !== '0';
        if (pk === 'w:i') italic = getAttr(p, '@_w:val') !== '0';
        if (pk === 'w:u') underline = getAttr(p, '@_w:val') !== 'none';
        if (pk === 'w:vertAlign') {
          const val = getAttr(p, '@_w:val');
          if (val === 'superscript' || val === 'subscript') vertAlign = val;
        }
      }
    } else if (k === 'w:t') {
      const txt = extractInlineText(getChildren(child, 'w:t'));
      html += escapeHtml(txt);
    } else if (k === 'w:tab') {
      html += '&nbsp;&nbsp;&nbsp;&nbsp;';
    } else if (k === 'w:br') {
      const brType = getAttr(child, '@_w:type');
      if (brType === 'page') {
        hasPageBreak = true;
      } else {
        html += '<br />';
      }
    } else if (k === 'w:drawing' || k === 'w:pict') {
      const rawXml = JSON.stringify(child);
      const embedMatch = rawXml.match(/"@_r:(?:embed|id)":"(rId\d+)"/);
      if (embedMatch) {
        const target = ctx.rels[embedMatch[1]];
        const dataUri = target ? ctx.mediaDataUris[target] : undefined;
        if (dataUri) {
          html += `<img src="${dataUri}" alt="Hình minh họa trong tài liệu" class="edu-doc-image" />`;
        }
      }
    } else if (k === 'w:object') {
      ctx.mathMeta.mathTypeOleCount += 1;
      const rawXml = JSON.stringify(child);
      const embedMatch = rawXml.match(/"@_r:(?:embed|id)":"(rId\d+)"/);
      const target = embedMatch ? ctx.rels[embedMatch[1]] : undefined;
      const dataUri = target ? ctx.mediaDataUris[target] : undefined;
      if (dataUri) {
        ctx.mathMeta.fallbackImagesCount += 1;
        html += `<img src="${dataUri}" alt="Công thức MathType" class="edu-mathtype-img" />`;
      } else {
        ctx.mathMeta.supportsFullPreview = false;
        html += `<span class="edu-ole-warning">[Công thức MathType OLE — Tải file Word gốc để xem đầy đủ]</span>`;
      }
    }
  }

  if (html) {
    if (vertAlign === 'superscript') html = `<sup>${html}</sup>`;
    if (vertAlign === 'subscript') html = `<sub>${html}</sub>`;
    if (underline) html = `<u>${html}</u>`;
    if (italic) html = `<em>${html}</em>`;
    if (bold) html = `<strong>${html}</strong>`;
  }

  if (hasPageBreak) {
    html += '<!--EDU_PAGE_BREAK-->';
  }
  return html;
}

function renderParagraph(pNode: OrderedXmlNode, ctx: RenderContext): string {
  const children = getChildren(pNode, 'w:p');
  let styleId = '';
  let isList = false;
  let inner = '';

  for (const child of children) {
    const k = getTagKey(child);
    if (!k) continue;

    if (k === 'w:pPr') {
      const props = getChildren(child, 'w:pPr');
      for (const prop of props) {
        const pk = getTagKey(prop);
        if (pk === 'w:pStyle') {
          styleId = getAttr(prop, '@_w:val') || '';
        } else if (pk === 'w:numPr') {
          isList = true;
        }
      }
    } else if (k === 'w:r') {
      inner += renderRun(child, ctx);
    } else if (k === 'w:hyperlink') {
      const hRuns = getChildren(child, 'w:hyperlink');
      for (const hr of hRuns) {
        if (getTagKey(hr) === 'w:r') {
          inner += renderRun(hr, ctx);
        }
      }
    } else if (k === 'm:oMathPara') {
      const omNodes = getChildren(child, 'm:oMathPara');
      ctx.mathMeta.ommlCount += 1;
      const latex = convertOmmlNodesToLatex(omNodes);
      if (latex) {
        ctx.mathMeta.convertedCount += 1;
        inner += `<div class="edu-math-block" data-latex="${escapeHtml(latex)}"></div>`;
      }
    } else if (k === 'm:oMath') {
      const omNodes = getChildren(child, 'm:oMath');
      ctx.mathMeta.ommlCount += 1;
      const latex = convertOmmlNodesToLatex(omNodes);
      if (latex) {
        ctx.mathMeta.convertedCount += 1;
        inner += `<span class="edu-math-inline" data-latex="${escapeHtml(latex)}"></span>`;
      }
    }
  }

  if (!inner.trim()) return '<p class="edu-doc-spacer"></p>';

  const styleLower = styleId.toLowerCase();
  if (styleLower === 'title' || styleLower === 'heading1' || styleLower === '1') {
    return `<h1 class="edu-doc-h1">${inner}</h1>`;
  }
  if (styleLower === 'heading2' || styleLower === '2') {
    return `<h2 class="edu-doc-h2">${inner}</h2>`;
  }
  if (styleLower === 'heading3' || styleLower === '3') {
    return `<h3 class="edu-doc-h3">${inner}</h3>`;
  }
  if (isList) {
    return `<p class="edu-doc-list-item">&bull; ${inner}</p>`;
  }
  return `<p class="edu-doc-p">${inner}</p>`;
}

function renderTable(tblNode: OrderedXmlNode, ctx: RenderContext): string {
  const children = getChildren(tblNode, 'w:tbl');
  const rowsHtml: string[] = [];

  for (const child of children) {
    if (getTagKey(child) !== 'w:tr') continue;
    const rowChildren = getChildren(child, 'w:tr');
    const cellsHtml: string[] = [];

    for (const rc of rowChildren) {
      if (getTagKey(rc) !== 'w:tc') continue;
      const cellChildren = getChildren(rc, 'w:tc');
      let cellInner = '';
      for (const cc of cellChildren) {
        const ck = getTagKey(cc);
        if (ck === 'w:p') {
          cellInner += renderParagraph(cc, ctx);
        }
      }
      const tag = rowsHtml.length === 0 ? 'th' : 'td';
      cellsHtml.push(`<${tag}>${cellInner || '&nbsp;'}</${tag}>`);
    }
    rowsHtml.push(`<tr>${cellsHtml.join('')}</tr>`);
  }

  return `<div class="edu-table-wrap"><table class="edu-doc-table"><tbody>${rowsHtml.join('')}</tbody></table></div>`;
}

async function processDocx(buffer: Buffer): Promise<DocumentPreviewPayload> {
  const mathMeta: MathMeta = {
    ommlCount: 0,
    mathTypeOleCount: 0,
    formulaImageCount: 0,
    convertedCount: 0,
    fallbackImagesCount: 0,
    preCheckTotal: 0,
    postCheckPreserved: 0,
    supportsFullPreview: true,
    warnings: [],
  };

  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    return {
      kind: 'unsupported',
      mathMeta: {
        ...mathMeta,
        supportsFullPreview: false,
        warnings: ['Không tìm thấy cấu trúc word/document.xml hợp lệ trong tệp DOCX.'],
      },
    };
  }

  // Load relationships
  const rels: Record<string, string> = {};
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    const relsXml = await relsFile.async('text');
    const parsedRels = xmlParser.parse(relsXml) as OrderedXmlNode[];
    const root = parsedRels.find((n) => getTagKey(n) === 'Relationships');
    if (root) {
      for (const rel of getChildren(root, 'Relationships')) {
        if (getTagKey(rel) === 'Relationship') {
          const id = getAttr(rel, '@_Id');
          const target = getAttr(rel, '@_Target');
          if (id && target) rels[id] = target.replace(/^\/?word\//, '');
        }
      }
    }
  }

  // Load embedded images (PNG/JPEG/GIF/SVG) as data URIs; count OLE bins and legacy formula WMF/EMF images
  const mediaDataUris: Record<string, string> = {};
  let oleFileCount = 0;
  let vectorFormulaImages = 0;
  for (const fileName of Object.keys(zip.files)) {
    if (fileName.startsWith('word/media/')) {
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      };
      if (mimeMap[ext]) {
        const b64 = await zip.files[fileName].async('base64');
        const relKey = fileName.replace(/^word\//, '');
        mediaDataUris[relKey] = `data:${mimeMap[ext]};base64,${b64}`;
      } else if (ext === '.wmf' || ext === '.emf') {
        vectorFormulaImages += 1;
      }
    } else if (fileName.startsWith('word/embeddings/oleObject')) {
      oleFileCount += 1;
    }
  }

  const docXml = await docXmlFile.async('text');
  const parsedDoc = xmlParser.parse(docXml) as OrderedXmlNode[];
  const documentNode = parsedDoc.find((n) => getTagKey(n) === 'w:document');
  const bodyNode = documentNode
    ? getChildren(documentNode, 'w:document').find((n) => getTagKey(n) === 'w:body')
    : undefined;

  if (!bodyNode) {
    return {
      kind: 'unsupported',
      mathMeta: {
        ...mathMeta,
        supportsFullPreview: false,
        warnings: ['Không đọc được nội dung văn bản Word. Vui lòng tải xuống file gốc.'],
      },
    };
  }

  const ctx: RenderContext = { rels, mediaDataUris, mathMeta };
  const blocks: string[] = [];

  for (const node of getChildren(bodyNode, 'w:body')) {
    const k = getTagKey(node);
    if (k === 'w:p') {
      blocks.push(renderParagraph(node, ctx));
    } else if (k === 'w:tbl') {
      blocks.push(renderTable(node, ctx));
    }
  }

  if (oleFileCount > 0 && mathMeta.mathTypeOleCount === 0) {
    mathMeta.mathTypeOleCount = oleFileCount;
  }
  mathMeta.formulaImageCount = vectorFormulaImages;
  mathMeta.preCheckTotal =
    mathMeta.ommlCount + mathMeta.mathTypeOleCount + (mathMeta.formulaImageCount || 0);
  mathMeta.postCheckPreserved = mathMeta.convertedCount + mathMeta.fallbackImagesCount;

  if (mathMeta.mathTypeOleCount > 0 || vectorFormulaImages > 0) {
    mathMeta.supportsFullPreview = false;
    mathMeta.warnings.push(
      `Phát hiện ${mathMeta.mathTypeOleCount} đối tượng MathType OLE và ${vectorFormulaImages} công thức dạng ảnh vector (.wmf/.emf). Hệ thống giữ nguyên file Word gốc để bạn tải xuống nhằm bảo toàn 100% công thức.`
    );
  }
  if (mathMeta.ommlCount > mathMeta.convertedCount) {
    mathMeta.supportsFullPreview = false;
    mathMeta.warnings.push(
      `Có ${mathMeta.ommlCount - mathMeta.convertedCount} công thức OMML phức tạp chưa thể chuyển đổi tự động sang LaTeX. Vui lòng đối chiếu với tệp gốc.`
    );
  }

  // Split into clean readable pages either by explicit page break or every ~16 blocks
  const pages: Array<{ pageNumber: number; html: string }> = [];
  let currentChunk: string[] = [];

  const flushChunk = () => {
    const joined = currentChunk.join('\n').replace(/<!--EDU_PAGE_BREAK-->/g, '');
    if (joined.trim()) {
      pages.push({ pageNumber: pages.length + 1, html: joined });
    }
    currentChunk = [];
  };

  for (const block of blocks) {
    if (block.includes('<!--EDU_PAGE_BREAK-->')) {
      currentChunk.push(block.replace(/<!--EDU_PAGE_BREAK-->/g, ''));
      flushChunk();
    } else {
      currentChunk.push(block);
      if (currentChunk.length >= 16) {
        flushChunk();
      }
    }
  }
  flushChunk();

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, html: '<p class="edu-doc-p">(Tài liệu trống)</p>' });
  }

  return {
    kind: 'word',
    pages,
    mathMeta,
  };
}

async function processPptx(buffer: Buffer): Promise<DocumentPreviewPayload> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });

  const mathMeta: MathMeta = {
    ommlCount: 0,
    mathTypeOleCount: 0,
    convertedCount: 0,
    fallbackImagesCount: 0,
    supportsFullPreview: true,
    warnings: [],
  };

  const slides: NonNullable<DocumentPreviewPayload['slides']> = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xmlText = await zip.files[slideFiles[i]].async('text');
    const parsed = xmlParser.parse(xmlText) as OrderedXmlNode[];
    const blocks: Array<{ type: 'text' | 'math' | 'list'; content: string }> = [];

    function walkSlide(nodes: OrderedXmlNode[]) {
      for (const n of nodes) {
        const k = getTagKey(n);
        if (!k) continue;
        if (k === 'm:oMath' || k === 'm:oMathPara') {
          mathMeta.ommlCount += 1;
          const latex = convertOmmlNodesToLatex(getChildren(n, k));
          if (latex) {
            mathMeta.convertedCount += 1;
            blocks.push({ type: 'math', content: latex });
          }
        } else if (k === 'a:p') {
          const text = extractInlineText(getChildren(n, 'a:p')).trim();
          if (text) {
            blocks.push({ type: 'text', content: text });
          }
          // Still check nested math inside a:p
          for (const child of getChildren(n, 'a:p')) {
            const ck = getTagKey(child);
            if (ck === 'm:oMath' || ck === 'm:oMathPara' || ck === 'a14:m') {
              walkSlide([child]);
            }
          }
        } else {
          walkSlide(getChildren(n, k));
        }
      }
    }

    walkSlide(parsed);
    const title = blocks.find((b) => b.type === 'text')?.content || `Slide ${i + 1}`;
    slides.push({
      slideNumber: i + 1,
      title,
      blocks,
    });
  }

  return {
    kind: 'slides',
    slides,
    mathMeta,
  };
}

function processSpreadsheet(buffer: Buffer): DocumentPreviewPayload {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
    return {
      name,
      rows: rows.slice(0, 200).map((row) => row.map((cell) => String(cell ?? ''))),
    };
  });

  return {
    kind: 'sheet',
    sheets,
    mathMeta: {
      ommlCount: 0,
      mathTypeOleCount: 0,
      convertedCount: 0,
      fallbackImagesCount: 0,
      supportsFullPreview: true,
      warnings: [],
    },
  };
}

export async function generateDocumentPreview(
  filePath: string,
  fileType: string
): Promise<DocumentPreviewPayload> {
  const ext = fileType.toLowerCase();
  if (ext === 'pdf') {
    return {
      kind: 'pdf',
      mathMeta: {
        ommlCount: 0,
        mathTypeOleCount: 0,
        convertedCount: 0,
        fallbackImagesCount: 0,
        supportsFullPreview: true,
        warnings: [],
      },
    };
  }

  const buffer = await fs.readFile(filePath);

  if (ext === 'docx') {
    return processDocx(buffer);
  }
  if (ext === 'pptx') {
    return processPptx(buffer);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return processSpreadsheet(buffer);
  }

  // Legacy binary .doc or .ppt without LibreOffice
  return {
    kind: 'unsupported',
    mathMeta: {
      ommlCount: 0,
      mathTypeOleCount: 0,
      convertedCount: 0,
      fallbackImagesCount: 0,
      supportsFullPreview: false,
      warnings: [
        `Định dạng nhị phân cũ (.${ext}) chưa hỗ trợ xem trước đầy đủ trực tiếp trên trình duyệt. Vui lòng tải xuống file gốc để đọc chính xác bố cục và công thức MathType.`,
      ],
    },
  };
}
