# Hướng Dẫn Sử Dụng Trình Tải Hóa Đơn PDF Tự Động (Localhost)

## Giới thiệu
Công cụ tự động hóa đọc XML hóa đơn, kiểm soát trạng thái, giải captcha tay hoặc tự động (qua 2Captcha) và tự động tải file PDF tương ứng từ trang web của nhà cung cấp sử dụng **FastAPI** và **Playwright Python**.
Không bị can thiệp bởi Internet Download Manager (IDM).

## Các bước cài đặt nhanh trên Máy tính (Windows / macOS / Linux)

### Bước 1: Hãy chắc chắn máy của bạn đã cài đặt Python.
Nếu chưa cài, hãy tải Python v3.10 trở lên và tick chọn "Add Python to PATH" lúc cài đặt.

### Bước 2: Tự động chạy và cài đặt
- Trên **Windows**: Click đúp chuột vào file \`run.bat\` để hệ thống tự động tải tất cả các thư viện và mở ứng dụng.
- Trên **macOS / Linux**: Mở Terminal trong thư mục này và gõ:
  \`\`\`bash
  pip install -r requirements.txt
  playwright install chromium
  python app.py
  \`\`\`

### Bước 3: Đọc hóa đơn
Mở trình duyệt web của bạn và đăng nhập vào đường link: \`http://localhost:8000\` để bắt đầu chạy hóa đơn.
