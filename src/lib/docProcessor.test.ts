import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { generateDocumentPreview } from './docProcessor.ts';

async function buildDocxBuffer(
  bodyXml: string,
  extraFiles: Record<string, string | Buffer> = {}
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`
  );
  for (const [k, v] of Object.entries(extraFiles)) {
    zip.file(k, v);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('generateDocumentPreview extracts and preserves OMML math, physics, and chemistry formulas accurately', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edulib-docx-'));
  try {
    const bodyXml = `
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Chuyên đề Nguyên hàm - Tích phân - Lý - Hóa</w:t></w:r>
      </w:p>
      <w:p>
        <m:oMathPara>
          <m:oMath>
            <m:nary>
              <m:naryPr><m:chr m:val="∫"/></m:naryPr>
              <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
              <m:sup><m:r><m:t>1</m:t></m:r></m:sup>
              <m:e>
                <m:f>
                  <m:num><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+1</m:t></m:r></m:num>
                  <m:den><m:rad><m:e><m:r><m:t>x+3</m:t></m:r></m:e></m:rad></m:den>
                </m:f>
              </m:e>
            </m:nary>
          </m:oMath>
        </m:oMathPara>
      </w:p>
      <w:p>
        <m:oMath>
          <m:limLow>
            <m:e><m:r><m:t>lim</m:t></m:r></m:e>
            <m:lim><m:r><m:t>x→∞</m:t></m:r></m:lim>
          </m:limLow>
          <m:m>
            <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>
            <m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr>
          </m:m>
        </m:oMath>
      </w:p>
      <w:p>
        <m:oMath>
          <m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e><m:r><m:t>F</m:t></m:r></m:e></m:acc>
          <m:r><m:t>=m</m:t></m:r>
          <m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc>
        </m:oMath>
      </w:p>
      <w:p>
        <m:oMath>
          <m:r><m:t>N</m:t></m:r><m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>
          <m:r><m:t>⇌</m:t></m:r>
          <m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub><m:r><m:t>O</m:t></m:r>
        </m:oMath>
      </w:p>
    `;

    const buf = await buildDocxBuffer(bodyXml);
    const filePath = path.join(tmpDir, 'math-sample.docx');
    await fs.writeFile(filePath, buf);

    const preview = await generateDocumentPreview(filePath, 'docx');
    assert.equal(preview.kind, 'word');
    assert.equal(preview.mathMeta.ommlCount, 4);
    assert.equal(preview.mathMeta.convertedCount, 4);
    assert.equal(preview.mathMeta.preCheckTotal, 4);
    assert.equal(preview.mathMeta.postCheckPreserved, 4);
    assert.equal(preview.mathMeta.supportsFullPreview, true);
    assert.equal(preview.mathMeta.warnings.length, 0);

    const allHtml = preview.pages?.map((p) => p.html).join('\n') || '';
    assert.match(allHtml, /\\int_\{0\}\^\{1\}/);
    assert.match(allHtml, /\\frac\{x\^\{2\}\+1\}\{\\sqrt\{x\+3\}\}/);
    assert.match(allHtml, /\\lim_\{x\\rightarrow \s*\\infty\}/);
    assert.match(allHtml, /\\begin\{pmatrix\} 1 &amp; 2 \\\\ 3 &amp; 4 \\end\{pmatrix\}/);
    assert.match(allHtml, /\\vec\{F\}\s*=m\s*\\vec\{a\}/);
    assert.match(allHtml, /\\rightleftharpoons/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('generateDocumentPreview detects MathType OLE objects and WMF/EMF formula images and issues transparent warnings', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edulib-ole-'));
  try {
    const bodyXml = `
      <w:p>
        <w:r><w:t>Công thức MathType nhúng:</w:t></w:r>
        <w:r><w:object/></w:r>
      </w:p>
    `;
    const buf = await buildDocxBuffer(bodyXml, {
      'word/embeddings/oleObject1.bin': Buffer.from('FAKE_MATHTYPE_OLE'),
      'word/media/image1.wmf': Buffer.from('FAKE_WMF_VECTOR'),
    });
    const filePath = path.join(tmpDir, 'ole-sample.docx');
    await fs.writeFile(filePath, buf);

    const preview = await generateDocumentPreview(filePath, 'docx');
    assert.equal(preview.kind, 'word');
    assert.equal(preview.mathMeta.mathTypeOleCount, 1);
    assert.equal(preview.mathMeta.formulaImageCount, 1);
    assert.equal(preview.mathMeta.preCheckTotal, 2);
    assert.equal(preview.mathMeta.postCheckPreserved, 0);
    assert.equal(preview.mathMeta.supportsFullPreview, false);
    assert.ok(preview.mathMeta.warnings.length >= 1);
    assert.match(preview.mathMeta.warnings[0], /MathType OLE/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('generateDocumentPreview parses PPTX slides, XLSX sheets, and returns explicit warning for legacy .doc', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edulib-office-'));
  try {
    // 1. PPTX
    const pptxZip = new JSZip();
    pptxZip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Bài giảng Hình học không gian</a:t></a:r></a:p>
    <m:oMath><m:r><m:t>V=</m:t></m:r><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>3</m:t></m:r></m:den></m:f><m:r><m:t>Bh</m:t></m:r></m:oMath>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
    );
    const pptxPath = path.join(tmpDir, 'slides.pptx');
    await fs.writeFile(pptxPath, await pptxZip.generateAsync({ type: 'nodebuffer' }));
    const pptxPreview = await generateDocumentPreview(pptxPath, 'pptx');
    assert.equal(pptxPreview.kind, 'slides');
    assert.equal(pptxPreview.slides?.length, 1);
    assert.equal(pptxPreview.slides?.[0].title, 'Bài giảng Hình học không gian');
    assert.equal(pptxPreview.mathMeta.convertedCount, 1);

    // 2. XLSX
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['STT', 'Họ và tên', 'Điểm Toán'],
        [1, 'Nguyễn Minh Anh', 9.5],
      ]),
      'BangDiem'
    );
    const xlsxPath = path.join(tmpDir, 'scores.xlsx');
    await fs.writeFile(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const xlsxPreview = await generateDocumentPreview(xlsxPath, 'xlsx');
    assert.equal(xlsxPreview.kind, 'sheet');
    assert.equal(xlsxPreview.sheets?.[0].name, 'BangDiem');
    assert.equal(xlsxPreview.sheets?.[0].rows[1][1], 'Nguyễn Minh Anh');

    // 3. Legacy .doc
    const docPath = path.join(tmpDir, 'legacy.doc');
    await fs.writeFile(docPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const docPreview = await generateDocumentPreview(docPath, 'doc');
    assert.equal(docPreview.kind, 'unsupported');
    assert.equal(docPreview.mathMeta.supportsFullPreview, false);
    assert.ok(docPreview.mathMeta.warnings[0].includes('.doc'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
