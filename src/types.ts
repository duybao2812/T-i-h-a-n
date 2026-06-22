export interface InvoiceData {
  id: string;
  fileName: string;
  fileContent: string;
  website: string;
  code: string; // Mã tra cứu trích xuất từ thẻ <TTKhac>
  invoiceType: 'new' | 'replaced' | 'canceled' | 'unknown';
  status: 'valid' | 'invalid' | 'warning';
  errorDescription?: string;
  processedStatus: 'idle' | 'processing' | 'success' | 'failed' | 'captcha_required';
  pdfUrl?: string; // URL để tải file PDF sau khi lấy thành công
  captchaImage?: string; // Base64 hoặc URL ảnh Captcha nếu cần gõ tay
  captchaId?: string; // ID định danh phiên yêu cầu giải captcha
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface AppSettings {
  saveDir: string;
  captchaMethod: 'local_ocr' | 'two_captcha' | 'manual';
  apiKey2Captcha: string;
}
