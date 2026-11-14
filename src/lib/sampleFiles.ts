import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { DOCUMENTS_DIR } from './storage.ts';

function toWinAnsiSafe(text: string): string {
  // pdf-lib standard Helvetica supports WinAnsi; normalize Vietnamese characters outside WinAnsi cleanly
  // while keeping Latin-1 accents where supported.
  const map: Record<string, string> = {
    ă: 'a', ằ: 'a', ắ: 'a', ặ: 'a', ẳ: 'a', ẵ: 'a',
    â: 'a', ầ: 'a', ấ: 'a', ậ: 'a', ẩ: 'a', ẫ: 'a',
    à: 'à', á: 'á', ạ: 'a', ả: 'a', ã: 'ã',
    đ: 'd', Đ: 'D',
    ê: 'ê', ề: 'e', ế: 'e', ệ: 'e', ể: 'e', ễ: 'e',
    ơ: 'o', ờ: 'o', ớ: 'o', ợ: 'o', ở: 'o', ỡ: 'o',
    ô: 'ô', ồ: 'o', ố: 'o', ộ: 'o', ổ: 'o', ỗ: 'o',
    ư: 'u', ừ: 'u', ứ: 'u', ự: 'u', ử: 'u', ữ: 'u',
    ị: 'i', ỉ: 'i', ĩ: 'i',
    ụ: 'u', ủ: 'u',
    ỳ: 'y', ỵ: 'y', ỷ: 'y', ỹ: 'y',
    Ă: 'A', Â: 'A', Ê: 'E', Ô: 'O', Ơ: 'O', Ư: 'U',
  };
  let res = '';
  for (const ch of text) {
    res += map[ch] ?? ch;
  }
  return res.replace(/[^\x20-\xFF]/g, '?');
}

export async function createSamplePdf(
  filename: string,
  title: string,
  linesPerPage: string[][]
): Promise<{ filePath: string; fileSize: number }> {
  const fullPath = path.join(DOCUMENTS_DIR, filename);
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  linesPerPage.forEach((lines, pageIndex) => {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { height, width } = page.getSize();

    // Header band
    page.drawRectangle({
      x: 40,
      y: height - 72,
      width: width - 80,
      height: 36,
      color: rgb(0.94, 0.96, 1),
      borderColor: rgb(0.15, 0.39, 0.92),
      borderWidth: 1,
    });
    page.drawText(toWinAnsiSafe(`EDULIBRARY - ${title}`), {
      x: 52,
      y: height - 58,
      size: 11,
      font: fontBold,
      color: rgb(0.09, 0.25, 0.65),
    });

    let y = height - 108;
    for (const line of lines) {
      if (y < 70) break;
      const isHeading = line.startsWith('# ');
      const cleanLine = isHeading ? line.slice(2) : line;
      page.drawText(toWinAnsiSafe(cleanLine), {
        x: 48,
        y,
        size: isHeading ? 13 : 10.5,
        font: isHeading ? fontBold : fontRegular,
        color: isHeading ? rgb(0.06, 0.1, 0.2) : rgb(0.2, 0.25, 0.33),
      });
      y -= isHeading ? 24 : 18;
    }

    // Footer
    page.drawText(`Trang ${pageIndex + 1} / ${linesPerPage.length}`, {
      x: width / 2 - 28,
      y: 34,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.55),
    });
  });

  const bytes = await pdfDoc.save();
  await fs.writeFile(fullPath, bytes);
  return { filePath: filename, fileSize: bytes.byteLength };
}

export async function createSampleDocxWithOmml(
  filename: string,
  documentXmlBody: string
): Promise<{ filePath: string; fileSize: number }> {
  const fullPath = path.join(DOCUMENTS_DIR, filename);
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
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
  );

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${documentXmlBody}
  </w:body>
</w:document>`
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(fullPath, buffer);
  return { filePath: filename, fileSize: buffer.byteLength };
}

export async function createSampleXlsx(
  filename: string
): Promise<{ filePath: string; fileSize: number }> {
  const fullPath = path.join(DOCUMENTS_DIR, filename);
  const wb = XLSX.utils.book_new();

  const sheet1 = XLSX.utils.aoa_to_sheet([
    ['STT', 'Nội dung chuyên đề', 'Số tiết', 'Mức độ', 'Công thức trọng tâm'],
    [1, 'Dao động điều hòa', 6, 'Cơ bản - Vận dụng', 'x = A cos(ωt + φ)'],
    [2, 'Con lắc lò xo', 5, 'Vận dụng cao', 'T = 2π √(m/k)'],
    [3, 'Con lắc đơn', 4, 'Cơ bản - Vận dụng', 'T = 2π √(l/g)'],
    [4, 'Sóng cơ và giao thoa sóng', 8, 'Vận dụng cao', 'λ = v.T = v/f'],
    [5, 'Dòng điện xoay chiều RLC', 10, 'Tổng hợp', 'Z = √(R² + (ZL - ZC)²)'],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet1, 'Phân phối chương trình');

  const sheet2 = XLSX.utils.aoa_to_sheet([
    ['Lần đo', 'Chiều dài l (m)', 'Chu kỳ T (s)', 'Gia tốc g (m/s²)', 'Sai số (%)'],
    [1, 0.80, 1.795, 9.81, 0.12],
    [2, 1.00, 2.006, 9.81, 0.08],
    [3, 1.20, 2.198, 9.80, 0.15],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet2, 'Số liệu thực hành');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await fs.writeFile(fullPath, buf);
  return { filePath: filename, fileSize: buf.byteLength };
}

export async function createSamplePptx(
  filename: string
): Promise<{ filePath: string; fileSize: number }> {
  const fullPath = path.join(DOCUMENTS_DIR, filename);
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`
  );

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>BÀI GIẢNG: NGUYÊN HÀM &amp; TÍCH PHÂN (TOÁN 12)</a:t></a:r></a:p>
      <a:p><a:r><a:t>Mục tiêu: Nắm vững định nghĩa nguyên hàm, bảng công thức cơ bản và phương pháp tích phân từng phần.</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  );

  zip.file(
    'ppt/slides/slide2.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>1. Công thức Newton - Leibniz</a:t></a:r></a:p>
      <a:p>
        <m:oMath>
          <m:nary>
            <m:naryPr><m:chr m:val="∫"/></m:naryPr>
            <m:sub><m:r><m:t>a</m:t></m:r></m:sub>
            <m:sup><m:r><m:t>b</m:t></m:r></m:sup>
            <m:e><m:r><m:t>f(x) dx = F(b) - F(a)</m:t></m:r></m:e>
          </m:nary>
        </m:oMath>
      </a:p>
      <a:p><a:r><a:t>Áp dụng: Tính diện tích hình phẳng giới hạn bởi đồ thị y = f(x), trục hoành và hai đường thẳng x = a, x = b.</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(fullPath, buffer);
  return { filePath: filename, fileSize: buffer.byteLength };
}
