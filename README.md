# EduLibrary Cloud — Thư viện học liệu trực tuyến

Hệ thống thư viện học liệu trực tuyến **EduLibrary Cloud** phục vụ giáo viên và học sinh tra cứu, đọc trực tiếp và tải xuống đề thi, đề kiểm tra, giáo án, chuyên đề và bài tập (PDF, Word DOCX/DOC, PowerPoint PPTX/PPT, Excel XLSX/XLS) với hỗ trợ hiển thị công thức Toán – Lý – Hóa (OMML $\rightarrow$ LaTeX/KaTeX & MathType OLE verification).

---

## 1. Sơ đồ kiến trúc hệ thống (Modular Cloud Architecture)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER (React 19 SPA)                        │
│  Home / Search / Document Detail (PDF.js, WordMath KaTeX, Slides, Sheets)   │
│  User Account (Google OAuth + Favorites)   │   Admin Dashboard (RBAC + Jobs) │
└───────────────────────────┬──────────────────────────────────────────────────┘
                            │ HTTPS / REST API + Cookie/JWT + CSRF Origin Check
                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│               BACKEND API GATEWAY (Express + TypeScript + Zod)              │
│  • Auth & RBAC Middleware (JWT + Session Revocation in `sessions` table)     │
│  • Sliding-Window Rate Limiter & XSS Sanitizer & Security Headers            │
│  • SEO Routes: `/robots.txt`, dynamic `/sitemap.xml`                         │
│  • Public API (`/api/*`) & Admin API (`/api/admin/*`)                        │
└──────┬───────────────────────────┬──────────────────────────┬────────────────┘
       │                           │                          │
       ▼                           ▼                          ▼
┌───────────────────┐   ┌───────────────────────┐   ┌──────────────────────────┐
│  PostgreSQL DB    │   │  Object Storage S3/R2 │   │ Async Processing Queue   │
│ (Drizzle ORM)     │   │  • originals/         │   │ (`processing_jobs` table)│
│ • 16 bảng quan hệ │   │  • previews/          │   │  PENDING → PROCESSING    │
│ • Status & Audit  │   │  • thumbnails/        │   │  → COMPLETED / FAILED    │
└───────────────────┘   │  • temp/              │   └─────────────┬────────────┘
                        │  (+ Local Fallback)   │                 │
                        └───────────────────────┘                 ▼
                                                   ┌───────────────────────────┐
                                                   │ Document Processing Worker│
                                                   │ 1. Docker LibreOffice     │
                                                   │    Headless (`worker/`)   │
                                                   │    khi cấu hình WORKER_URL│
                                                   │ 2. In-Process OOXML/OMML  │
                                                   │    + MathType Verifier    │
                                                   └───────────────────────────┘
```

---

## 2. Sơ đồ Database ERD (16 bảng PostgreSQL)

```
[users] 1──* [accounts]          (Google OAuth / Credentials mapping)
[users] 1──* [sessions]          (JWT session tracking + revocation `revoked_at`)
[users] 1──* [audit_logs]        (Nhật ký thao tác Admin)

[subjects]   1──* [documents]    (Môn học: Toán, Lý, Hóa, Văn, Anh...)
[grades]     1──* [documents]    (Khối lớp: Lớp 1 → Lớp 12)
[categories] 1──* [documents]    (Loại: Đề thi, Giáo án, Chuyên đề, Bài tập...)

[documents] 1──* [processing_jobs] (Hàng đợi chuyển đổi & báo cáo kiểm chứng toán học)
[documents] *──* [tags] via [document_tags]
[documents] 1──* [favorites]  *──1 [users]
[documents] 1──* [comments]   *──1 [users]
[documents] 1──* [view_logs]  *──1 [users]
[documents] 1──* [download_logs] *──1 [users]

[site_settings]                    (Cấu hình tiêu đề, banner, thông tin liên hệ)
```

---

## 3. Cấu trúc thư mục dự án

```text
.
├── server.ts                       # Express server entry (REST API, SEO routes, Worker callback, Vite/Static)
├── worker/
│   ├── Dockerfile                  # Docker image Ubuntu/Node + LibreOffice Headless (`soffice`)
│   ├── package.json                # Dependencies cho Worker container độc lập
│   └── server.ts                   # HTTP worker nhận file -> convert PDF bằng LibreOffice -> callback
├── docker-compose.yml              # Triển khai đồng thời App + Postgres + LibreOffice Worker
├── .github/workflows/ci.yml        # CI pipeline: npm ci, tsc --noEmit, node:test, vite build
├── src/
│   ├── db/
│   │   ├── schema.ts               # Drizzle PostgreSQL schema (16 bảng + indexes + relations)
│   │   ├── index.ts                # Lazy PostgreSQL Pool & Drizzle client
│   │   ├── documents.ts            # Truy vấn tài liệu (lọc chặt PUBLISHED + COMPLETED cho public)
│   │   └── seed.ts                 # Khởi tạo dữ liệu nền (bỏ qua sample docs khi NODE_ENV=production)
│   ├── lib/
│   │   ├── storage.ts              # Modular S3/Cloudflare R2 + Presigned URLs + Local fallback + Magic bytes
│   │   ├── docProcessor.ts         # Trình phân tích DOCX (OMML/MathType OLE/WMF), PPTX, XLSX, legacy .doc
│   │   ├── ommlToLatex.ts          # Bộ chuyển đổi OMML XML -> LaTeX chuẩn KaTeX
│   │   ├── processingQueue.ts      # Hàng đợi xử lý bất đồng bộ (`processing_jobs`) + gọi WORKER_URL
│   │   └── slug.ts                 # Chuẩn hóa slug & tên file an toàn tiếng Việt
│   ├── middleware/
│   │   ├── auth.ts                 # JWT + kiểm tra phiên hiệu lực trong bảng `sessions` + requireAdmin
│   │   └── security.ts             # Zod schemas, SlidingWindowLimiter, XSS stripUnsafeHtml, CSRF check
│   ├── routes/
│   │   ├── publicApi.ts            # Public API, Google Auth sync, Comments, Profile, Presigned Download
│   │   └── adminApi.ts             # Admin Upload (PENDING -> Queue), Retry, Soft Delete, Storage Status
│   ├── components/
│   │   └── viewers/                # PdfViewer (PDF.js), WordMathViewer (KaTeX), PptxSlideViewer, ExcelViewer
│   └── pages/
│       ├── HomePage.tsx            # Trang chủ 2 cột chuẩn thư viện học liệu
│       ├── DocumentDetailPage.tsx  # Trang đọc tài liệu + SEO JSON-LD (`DigitalDocument`) + bình luận
│       └── admin/                  # AdminDocumentsTab, AdminJobsTab, Taxonomy, Users, Settings...
└── .env.example                    # Danh sách biến môi trường mẫu (không chứa secret thật)
```

---

## 4. Biến môi trường & Hướng dẫn cấu hình dịch vụ Cloud

Sao chép `.env.example` thành `.env` khi triển khai:

| Nhóm | Biến môi trường | Mục đích |
| :--- | :--- | :--- |
| **PostgreSQL** | `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME` | Kết nối PostgreSQL (Cloud SQL hoặc Supabase Postgres) |
| **Bảo mật & Auth** | `JWT_SECRET`, `APP_URL` | Ký JWT quản trị, xác thực CSRF Origin, tạo `sitemap.xml` |
| **Seed quản trị** | `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `RUN_SAMPLE_SEED` | Tài khoản Admin khởi tạo; đặt `RUN_SAMPLE_SEED=false` ở production |
| **Cloudflare R2** | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Lưu trữ S3-compatible + Presigned URLs (để trống sẽ tự chạy Local Modular Storage) |
| **Docker Worker** | `WORKER_URL`, `WORKER_SHARED_SECRET` | Địa chỉ dịch vụ LibreOffice Headless (`worker/Dockerfile`) & mã bí mật callback |
| **Giới hạn Upload** | `STORAGE_DIR`, `MAX_UPLOAD_MB` | Thư mục đệm/fallback cục bộ và dung lượng tối đa (mặc định `25` MB) |

---

## 5. Quy trình xử lý & Kiểm chứng tài liệu

1. **Upload & Kiểm tra**: Admin tải lên tệp -> Backend kiểm tra MIME, chữ ký nhị phân (magic bytes), kích thước -> lưu vào prefix `originals/`.
2. **Tạo bản ghi & Hàng đợi**: Bản ghi `documents` khởi tạo với `processingStatus = 'PENDING'` và chưa xuất hiện trên các trang công khai cho đến khi xử lý xong (`COMPLETED`) và ở trạng thái `PUBLISHED`.
3. **Xử lý bất đồng bộ**:
   - Nếu cấu hình `WORKER_URL`, Worker Docker LibreOffice chuyển đổi DOCX/DOC/PPTX/PPT sang PDF Preview (`previews/`).
   - Trình phân tích nội bộ đồng thời trích xuất OMML $\rightarrow$ LaTeX/KaTeX, đếm công thức **trước/sau** (`preCheckTotal` vs `postCheckPreserved`), phát hiện đối tượng **MathType OLE / `.wmf` / `.emf`** và gắn cảnh báo minh bạch kèm nút tải file gốc.
4. **Bảo vệ trạng thái**: Không thể chuyển tài liệu sang `PUBLISHED` (`409 Conflict`) nếu `processingStatus !== 'COMPLETED'`.

---

## 6. Lệnh phát triển, Build & Kiểm thử

```bash
# 1. Cài đặt phụ thuộc
npm install

# 2. Chạy ứng dụng phát triển (port 3000)
npm run dev

# 3. Kiểm tra kiểu TypeScript & Build Production
npm run lint
npm run build

# 4. Chạy Unit Tests (Document Processor, OMML, Security, Magic Bytes, Rate Limiter)
npx --yes tsx --test src/lib/*.test.ts src/middleware/*.test.ts

# 5. Chạy toàn bộ stack bằng Docker Compose (tùy chọn môi trường ngoài)
docker compose up --build
```

> **Ghi chú môi trường runtime**: Trong workspace AI Studio hiện tại, hệ thống chạy trên Node.js + Express (`server.ts`) + React 19 (Vite) + Cloud SQL PostgreSQL (Drizzle ORM). Dịch vụ LibreOffice Headless (`soffice`) không cài đặt sẵn trong container chính nên được đóng gói tách biệt tại `worker/Dockerfile` để triển khai lên Cloud Run / Fly.io / Railway hoặc chạy qua `docker compose`.
