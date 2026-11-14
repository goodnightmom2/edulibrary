import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  documents,
  documentTags,
  grades,
  processingJobs,
  siteSettings,
  subjects,
  tags,
  users,
} from './schema.ts';
import { toVietnameseSlug } from '../lib/slug.ts';
import { ensureStorageDirs, resolveSafeStoragePath, DOCUMENTS_DIR } from '../lib/storage.ts';
import { generateDocumentPreview } from '../lib/docProcessor.ts';
import {
  createSampleDocxWithOmml,
  createSamplePdf,
  createSamplePptx,
  createSampleXlsx,
} from '../lib/sampleFiles.ts';

const DEFAULT_SUBJECTS = [
  'Toán học',
  'Vật lý',
  'Hóa học',
  'Ngữ văn',
  'Tiếng Anh',
  'Sinh học',
  'Lịch sử',
  'Địa lý',
  'Tin học',
  'Giáo dục kinh tế và pháp luật',
];

const DEFAULT_CATEGORIES = [
  { name: 'Đề thi giữa kỳ', description: 'Đề kiểm tra đánh giá giữa học kỳ 1 và học kỳ 2 có đáp án chi tiết' },
  { name: 'Đề thi cuối kỳ', description: 'Bộ đề thi học kỳ chuẩn cấu trúc Bộ Giáo dục & Đào tạo' },
  { name: 'Đề thi học sinh giỏi', description: 'Đề chọn học sinh giỏi cấp tỉnh, thành phố và quốc gia' },
  { name: 'Đề kiểm tra', description: 'Đề kiểm tra 15 phút, 45 phút bám sát chương trình mới' },
  { name: 'Giáo án', description: 'Kế hoạch bài dạy theo định hướng phát triển năng lực học sinh' },
  { name: 'Bài tập', description: 'Hệ thống bài tập tự luận và trắc nghiệm phân dạng từ cơ bản đến nâng cao' },
  { name: 'Chuyên đề', description: 'Tài liệu chuyên đề bồi dưỡng kiến thức trọng tâm và luyện thi' },
];

const DEFAULT_SETTINGS: Array<{ key: string; value: string }> = [
  { key: 'siteName', value: 'EduLibrary' },
  { key: 'siteTagline', value: 'Thư viện học liệu trực tuyến dành cho giáo viên và học sinh' },
  { key: 'bannerTitle', value: 'Kho tài liệu học tập, đề thi và giáo án chuẩn hóa' },
  {
    key: 'bannerSubtitle',
    value:
      'Tra cứu, đọc trực tiếp tài liệu Word, PDF với công thức Toán - Lý - Hóa sắc nét và tải xuống hoàn toàn miễn phí.',
  },
  { key: 'contactEmail', value: 'hotro@edulibrary.vn' },
  { key: 'contactPhone', value: '(028) 3822 6868' },
  { key: 'contactAddress', value: 'Quận 1, Thành phố Hồ Chí Minh' },
  {
    key: 'footerText',
    value: '© 2026 EduLibrary — Thư viện học liệu trực tuyến. Phục vụ cộng đồng giáo dục Việt Nam.',
  },
  { key: 'logoUrl', value: '' },
  { key: 'featuredBannerUrl', value: '' },
];

let seedPromise: Promise<void> | null = null;
let seededCompleted = false;

export async function ensureSeeded(): Promise<void> {
  if (seededCompleted) return;
  if (!seedPromise) {
    seedPromise = seedDatabase()
      .then(() => {
        seededCompleted = true;
      })
      .catch((err) => {
        seedPromise = null;
        throw err;
      });
  }
  return seedPromise;
}

export async function seedDatabase(): Promise<void> {
  await ensureStorageDirs();

  // 1. Subjects
  for (let i = 0; i < DEFAULT_SUBJECTS.length; i++) {
    const name = DEFAULT_SUBJECTS[i];
    await db
      .insert(subjects)
      .values({
        name,
        slug: toVietnameseSlug(name),
        description: `Tổng hợp tài liệu, đề thi và giáo án môn ${name}`,
        sortOrder: i + 1,
      })
      .onConflictDoNothing();
  }

  // 2. Grades 1..12
  for (let level = 1; level <= 12; level++) {
    const name = `Lớp ${level}`;
    await db
      .insert(grades)
      .values({
        name,
        slug: `lop-${level}`,
        level,
      })
      .onConflictDoNothing();
  }

  // 3. Categories
  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        name: cat.name,
        slug: toVietnameseSlug(cat.name),
        description: cat.description,
      })
      .onConflictDoNothing();
  }

  // 4. Site Settings
  for (const item of DEFAULT_SETTINGS) {
    await db
      .insert(siteSettings)
      .values({
        settingKey: item.key,
        settingValue: item.value,
      })
      .onConflictDoNothing();
  }

  // 5. Initial Admin account (configured via env; dev fallback only outside production)
  const adminEmail = (
    process.env.ADMIN_SEED_EMAIL ||
    process.env.ADMIN_DEFAULT_EMAIL ||
    (process.env.NODE_ENV === 'production' ? '' : 'admin@edulibrary.vn')
  ).toLowerCase();
  const adminPassword =
    process.env.ADMIN_SEED_PASSWORD ||
    process.env.ADMIN_DEFAULT_PASSWORD ||
    (process.env.NODE_ENV === 'production' ? '' : 'EduAdmin@2026');

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db
      .insert(users)
      .values({
        uid: 'admin-root-edulibrary',
        fullName: 'Quản trị viên EduLibrary',
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      })
      .onConflictDoNothing();
  }

  // 6. Seed sample documents only outside production (or when explicitly enabled) and table is empty
  if (process.env.NODE_ENV === 'production' && process.env.RUN_SAMPLE_SEED !== 'true') {
    return;
  }
  const [{ totalDocs }] = await db.select({ totalDocs: count() }).from(documents);
  if (totalDocs > 0) return;

  const allSubjects = await db.select().from(subjects);
  const allGrades = await db.select().from(grades);
  const allCategories = await db.select().from(categories);
  const [adminUser] = adminEmail
    ? await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
    : [];

  const subBySlug = Object.fromEntries(allSubjects.map((s) => [s.slug, s.id]));
  const gradeBySlug = Object.fromEntries(allGrades.map((g) => [g.slug, g.id]));
  const catBySlug = Object.fromEntries(allCategories.map((c) => [c.slug, c.id]));

  // Document 1: DOCX Toán 12 with rich OMML equations
  const mathDocxXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>CHUYÊN ĐỀ NGUYÊN HÀM, TÍCH PHÂN VÀ ỨNG DỤNG - TOÁN 12</w:t></w:r></w:p>
    <w:p><w:r><w:t>Biên soạn chuẩn cấu trúc Chương trình GDPT mới. Toàn bộ công thức được mã hóa chuẩn OMML tương thích MathType.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>I. Tóm tắt công thức trọng tâm</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Công thức tích phân xác định Newton - Leibniz trên đoạn [a; b]:</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:nary>
        <m:naryPr><m:chr m:val="∫"/></m:naryPr>
        <m:sub><m:r><m:t>a</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>b</m:t></m:r></m:sup>
        <m:e><m:r><m:t>f(x) dx = F(b) - F(a)</m:t></m:r></m:e>
      </m:nary>
    </m:oMath></m:oMathPara></w:p>
    <w:p><w:r><w:t>2. Phương pháp tích phân từng phần:</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:nary>
        <m:naryPr><m:chr m:val="∫"/></m:naryPr>
        <m:sub><m:r><m:t>a</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>b</m:t></m:r></m:sup>
        <m:e><m:r><m:t>u dv = uv</m:t></m:r></m:e>
      </m:nary>
      <m:sSubSup><m:e><m:r><m:t>|</m:t></m:r></m:e><m:sub><m:r><m:t>a</m:t></m:r></m:sub><m:sup><m:r><m:t>b</m:t></m:r></m:sup></m:sSubSup>
      <m:r><m:t> - </m:t></m:r>
      <m:nary>
        <m:naryPr><m:chr m:val="∫"/></m:naryPr>
        <m:sub><m:r><m:t>a</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>b</m:t></m:r></m:sup>
        <m:e><m:r><m:t>v du</m:t></m:r></m:e>
      </m:nary>
    </m:oMath></m:oMathPara></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>II. Bài tập vận dụng có lời giải</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bài 1: </w:t></w:r><w:r><w:t>Tính tích phân </w:t></w:r>
      <m:oMath>
        <m:r><m:t>I = </m:t></m:r>
        <m:nary>
          <m:naryPr><m:chr m:val="∫"/></m:naryPr>
          <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
          <m:sup><m:r><m:t>1</m:t></m:r></m:sup>
          <m:e><m:f><m:num><m:r><m:t>2x + 1</m:t></m:r></m:num><m:den><m:rad><m:deg/><m:e><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t> + x + 1</m:t></m:r></m:e></m:rad></m:den></m:f><m:r><m:t> dx</m:t></m:r></m:e>
        </m:nary>
      </m:oMath>
    </w:p>
    <w:p><w:r><w:t>Lời giải: Đặt </w:t></w:r><m:oMath><m:r><m:t>t = </m:t></m:r><m:rad><m:deg/><m:e><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t> + x + 1</m:t></m:r></m:e></m:rad></m:oMath><w:r><w:t> suy ra </w:t></w:r><m:oMath><m:sSup><m:e><m:r><m:t>t</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t> = </m:t></m:r><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t> + x + 1</m:t></m:r></m:oMath><w:r><w:t> nên </w:t></w:r><m:oMath><m:r><m:t>2t dt = (2x + 1) dx</m:t></m:r></m:oMath><w:r><w:t>. Đổi cận: x = 0 ⇒ t = 1; x = 1 ⇒ t = √3.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Khi đó kết quả bằng </w:t></m:r><m:oMath><m:r><m:t>I = 2(</m:t></m:r><m:rad><m:deg/><m:e><m:r><m:t>3</m:t></m:r></m:e></m:rad><m:r><m:t> - 1)</m:t></m:r></m:oMath><w:r><w:t>.</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>III. Bảng tổng hợp các dạng giới hạn và ma trận hệ số</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ví dụ giới hạn đặc biệt và ma trận biến đổi tọa độ Oxyz:</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim><m:r><m:t>x→0</m:t></m:r></m:lim></m:limLow>
      <m:f><m:num><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:num><m:den><m:r><m:t>x</m:t></m:r></m:den></m:f>
      <m:r><m:t> = 1,   A = </m:t></m:r>
      <m:m>
        <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>0</m:t></m:r></m:e></m:mr>
        <m:mr><m:e><m:r><m:t>0</m:t></m:r></m:e><m:e><m:r><m:t>-1</m:t></m:r></m:e></m:mr>
      </m:m>
    </m:oMath></m:oMathPara></w:p>
  `;
  const doc1File = await createSampleDocxWithOmml('chuyen-de-tich-phan-toan-12.docx', mathDocxXml);

  // Document 2: PDF Đề thi cuối kỳ Toán 12
  const doc2File = await createSamplePdf(
    'de-thi-cuoi-ky-toan-12-2026.pdf',
    'DE THI CUOI KY 1 MON TOAN LOP 12',
    [
      [
        '# DE KIEM TRA CUOI HOC KY I - MON TOAN LOP 12',
        'Thoi gian lam bai: 90 phut (khong ke thoi gian phat de)',
        'Ma de: 101 - Chuong trinh GDPT 2018',
        '',
        '# PHAN I. Cau trac nghiem nhieu phuong an lua chon (3,0 diem)',
        'Cau 1: Cho ham so y = f(x) = x^3 - 3x^2 + 2. Ham so dong bien tren khoang nao?',
        '  A. (0; 2)    B. (-oo; 0) va (2; +oo)    C. (-oo; 2)    D. (0; +oo)',
        'Cau 2: Gia tri cuc tieu cua ham so y = x^4 - 2x^2 + 3 la:',
        '  A. 3         B. 2                       C. 1           D. 0',
        'Cau 3: Tiem can ngang cua do thi ham so y = (2x - 1)/(x + 1) la duong thang:',
        '  A. y = 2     B. x = -1                  C. y = -1      D. x = 2',
        'Cau 4: Trong khong gian Oxyz, cho hai vecto u = (1; -2; 3) va v = (2; 1; -1).',
        '  Tich vo huong u.v bang: A. -3   B. 3   C. -1   D. 5',
        'Cau 5: Nguyen ham cua ham so f(x) = e^(2x) + cos(x) la:',
        '  A. (1/2)e^(2x) + sin(x) + C     B. 2e^(2x) - sin(x) + C',
      ],
      [
        '# PHAN II. Cau trac nghiem dung sai va Tu luan (7,0 diem)',
        'Cau 6 (1,5 diem): Khao sat su bien thien va ve do thi ham so y = (x^2 - 2x + 2)/(x - 1).',
        'Cau 7 (2,0 diem): Mot khoi lang tru dung ABC.A\'B\'C\' co day ABC la tam giac vuong tai A,',
        '  canh AB = a, AC = a*sqrt(3), canh ben AA\' = 2a. Tinh the tich khoi lang tru',
        '  va khoang cach tu dinh A den mat phang (A\'BC).',
        'Cau 8 (2,0 diem): Trong khong gian Oxyz, viet phuong trinh mat phang (P) di qua',
        '  diem M(1; 2; -1) va vuong goc voi duong thang d: (x-1)/2 = (y+1)/(-1) = z/3.',
        '',
        '# DAP AN THAM KHAO NHANH',
        '1. B   2. B   3. A   4. A (-3)   5. A',
        'Cau 7: V = S_day . h = (1/2 * a * a*sqrt(3)) * 2a = a^3 * sqrt(3).',
        'Cau 8: Phap tuyen n = (2; -1; 3) => 2x - y + 3z + 3 = 0.',
      ],
    ]
  );

  // Document 3: DOCX Vật lý 11 - Sóng cơ & Dòng điện xoay chiều với công thức vector & căn thức
  const physicsDocxXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>GIÁO ÁN VẬT LÝ 11: DAO ĐỘNG ĐIỀU HÒA VÀ SÓNG CƠ</w:t></w:r></w:p>
    <w:p><w:r><w:t>Giáo án điện tử chuẩn Công văn 5512, tích hợp hệ thống công thức vật lý và bài tập minh họa.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>1. Phương trình dao động và hợp lực phục hồi</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vecto lực kéo về tác dụng lên vật có biểu thức: </w:t></w:r>
      <m:oMath>
        <m:acc><m:accPr><m:chr m:val="→"/></m:accPr><m:e><m:r><m:t>F</m:t></m:r></m:e></m:acc>
        <m:r><m:t> = m</m:t></m:r>
        <m:acc><m:accPr><m:chr m:val="→"/></m:accPr><m:e><m:r><m:t>a</m:t></m:r></m:e></m:acc>
        <m:r><m:t> = -m</m:t></m:r>
        <m:sSup><m:e><m:r><m:t>ω</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>
        <m:acc><m:accPr><m:chr m:val="→"/></m:accPr><m:e><m:r><m:t>x</m:t></m:r></m:e></m:acc>
      </m:oMath>
    </w:p>
    <w:p><w:r><w:t>Chu kỳ dao động riêng của con lắc lò xo và con lắc đơn:</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:r><m:t>T = 2π</m:t></m:r>
      <m:rad><m:deg/><m:e><m:f><m:num><m:r><m:t>m</m:t></m:r></m:num><m:den><m:r><m:t>k</m:t></m:r></m:den></m:f></m:e></m:rad>
      <m:r><m:t> ,    </m:t></m:r>
      <m:sSub><m:e><m:r><m:t>T</m:t></m:r></m:e><m:sub><m:r><m:t>đơn</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t> = 2π</m:t></m:r>
      <m:rad><m:deg/><m:e><m:f><m:num><m:r><m:t>l</m:t></m:r></m:num><m:den><m:r><m:t>g</m:t></m:r></m:den></m:f></m:e></m:rad>
    </m:oMath></m:oMathPara></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>2. Bảng hệ số góc và năng lượng dao động</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Đại lượng</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Công thức</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đơn vị (SI)</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Động năng</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><m:oMath><m:sSub><m:e><m:r><m:t>W</m:t></m:r></m:e><m:sub><m:r><m:t>đ</m:t></m:r></m:sub></m:sSub><m:r><m:t> = </m:t></m:r><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:r><m:t>m</m:t></m:r><m:sSup><m:e><m:r><m:t>v</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Joule (J)</w:t></m:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cơ năng toàn phần</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><m:oMath><m:r><m:t>W = </m:t></m:r><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f><m:r><m:t>k</m:t></m:r><m:sSup><m:e><m:r><m:t>A</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Joule (J)</w:t></m:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;
  const doc3File = await createSampleDocxWithOmml('giao-an-vat-ly-11-dao-dong-co.docx', physicsDocxXml);

  // Document 4: DOCX Hóa học 12 - Cân bằng hóa học & Este - Lipit với chỉ số dưới & mũi tên thuận nghịch
  const chemDocxXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>ĐỀ KIỂM TRA GIỮA KỲ MÔN HÓA HỌC LỚP 12</w:t></w:r></w:p>
    <w:p><w:r><w:t>Chủ đề: Ester - Lipid, Carbohydrate và Phản ứng thuận nghịch trong dung dịch.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Phần I. Phương trình hóa học minh họa</w:t></w:r></w:p>
    <w:p><w:r><w:t>Phản ứng ester hóa giữa acetic acid và ethyl alcohol (xúc tác H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</w:t></w:r><w:r><w:t> đặc, đun nóng):</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:sSub><m:e><m:r><m:t>CH</m:t></m:r></m:e><m:sub><m:r><m:t>3</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>COOH + </m:t></m:r>
      <m:sSub><m:e><m:r><m:t>C</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>
      <m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>5</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>OH ⇌ </m:t></m:r>
      <m:sSub><m:e><m:r><m:t>CH</m:t></m:r></m:e><m:sub><m:r><m:t>3</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>COO</m:t></m:r>
      <m:sSub><m:e><m:r><m:t>C</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>
      <m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>5</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t> + </m:t></m:r>
      <m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>O</m:t></m:r>
    </m:oMath></m:oMathPara></w:p>
    <w:p><w:r><w:t>Hằng số cân bằng hóa học được tính theo công thức:</w:t></w:r></w:p>
    <w:p><m:oMathPara><m:oMath>
      <m:sSub><m:e><m:r><m:t>K</m:t></m:r></m:e><m:sub><m:r><m:t>C</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t> = </m:t></m:r>
      <m:f>
        <m:num><m:r><m:t>[</m:t></m:r><m:sSub><m:e><m:r><m:t>CH</m:t></m:r></m:e><m:sub><m:r><m:t>3</m:t></m:r></m:sub></m:sSub><m:r><m:t>COOC</m:t></m:r><m:sSub><m:e><m:r><m:t>2</m:t></m:r></m:e><m:sub><m:r><m:t>H</m:t></m:r></m:sub></m:sSub><m:r><m:t>5][</m:t></m:r><m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub><m:r><m:t>O]</m:t></m:r></m:num>
        <m:den><m:r><m:t>[</m:t></m:r><m:sSub><m:e><m:r><m:t>CH</m:t></m:r></m:e><m:sub><m:r><m:t>3</m:t></m:r></m:sub></m:sSub><m:r><m:t>COOH][</m:t></m:r><m:sSub><m:e><m:r><m:t>C</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub><m:r><m:t>H5OH]</m:t></m:r></m:den>
      </m:f>
    </m:oMath></m:oMathPara></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Câu 1: </w:t></w:r><w:r><w:t>Đun nóng 6,0 gam acetic acid với 6,9 gam ethanol (xúc tác H</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</m:t></m:r><w:r><w:t>SO</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>4</m:t></m:r><w:r><w:t> đặc) thu được 5,28 gam ethyl acetate. Tính hiệu suất phản ứng ester hóa.</w:t></w:r></w:p>
  `;
  const doc4File = await createSampleDocxWithOmml('de-kiem-tra-hoa-hoc-12-ester.docx', chemDocxXml);

  // Document 5: PDF Ngữ văn 12
  const doc5File = await createSamplePdf(
    'chuyen-de-nghi-luan-van-hoc-lop-12.pdf',
    'CHUYEN DE NGHI LUAN VAN HOC LOP 12',
    [
      [
        '# CHUYEN DE BOI DUONG HOC SINH GIOI NGU VAN 12',
        'Noi dung: Phuong phap phan tich tac pham tru tinh va van xuoi hien dai',
        '',
        '1. Cấu truc mot bai van nghi luan van hoc dat chuan:',
        '  - Mo bai: Gioi thieu tac gia, tac pham va van de can nghi luan.',
        '  - Than bai: Trien khai he thong luan diem ro rang, ket hop dan chung tinh te.',
        '  - Ket bai: Tong ket gia tri noi dung, nghe thuat va thong diep nhan van.',
        '',
        '2. Ky nang binh giang chi tiet nghe thuat dat gia:',
        '  - Khai thac bien phap tu tu (an du, hoan du, diep cau truc, tuong phan).',
        '  - Phan tich nhip dieu cau van va giong dieu tran thuat cua tac gia.',
      ],
    ]
  );

  // Document 6: DOCX Tiếng Anh 10
  const engDocxXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>BÀI TẬP BỔ TRỢ TIẾNG ANH LỚP 10: UNIT 1 - FAMILY LIFE</w:t></w:r></w:p>
    <w:p><w:r><w:t>Tài liệu tổng hợp từ vựng, ngữ pháp Present Simple vs Present Continuous và bài đọc hiểu kèm đáp án.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Part A. Grammar Review</w:t></w:r></w:p>
    <w:p><w:r><w:t>1. Present Simple is used for habits, daily routines, and general truths (e.g., My mother usually cooks dinner at 6 p.m.).</w:t></w:r></w:p>
    <w:p><w:r><w:t>2. Present Continuous is used for actions happening right now or temporary situations (e.g., Today, my father is doing the laundry).</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Part B. Practice Exercise</w:t></w:r></w:p>
    <w:p><w:r><w:t>Question 1: Look! The children ________ (play) football in the yard while their parents ________ (prepare) lunch.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Question 2: Sharing household chores helps ________ (strengthen) family bonds and teaches responsibility.</w:t></w:r></w:p>
  `;
  const doc6File = await createSampleDocxWithOmml('bai-tap-tieng-anh-10-unit-1.docx', engDocxXml);

  // Document 7: XLSX Vật lý 12
  const doc7File = await createSampleXlsx('bang-phan-phoi-va-so-lieu-thuc-hanh-vat-ly-12.xlsx');

  // Document 8: PPTX Bài giảng Toán 12
  const doc8File = await createSamplePptx('bai-giang-nguyen-ham-tich-phan-toan-12.pptx');

  const sampleRecords = [
    {
      title: 'Chuyên đề Nguyên hàm, Tích phân và Ứng dụng (Chuẩn OMML / MathType)',
      description:
        'Tài liệu chuyên đề Toán 12 tổng hợp đầy đủ công thức tích phân xác định, tích phân từng phần, giới hạn đặc biệt và ma trận biến đổi kèm bài tập giải chi tiết.',
      originalFilename: 'Chuyen-de-Tich-phan-Toan-12.docx',
      storedFilename: doc1File.filePath,
      fileType: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: doc1File.fileSize,
      filePath: doc1File.filePath,
      subjectId: subBySlug['toan-hoc'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['chuyen-de'],
      topic: 'Giải tích 12 - Tích phân',
      author: 'ThS. Nguyễn Minh Hoàng',
      featured: true,
      viewCount: 1482,
      downloadCount: 643,
      tagNames: ['Tích phân', 'Toán 12', 'MathType', 'Ôn thi THPT'],
    },
    {
      title: 'Đề thi cuối học kỳ 1 môn Toán lớp 12 năm học 2025 - 2026 (Có đáp án)',
      description:
        'Bộ đề kiểm tra cuối kỳ 1 theo cấu trúc mới gồm trắc nghiệm nhiều lựa chọn, đúng sai và tự luận hình học không gian Oxyz.',
      originalFilename: 'De-thi-cuoi-ky-Toan-12.pdf',
      storedFilename: doc2File.filePath,
      fileType: 'pdf',
      mimeType: 'application/pdf',
      fileSize: doc2File.fileSize,
      filePath: doc2File.filePath,
      subjectId: subBySlug['toan-hoc'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['de-thi-cuoi-ky'],
      topic: 'Kiểm tra cuối học kỳ 1',
      author: 'Tổ Toán - THPT Chuyên Lê Hồng Phong',
      featured: true,
      viewCount: 2150,
      downloadCount: 1120,
      tagNames: ['Đề thi cuối kỳ', 'Toán 12', 'Oxyz'],
    },
    {
      title: 'Giáo án Vật lý 11: Dao động điều hòa và con lắc lò xo (Công văn 5512)',
      description:
        'Kế hoạch bài dạy môn Vật lý 11 trình bày rõ hệ thống công thức vector lực kéo về, chu kỳ con lắc và bảng tổng hợp năng lượng dao động.',
      originalFilename: 'Giao-an-Vat-ly-11-Dao-dong-co.docx',
      storedFilename: doc3File.filePath,
      fileType: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: doc3File.fileSize,
      filePath: doc3File.filePath,
      subjectId: subBySlug['vat-ly'],
      gradeId: gradeBySlug['lop-11'],
      categoryId: catBySlug['giao-an'],
      topic: 'Dao động cơ học',
      author: 'Cô Trần Thị Lan Anh',
      featured: true,
      viewCount: 980,
      downloadCount: 412,
      tagNames: ['Giáo án 5512', 'Vật lý 11', 'Dao động cơ'],
    },
    {
      title: 'Đề thi giữa kỳ 1 môn Hóa học 12: Ester - Lipid và Cân bằng hóa học',
      description:
        'Đề kiểm tra giữa kỳ kèm công thức cân bằng hóa học, phương trình phản ứng thuận nghịch và bài tập tính hiệu suất ester hóa.',
      originalFilename: 'De-kiem-tra-Hoa-hoc-12-Ester.docx',
      storedFilename: doc4File.filePath,
      fileType: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: doc4File.fileSize,
      filePath: doc4File.filePath,
      subjectId: subBySlug['hoa-hoc'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['de-thi-giua-ky'],
      topic: 'Ester - Lipid',
      author: 'Thầy Phạm Quốc Bảo',
      featured: true,
      viewCount: 845,
      downloadCount: 389,
      tagNames: ['Hóa học 12', 'Ester', 'Cân bằng hóa học'],
    },
    {
      title: 'Chuyên đề bồi dưỡng HSG Ngữ văn 12: Phương pháp nghị luận văn học',
      description:
        'Hướng dẫn kỹ năng lập luận, khai thác chi tiết nghệ thuật và bình giảng tác phẩm trữ tình trong đề thi học sinh giỏi.',
      originalFilename: 'Chuyen-de-Nghi-luan-van-hoc-12.pdf',
      storedFilename: doc5File.filePath,
      fileType: 'pdf',
      mimeType: 'application/pdf',
      fileSize: doc5File.fileSize,
      filePath: doc5File.filePath,
      subjectId: subBySlug['ngu-van'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['de-thi-hoc-sinh-gioi'],
      topic: 'Nghị luận văn học',
      author: 'Cô Lê Thanh Thảo',
      featured: false,
      viewCount: 620,
      downloadCount: 274,
      tagNames: ['Ngữ văn 12', 'Học sinh giỏi'],
    },
    {
      title: 'Bài tập bổ trợ Tiếng Anh lớp 10 Global Success - Unit 1: Family Life',
      description:
        'Tổng hợp từ vựng trọng tâm, chuyên đề thì Hiện tại đơn và Hiện tại tiếp diễn kèm bài tập thực hành có đáp án.',
      originalFilename: 'Bai-tap-Tieng-Anh-10-Unit-1.docx',
      storedFilename: doc6File.filePath,
      fileType: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: doc6File.fileSize,
      filePath: doc6File.filePath,
      subjectId: subBySlug['tieng-anh'],
      gradeId: gradeBySlug['lop-10'],
      categoryId: catBySlug['bai-tap'],
      topic: 'Unit 1 - Family Life',
      author: 'Ban chuyên môn Ngoại ngữ',
      featured: false,
      viewCount: 530,
      downloadCount: 215,
      tagNames: ['Tiếng Anh 10', 'Global Success'],
    },
    {
      title: 'Bảng phân phối chương trình & Số liệu thực hành Vật lý lớp 12',
      description:
        'Tệp Excel gồm hai trang tính: phân phối số tiết các chuyên đề trọng tâm và bảng xử lý sai số thí nghiệm đo gia tốc trọng trường.',
      originalFilename: 'So-lieu-thuc-hanh-Vat-ly-12.xlsx',
      storedFilename: doc7File.filePath,
      fileType: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: doc7File.fileSize,
      filePath: doc7File.filePath,
      subjectId: subBySlug['vat-ly'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['giao-an'],
      topic: 'Thực hành thí nghiệm Vật lý',
      author: 'Tổ Vật lý - Công nghệ',
      featured: false,
      viewCount: 410,
      downloadCount: 168,
      tagNames: ['Excel', 'Vật lý 12', 'Thực hành'],
    },
    {
      title: 'Bài giảng trình chiếu PowerPoint: Công thức Newton - Leibniz (Toán 12)',
      description:
        'Slide bài giảng minh họa trực quan định nghĩa tích phân và ứng dụng tính diện tích hình phẳng dành cho giáo viên giảng dạy trên lớp.',
      originalFilename: 'Bai-giang-Nguyen-ham-Tich-phan.pptx',
      storedFilename: doc8File.filePath,
      fileType: 'pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: doc8File.fileSize,
      filePath: doc8File.filePath,
      subjectId: subBySlug['toan-hoc'],
      gradeId: gradeBySlug['lop-12'],
      categoryId: catBySlug['giao-an'],
      topic: 'Tích phân',
      author: 'ThS. Nguyễn Minh Hoàng',
      featured: false,
      viewCount: 495,
      downloadCount: 194,
      tagNames: ['PowerPoint', 'Toán 12', 'Tích phân'],
    },
  ];

  for (const item of sampleRecords) {
    const fullPath = resolveSafeStoragePath(DOCUMENTS_DIR, item.filePath);
    const preview = await generateDocumentPreview(fullPath, item.fileType);
    const slug = toVietnameseSlug(item.title);

    const [inserted] = await db
      .insert(documents)
      .values({
        title: item.title,
        slug,
        description: item.description,
        originalFilename: item.originalFilename,
        storedFilename: item.storedFilename,
        fileType: item.fileType,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        filePath: item.filePath,
        previewPath: JSON.stringify(preview),
        storageProvider: 'LOCAL',
        storageKey: `originals/${item.filePath}`,
        previewStorageKey: `previews/${slug}-preview.json`,
        subjectId: item.subjectId,
        gradeId: item.gradeId,
        categoryId: item.categoryId,
        topic: item.topic,
        author: item.author,
        status: 'PUBLISHED',
        processingStatus: 'COMPLETED',
        featured: item.featured,
        viewCount: item.viewCount,
        downloadCount: item.downloadCount,
        mathMeta: JSON.stringify(preview.mathMeta),
        createdBy: adminUser?.id ?? null,
      })
      .returning();

    await db.insert(processingJobs).values({
      documentId: inserted.id,
      jobType: 'DOCUMENT_CONVERT',
      status: 'COMPLETED',
      attempts: 1,
      maxAttempts: 3,
      workerId: 'seed-initial-worker',
      mathReport: JSON.stringify(preview.mathMeta),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    for (const tagName of item.tagNames) {
      const tagSlug = toVietnameseSlug(tagName);
      await db
        .insert(tags)
        .values({ name: tagName, slug: tagSlug })
        .onConflictDoNothing();
      const [tagRow] = await db.select().from(tags).where(eq(tags.slug, tagSlug)).limit(1);
      if (tagRow) {
        await db
          .insert(documentTags)
          .values({ documentId: inserted.id, tagId: tagRow.id })
          .onConflictDoNothing();
      }
    }
  }
}

// Allow standalone CLI execution: npx tsx src/db/seed.ts
const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('seed.ts');

if (isCli) {
  import('dotenv/config')
    .then(() => seedDatabase())
    .then(() => {
      console.log('Seed completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
