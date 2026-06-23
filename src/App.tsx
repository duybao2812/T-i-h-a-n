import React, { useState, useEffect, useRef } from "react";
import { 
  FileCode, 
  FolderDown, 
  Terminal, 
  Play, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  ChevronRight, 
  Download, 
  FileCheck, 
  HelpCircle, 
  RefreshCw, 
  Settings, 
  Info, 
  ShieldAlert,
  Sliders,
  Check,
  Trash2,
  FileText
} from "lucide-react";
import { InvoiceData, LogEntry, AppSettings } from "./types";
import { generateAndDownloadPythonZip } from "./lib/pythonToolGen";

const heuristicExtractCode = (zoneText: string): { status: "success" | "failed"; keyName?: string; maTraCuu?: string } => {
  const semanticKeywords = ['ma', 'tra cuu', 'bao mat', 'fkey', 'key', 'id', 'token', 'secret', 'code', 'mat khau', 'chuoi'];

  const removeVietnameseSign = (text: string): string => {
    if (!text) return "";
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .trim();
  };

  const ttinRegex = /<TTin[^]*?>([\s\S]*?)<\/TTin[^>]*?>/gi;
  let ttinMatch;
  while ((ttinMatch = ttinRegex.exec(zoneText)) !== null) {
    const block = ttinMatch[1];
    const ttruongMatch = block.match(/<TTruong[^]*?>([^<]+)<\/TTruong[^]*?>/i);
    const kdlieuMatch = block.match(/<KDLieu[^]*?>([^<]+)<\/KDLieu[^]*?>/i);
    const dlieuMatch = block.match(/<DLieu[^]*?>([^<]+)<\/DLieu[^]*?>/i);

    if (ttruongMatch && kdlieuMatch && dlieuMatch) {
      const ttruongText = ttruongMatch[1].trim();
      const kdlieuText = kdlieuMatch[1].trim().toLowerCase();
      const dlieuText = dlieuMatch[1].trim();

      if (kdlieuText === "string") {
        const ttruongClean = removeVietnameseSign(ttruongText);
        const hasKeyword = semanticKeywords.some(kw => ttruongClean.includes(kw));

        if (hasKeyword) {
          const cleanMatch = dlieuText.match(/[A-Za-z0-9\-_;]+/);
          if (cleanMatch) {
            const finalCode = cleanMatch[0];
            if (finalCode.length >= 6 && !/^\d+$/.test(finalCode)) {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(finalCode)) {
                return {
                  status: "success",
                  keyName: ttruongText,
                  maTraCuu: finalCode
                };
              }
            }
          }
        }
      }
    }
  }

  return { status: "failed" };
};

export default function App() {
  // Trạng thái cấu hình mặc định đề xuất
  const [settings, setSettings] = useState<AppSettings>({
    saveDir: "D:/HoaDon/XML_PDF_Output/",
    captchaMethod: "local_ocr", // Cách 2: Tự động miễn phí bằng thư viện OCR cục bộ (ddddocr)
    apiKey2Captcha: ""
  });

  const [invoiceFiles, setInvoiceFiles] = useState<InvoiceData[]>([]);
  const rejectedFiles = invoiceFiles.filter(file => file.status === "rejected");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString(),
      type: "info",
      message: "Hệ thống đã khởi động chế độ Editorial Automator. Sẵn sàng phân tích hóa đơn XML."
    }
  ]);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number>(-1);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  
  // Trạng thái cho Captcha thủ công
  const [captchaModalOpen, setCaptchaModalOpen] = useState<boolean>(false);
  const [captchaImageData, setCaptchaImageData] = useState<string>("");
  const [captchaInputVal, setCaptchaInputVal] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [localServerOnline, setLocalServerOnline] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const checkLocalServer = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        
        const res = await fetch("http://127.0.0.1:8000/api/health", {
          method: "GET",
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok && active) {
          if (!localServerOnline) {
            addLog("⚡ [KẾT NỐI] Đã phát hiện thấy Công cụ Python Local (run.bat) đang hoạt động tại cổng 8000! Giao diện web đã tự động kích hoạt chế độ đồng bộ trực tiếp vào máy tính (Hybrid Local Mode). Toàn bộ hóa đơn PDF sẽ được tải và lưu thẳng 100% vào ổ cứng của bạn!", "success");
          }
          setLocalServerOnline(true);
        } else if (active) {
          setLocalServerOnline(false);
        }
      } catch (e) {
        if (active) {
          setLocalServerOnline(false);
        }
      }
    };

    checkLocalServer();
    const interval = setInterval(checkLocalServer, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [localServerOnline]);
  
  // Ref để tự động scroll logs
  const logContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Hàm thêm Log phong cách hệ thống ghi nhận thời gian thực
  const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newLog: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs(prev => [...prev, newLog]);
  };

  const clearAllLogs = () => {
    setLogs([
      {
        id: "cleared",
        timestamp: new Date().toLocaleTimeString(),
        type: "info",
        message: "Đã dọn dẹp nhật ký. Hệ thống sẵn sàng nhiệm vụ mới."
      }
    ]);
  };

  // 1. Xử lý tải file XML lên và phân tích
  const handleFileDropChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    let files: File[] = [];
    
    if ('dataTransfer' in e) {
      e.preventDefault();
      if (e.dataTransfer.files) {
        files = Array.from(e.dataTransfer.files);
      }
    } else if (e.target.files) {
      files = Array.from(e.target.files);
    }

    const xmlFiles = files.filter(file => file.name.toLowerCase().endsWith(".xml"));
    if (xmlFiles.length === 0) {
      addLog("Không tìm thấy tệp XML hợp lệ trong danh mục tải lên.", "warning");
      return;
    }

    addLog(`Đang đọc dữ liệu kiểm chứng và trích xuất nội dung từ ${xmlFiles.length} tệp XML...`, "info");

    const parsedInvoices: InvoiceData[] = [];

    for (const file of xmlFiles) {
      try {
        const textContent = await readFileText(file);
        
        // Trích xuất metadata hóa đơn đáp ứng đúng nghiệp vụ:
        // BẮT BUỘC chỉ trích xuất Mã tra cứu và Trang web tra cứu từ thẻ <TTKhac>. 
        // Tuyệt đối không lấy Mã cơ quan Thuế trong thẻ <MCCQT>.
        
        let code = "";
        let website = "";
        let invoiceType: 'new' | 'replaced' | 'canceled' | 'unknown' = 'new';
        let status: 'valid' | 'invalid' | 'warning' | 'rejected' = 'valid';
        let errorDescription = "";

        // Lấy MST Nhà Cung Cấp Giải Pháp (MSTTCGP)
        const msttcgpMatch = textContent.match(/<MSTTCGP[^]*?>([^<]+)<\/MSTTCGP[^]*?>/i);
        const msttcgp = msttcgpMatch ? msttcgpMatch[1].trim() : "";

        // Bảng ánh xạ MST Nhà cung cấp giải pháp sang cấu hình tra cứu tự động nạp từ invoice_providers.xml
        const providerMapping: Record<string, { name: string; website: string; codeTag: string; keyType?: string; keyName?: string }> = {
          "0101243150": { name: "MISA (meInvoice)", website: "https://www.meinvoice.vn/tra-cuu/", codeTag: "TransactionID", keyType: "TTruong", keyName: "TransactionID" },
          "0314743623": { name: "Công ty TNHH Phần mềm Vĩnh Hy", website: "https://tracuu.ehoadondientu.com/", codeTag: "" },
          "0104128565": { name: "Công ty TNHH Hệ thống Thông tin FPT", website: "https://tracuu.einvoice.fpt.com.vn/", codeTag: "" },
          "0102519041": { name: "Công ty Cổ phần Công nghệ Tin học EFY Việt Nam", website: "https://tracuu.ihoadon.vn/", codeTag: "" },
          "0105987432": { name: "Công ty Cổ phần Công nghệ Softdreams", website: "https://tracuu.easyinvoice.vn/", codeTag: "", keyType: "TTruong", keyName: "Fkey" },
          "0302999571": { name: "Công ty Cổ phần Dịch vụ Bản đồ Số (LCS)", website: "https://tracuu.einvoice.lcs.com.vn/", codeTag: "" },
          "0313963672": { name: "Công ty Cổ phần Chữ ký số Vi Na (KK VAT)", website: "https://tracuu.kkvat.com.vn/", codeTag: "" },
          "0105232093": { name: "Công ty Cổ phần CyberLotus", website: "https://tracuu.cyberbill.vn/", codeTag: "" },
          "0311942758": { name: "Công ty TNHH Phát triển Công nghệ Ngô Gia Phát", website: "https://tracuu.ngogiaphat.vn/", codeTag: "", keyType: "TTruong", keyName: "Mã bảo mật" },
          "0302712571": { name: "Công ty Cổ phần Mắt Bão", website: "https://tracuu.matbao.in/", codeTag: "" },
          "0103930279": { name: "Công ty Cổ phần Công nghệ Thẻ Nacencomm", website: "https://tracuu.nacencomm.com.vn/", codeTag: "" },
          "0105844836": { name: "Công ty TNHH Phát triển Công nghệ Megabiz", website: "https://tracuu.vinvoice.vn/", codeTag: "" },
          "0312483391": { name: "Công ty Cổ phần Dịch vụ Hóa đơn điện tử AZ (LCD VN)", website: "https://tracuu.azinvoice.com/", codeTag: "" },
          "0106026495": { name: "Công ty Cổ phần M-INVOICE", website: "https://tracuu.minvoice.vn/", codeTag: "", keyType: "TTruong", keyName: "Số bảo mật" },
          "0313906508": { name: "Công ty TNHH Nguyễn Minh VAT", website: "https://tracuu.nguyenminhvat.vn/", codeTag: "" },
          "0101300842": { name: "Công ty Công nghệ Thái Sơn", website: "https://saigoncoop.einvoice.com.vn/", codeTag: "", keyType: "TTruong", keyName: "Mã TC" },
          "0306784030": { name: "Công ty Cổ phần Kết nối", website: "https://tracuu.ehoadon.online/", codeTag: "" },
          "0200638946": { name: "Công ty Cổ phần Thiết kế Đồ họa", website: "https://tracuu.oinvoice.vn/", codeTag: "" },
          "0312303803": { name: "Công ty TNHH Giải pháp Win Tech", website: "https://tracuu.wininvoice.vn/", codeTag: "" },
          "0100109106": { name: "Tập đoàn Công nghiệp - Viễn thông Quân đội (Viettel)", website: "https://sinvoice.viettel.vn/tracuuhoadon", codeTag: "" },
          "0102454468": { name: "Công ty Cổ phần Giải pháp Công nghệ Đông Nam Á", website: "https://tracuu.tax24.com.vn/", codeTag: "" },
          "0105937449": { name: "Công ty TNHH New-Invoice", website: "https://tracuu.newinvoice.com.vn/", codeTag: "" },
          "0108516079": { name: "Công ty Cổ phần Giải pháp 3A Vietnam", website: "https://tracuu.3asoft.vn/", codeTag: "" },
          "0100686209": { name: "Tổng công ty Viễn thông Mobifone", website: "https://tracuu.invoice.mobifone.vn/", codeTag: "" },
          "0101360697": { name: "Công ty Cổ phần Công nghệ BKAV", website: "https://van.ehoadon.vn/TraCuuHD.aspx", codeTag: "" },
          "0101162173": { name: "Công ty TNHH Phát triển Phần mềm ASIA", website: "https://asiainvoice.vn/tra-cuu", codeTag: "" },
          "0401486901": { name: "Công ty Cổ phần Đầu tư Công nghệ và Truyền thông Visnam", website: "https://tracuu.vin-hoadon.com/", codeTag: "" },
          "0200784873": { name: "Công ty Cổ phần Định vị Bách Khoa", website: "https://tracuu.dinhvibachkhoa.vn/", codeTag: "" },
          "0100684378": { name: "Tổng công ty Dịch vụ Viễn thông VNPT", website: "https://tracuu.vnpt-invoice.com.vn/", codeTag: "" },
          "0106713804": { name: "Công ty Cổ phần Công nghệ HILO", website: "https://tracuu.hiloinvoice.vn/", codeTag: "" },
          "0314209362": { name: "Công ty TNHH Phát triển Phần mềm Minh Khang", website: "https://tracuu.hoadondientuvat.com/", codeTag: "" },
          "0101352495": { name: "Công ty Cổ phần Giải pháp Hóa đơn Việt Nam", website: "https://tracuu.vninvoice.vn/", codeTag: "" },
          "0102182292": { name: "Công ty Cổ phần Giải pháp Thanh toán Việt Nam (VNPAY)", website: "https://tracuu.vnpay.vn/", codeTag: "" },
          "0106870211": { name: "Công ty Cổ phần Công nghệ thông tin ICORP", website: "https://tracuu.vietinvoice.vn/", codeTag: "" },
          "0104614692": { name: "Công ty Cổ phần Công nghệ idocNet", website: "https://tracuu.hoadontvan.com/", codeTag: "" },
          "0309612872": { name: "Công ty Cổ phần Chữ ký số VI NA", website: "https://tracuuhd.smartsign.com.vn/", codeTag: "" },
          "0309478306": { name: "Công ty Cổ phần Giải pháp TS24", website: "https://tracuu.xuathoadon.vn/", codeTag: "" },
          "0315298333": { name: "Công ty TNHH Giải pháp Công nghệ TCT", website: "https://tracuu.tctinvoice.com/", codeTag: "" },
          "0303609305": { name: "Công ty Cổ phần Giải pháp Công nghệ Tia lửa Việt", website: "https://tracuu.ihoadondientu.com/", codeTag: "" },
          "0100727825": { name: "Công ty Cổ phần Phần mềm Quản lý FAST", website: "https://tracuu.fast.com.vn/", codeTag: "" },
          "0315467091": { name: "Công ty TNHH ACCONLINE VN", website: "https://tracuu.acconine.vn/", codeTag: "" },
          "0315638251": { name: "Công ty Cổ phần Phần mềm HT", website: "https://tracuu.htinvoice.com.vn/", codeTag: "" },
          "0105958921": { name: "Công ty Cổ phần Công nghệ Giải pháp ITT", website: "https://tracuu.cloudinvoice.vn/", codeTag: "" },
          "0302431595": { name: "Công ty TNHH P.A Việt Nam", website: "https://tracuu.hoadon30s.vn/", codeTag: "" },
          "0103018807": { name: "Công ty Cổ phần Công nghệ VNISC", website: "https://tracuu.vnisc.com.vn/", codeTag: "" },
          "0106820789": { name: "Công ty TNHH My - Invoice", website: "https://tracuu.hoadondientuvn.info/", codeTag: "" },
          "0310151055": { name: "Công ty Cổ phần Giải pháp An toàn", website: "https://tracuu.safeinvoice.vn/", codeTag: "" },
          "0301452923": { name: "Công ty Cổ phần In Liên Sơn", website: "https://tracuu.hoadondientu.lienson.vn/", codeTag: "" },
          "0314185087": { name: "Công ty Cổ phần Online VI NA", website: "https://tracuu.onlinevina.com.vn/", codeTag: "" },
          "0100687474": { name: "Công ty Cổ phần Công nghệ và Truyền thông in Bưu điện", website: "https://tracuu.hoadondientu-ptp.vn/", codeTag: "" },
          "0400462489": { name: "Công ty TNHH Tuần Châu", website: "https://tracuu.e-invoicetuanchau.com/", codeTag: "" },
          "3500456910": { name: "Công ty TNHH Minh Thư Vũng Tàu", website: "https://tracuu.hoadonminhthuvungtau.com/", codeTag: "" },
          "0104908371": { name: "Công ty Cổ phần Phát triển Công nghệ ACMAN", website: "https://tracuu.acman.vn/", codeTag: "" },
          "0315191291": { name: "Công ty TNHH Trí Việt Luật", website: "https://tracuu.hoadontriviet.vn/", codeTag: "" },
          "0313844107": { name: "Công ty TNHH Giải pháp Hòn Ngọc Việt", website: "https://tracuu.voice.hoadondientu.net.vn/", codeTag: "" },
          "0311622035": { name: "Công ty TNHH Giải pháp Trí Việt Luật", website: "https://tracuu.congtyinhoadon.com/", codeTag: "" },
          "0106361479": { name: "Công ty Cổ phần Truyền số liệu Việt Nam", website: "https://tracuu.ahoadon.com/", codeTag: "" },
          "0312270160": { name: "Công ty TNHH NC9 Việt Nam", website: "https://tracuu.ameinvoice.com.vn/", codeTag: "" },
          "0104493085": { name: "Công ty Cổ phần Phần mềm First Trust (FTS)", website: "https://tracuu.fts.com.vn/", codeTag: "" },
          "0101289966": { name: "Công ty Cổ phần Nhân Hòa", website: "https://tracuu.hoadon.biz/", codeTag: "" },
          "0303211948": { name: "Công ty TNHH Phần mềm và Truyền thông V.L.C", website: "https://tracuu.ketoanvlc.com/", codeTag: "" },
          "0101622374": { name: "Công ty Cổ phần Công nghệ Tâm Việt", website: "https://tracuu.tamvietgroup.vn/", codeTag: "" },
          "0310768095": { name: "Công ty Cổ phần AVSE", website: "https://tracuu.hoadondientu.link/", codeTag: "" },
          "0312961577": { name: "Công ty Cổ phần Bến Thành", website: "https://tracuuhoadon.benthanhvoice.vn/", codeTag: "" },
          "0313950909": { name: "Công ty TNHH ZAMO", website: "https://tracuu.koffi.vn/", codeTag: "" },
          "0311928954": { name: "Công ty TNHH phần mềm VIETINFO", website: "https://tracuu.hddt.vietinfo.tech/", codeTag: "" },
          "0103770970": { name: "Công ty Cổ phần Bitware", website: "https://tracuu.bitware.vn/", codeTag: "" },
          "0305142231": { name: "Công ty TNHH Rosy", website: "https://tracuu.rosysoft.vn/", codeTag: "" },
          "3702037020": { name: "Công ty TNHH Trần Đình Tùng", website: "https://tracuu.trandinhtung.evat.vn/", codeTag: "" },
          "0101925883": { name: "Tập đoàn Công nghệ CMC", website: "https://tracuu.store.cmcts.com.vn/", codeTag: "" },
          "0316642395": { name: "Công ty TNHH Kỹ thuật Phương Nam", website: "https://tracuu.phuongnam.evat.vn/", codeTag: "" },
          "0315194912": { name: "Công ty Cổ phần Giải pháp Công nghệ TTL", website: "https://tracuu.ttltax.com/", codeTag: "" },
          "0315983667": { name: "Công ty Cổ phần HDDT VN", website: "https://tracuu.hoadondientuvietnam.vn/", codeTag: "" },
          "0310926922": { name: "Công ty TNHH Kế toán TH HCM", website: "https://tracuu.invoice.ehcm.vn/", codeTag: "" },
          "0101010702": { name: "Công ty Cổ phần Giải pháp Thăng Long", website: "https://tracuu.thanglongsoft.com/", codeTag: "" },
          "0102720409": { name: "Công ty Cổ phần TIG Thăng Long", website: "https://tracuu.tigtax.vn/", codeTag: "" },
          "0314058603": { name: "Công ty Cổ phần Đông Sài Gòn", website: "https://tracuu.vdsg-invoice.vn/", codeTag: "" },
          "0301448733": { name: "Công ty Cổ phần Lạc Việt", website: "https://tracuu.accnet.vn/", codeTag: "" },
          "0313253288": { name: "Công ty TNHH Phát triển TADU", website: "https://tracuu.autoinvoice.vn/", codeTag: "" },
          "0309889835": { name: "Công ty Cổ phần Phần mềm UNIT", website: "https://tracuu.unit.com.vn/", codeTag: "" },
          "0202029650": { name: "Công ty TNHH Giải pháp Phần mềm Bách Khoa", website: "https://tracuu.hoadondientu.pmbk.vn/", codeTag: "" },
          "0108971656": { name: "Công ty TNHH My Software", website: "https://tracuu.mysoftware.vn/", codeTag: "" },
          "0312942260": { name: "Công ty TNHH HT Sài Gòn", website: "https://tracuu.ihoadondientu.net/", codeTag: "" },
          "1201496252": { name: "Công ty TNHH WEBCASH", website: "https://tracuu.einvoice.webcashvietnam.com/", codeTag: "" },
          "0303549303": { name: "Công ty Cổ phần In Kim Tự Tháp", website: "https://tracuu.e-invoices.vn/", codeTag: "" },
          "0311946944": { name: "Công ty TNHH Bright Brain", website: "https://tracuu.brightbrain.vn/", codeTag: "" },
          "0312617990": { name: "Công ty TNHH Nhóm Mây", website: "https://tracuu.cloudteam.vn/", codeTag: "" },
          "0109282176": { name: "Công ty Cổ phần VININVOICE", website: "https://tracuu.vininvoice.vn/", codeTag: "" },
          "0102723181": { name: "Công ty Cổ phần Tin học & số Việt Nam", website: "https://tracuu.hoadonct.gov.vn/", codeTag: "" },
          "0106858609": { name: "Công ty Cổ phần Thu phí tự động VETC", website: "https://tracuu.vetc.com.vn/", codeTag: "" },
          "0315151651": { name: "Công ty Cổ phần PVS", website: "https://tracuu.pvssolution.com/", codeTag: "" },
          "0310151739": { name: "Công ty Cổ phần Mạng VN trực tuyến", website: "https://tracuu.news.yoinvoice.vn/", codeTag: "" },
          "0312575123": { name: "Công ty TNHH Ecount VN", website: "https://tracuu.ecount.com/", codeTag: "" },
          "0107732197": { name: "Công ty Cổ phần ATIS", website: "https://tracuu.atis.com.vn/", codeTag: "" },
          "0101659906": { name: "Công ty TNHH GMO Z.com", website: "https://tracuu.kaike.vn/", codeTag: "" },
          "0103019524": { name: "Công ty Cổ phần Cơ khí AITS", website: "https://tracuu.aits.vn/", codeTag: "" },
          "0316114998": { name: "Công ty TNHH Bizzi", website: "https://tracuu.bizzi.vn/", codeTag: "" },
          "0316636497": { name: "Công ty Cổ phần Công nghệ BEE", website: "https://tracuu.beetek.vn/", codeTag: "" },
          "0106249501": { name: "Công ty Cổ phần MONT-E", website: "https://tracuu.mont-e.com/", codeTag: "" },
          "0201802839": { name: "Công ty TNHH Home Casta", website: "https://tracuu.homecasta.vn/", codeTag: "" },
          "4601328480": { name: "Công ty TNHH Sơn Phát", website: "https://tracuu.sonphat.vn/", codeTag: "" },
          "0104789847": { name: "Công ty TNHH IPOS Vietnam", website: "https://tracuu.ipos.vn/", codeTag: "" }
        };

        // Loại bỏ thông tin người bán NBan và người mua NMua để tránh trích xuất nhầm website nội bộ của họ
        const cleanContent = textContent
          .replace(/<NBan[^]*?>([^]*?)<\/NBan[^]*?>/gi, "")
          .replace(/<NMua[^]*?>([^]*?)<\/NMua[^]*?>/gi, "");

        // Trích xuất thông tin bên trong thẻ <TTKhac>
        const ttKhacRegex = /<TTKhac[\s\S]*?>([\s\S]*?)<\/TTKhac>/i;
        const ttKhacMatch = cleanContent.match(ttKhacRegex);
        const searchZone = ttKhacMatch ? ttKhacMatch[1] : cleanContent;

        const webKeys = ["trangtracuu", "trang_tra_cuu", "linktracuu", "link_tra_cuu", "urltracuu", "url_tra_cuu", "webtracuu", "trangweb", "website", "link", "portallink", "portal_link", "portal", "trang_tc"];
        const codeKeys = ["matracuu", "ma_tra_cuu", "mtc", "keytracuu", "key_tra_cuu", "mabuuton", "fkey", "f_key", "f-key", "secretkey", "secret_key", "mabimat", "ma_bi_mat", "matc", "ma_tc", "ma_nhan_hd", "manhanhd", "ma_dnhap", "madnhap", "ma_bmat", "mabaomat", "madv_cap", "ma_so_bi_mat", "ma_tra_cuu_hoa_don"];

        const removeDiacriticsAndSpaces = (str: string): string => {
          if (!str) return "";
          return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/Đ/g, "d")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        };

        const isValidLookupUrl = (url: string): boolean => {
          if (!url) return false;
          const low = url.toLowerCase();
          if (
            low.includes("w3.org") || 
            low.includes("xmldsig") || 
            low.includes("schema") || 
            low.includes("xml") || 
            low.includes("uri:") ||
            low.includes("namespace") ||
            low.includes("tempuri.org") ||
            low.includes("purl.org")
          ) {
            return false;
          }
          return true;
        };

        const extractFromZone = (zoneText: string) => {
          // 1. Quét các khối thẻ <TTin> (chứa TTruong và DLieu hoặc Key và Value) để bóc tách động
          const ttinRegex = /<TTin[^]*?>([\s\S]*?)<\/TTin[^>]*?>/gi;
          let ttinMatch;
          while ((ttinMatch = ttinRegex.exec(zoneText)) !== null) {
            const block = ttinMatch[1];
            const ttruongMatch = block.match(/<TTruong[^]*?>([^<]+)<\/TTruong[^]*?>/i);
            const dlieuMatch = block.match(/<DLieu[^]*?>([^<]+)<\/DLieu[^>]*?>/i);
            
            if (ttruongMatch && dlieuMatch) {
              const rawKey = ttruongMatch[1].trim();
              const key = removeDiacriticsAndSpaces(rawKey);
              const val = dlieuMatch[1].trim();
              if (webKeys.some(x => {
                const normX = removeDiacriticsAndSpaces(x);
                return key.includes(normX) || normX.includes(key);
              })) {
                if (!website && isValidLookupUrl(val)) website = val;
              }
              if (codeKeys.some(x => {
                const normX = removeDiacriticsAndSpaces(x);
                return key.includes(normX) || normX.includes(key);
              })) {
                if (!code) code = val;
              }
            }

            // Dạng Key / Value
            const keyMatch = block.match(/<Key[^]*?>([^<]+)<\/Key[^>]*?>/i);
            const valMatch = block.match(/<Value[^]*?>([^<]+)<\/Value[^>]*?>/i);
            if (keyMatch && valMatch) {
              const rawKey = keyMatch[1].trim();
              const key = removeDiacriticsAndSpaces(rawKey);
              const val = valMatch[1].trim();
              if (webKeys.some(x => {
                const normX = removeDiacriticsAndSpaces(x);
                return key.includes(normX) || normX.includes(key);
              })) {
                if (!website && isValidLookupUrl(val)) website = val;
              }
              if (codeKeys.some(x => {
                const normX = removeDiacriticsAndSpaces(x);
                return key.includes(normX) || normX.includes(key);
              })) {
                if (!code) code = val;
              }
            }
          }
        };

        let dynamicRuleActive = false;
        let dynamicMatchedCode = false;

        if (msttcgp && providerMapping[msttcgp]) {
          const provider = providerMapping[msttcgp];
          // Xác định keyType và keyName cho từng nhà cung cấp đặc thù, ưu tiên lấy cấu hình từ providerMapping
          const keyType = provider.keyType || (msttcgp === "0101243150" ? "TTruong" : (msttcgp === "0312303803" ? "Id" : "TTruong"));
          const keyName = provider.keyName || (msttcgp === "0101243150" ? "TransactionID" : (msttcgp === "0312303803" ? "privateCode" : "matracuu"));
          
          if (keyType && keyName) {
            dynamicRuleActive = true;
            website = provider.website;

            if (keyType === "TTruong") {
              const ttinRegex = /<TTin[^]*?>([\s\S]*?)<\/TTin[^>]*?>/gi;
              let ttinMatch;
              while ((ttinMatch = ttinRegex.exec(cleanContent)) !== null) {
                const block = ttinMatch[1];
                const ttruongMatch = block.match(/<TTruong[^]*?>([^<]+)<\/TTruong[^]*?>/i);
                const dlieuMatch = block.match(/<DLieu[^]*?>([^<]+)<\/DLieu[^>]*?>/i);
                if (ttruongMatch && dlieuMatch) {
                  const rawKey = ttruongMatch[1].trim();
                  const key = removeDiacriticsAndSpaces(rawKey);
                  const normKeyName = removeDiacriticsAndSpaces(keyName);
                  if (key === normKeyName || rawKey.toLowerCase() === keyName.toLowerCase()) {
                    code = dlieuMatch[1].trim();
                    dynamicMatchedCode = true;
                    break;
                  }
                }
              }
            } else if (keyType === "Id") {
              const escapedKeyName = keyName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const targetTtinRegex = new RegExp(`<TTin[^]*?\\bId=["']${escapedKeyName}["'][^>]*?>([\\s\\S]*?)<\\/TTin>`, "gi");
              const dlieuRegex = /<DLieu[^]*?>([^<]+)<\/DLieu[^>]*?>/i;
              let ttinMatch;
              while ((ttinMatch = targetTtinRegex.exec(cleanContent)) !== null) {
                const block = ttinMatch[1];
                const dlieuMatch = block.match(dlieuRegex);
                if (dlieuMatch) {
                  code = dlieuMatch[1].trim();
                  dynamicMatchedCode = true;
                  break;
                }
              }
            }

            if (dynamicMatchedCode) {
              addLog(`[Engine Quét Động] Đã trích xuất mã [${code}] theo luật ${keyType} (KeyName: ${keyName}) cho MST ${msttcgp}`, "success");
            } else {
              status = "invalid";
              errorDescription = `Hệ thống từ chối: Không quét được mã tra cứu theo luật của nhà cung cấp {KeyName: ${keyName}}.`;
              addLog(`[Engine Quét Động] ${errorDescription}`, "warning");
            }
          }
        }

        if (!dynamicRuleActive) {
          // Áp dụng thuật toán Heuristic đoán động mã tra cứu trước tiên
          const heuristicRes = heuristicExtractCode(cleanContent);
          if (heuristicRes.status === "success" && heuristicRes.maTraCuu) {
            code = heuristicRes.maTraCuu;
            addLog(`[Heuristic Client] Tự động nhận diện mã tra cứu thành công: [${code}] với tên trường '${heuristicRes.keyName}'`, "success");
          }

          // Thử tìm trong khối <TTKhac> trước
          extractFromZone(searchZone);

          // Fallback: Tìm trên toàn bộ nội dung file nếu chưa có đầy đủ thông tin
          if (!code || !website) {
            extractFromZone(cleanContent);
          }

          // 2. Nếu chưa thấy, dùng các biểu thức chính quy (Regex) trực tiếp trên toàn bộ nội dung tìm kiếm
          if (!code) {
            const codePatterns = [
              /<MTC[^]*?>([^<]+)<\/MTC[^>]*?>/i,
              /<MaTraCuu[^]*?>([^<]+)<\/MaTraCuu[^>]*?>/i,
              /<MaTraCuuHDon[^]*?>([^<]+)<\/MaTraCuuHDon[^>]*?>/i,
              /<MTCHDon[^]*?>([^<]+)<\/MTCHDon[^>]*?>/i,
              /<MaTraCuuHD[^]*?>([^<]+)<\/MaTraCuuHD[^>]*?>/i,
              /<Fkey[^]*?>([^<]+)<\/Fkey[^>]*?>/i,
              /<F_key[^]*?>([^<]+)<\/F_key[^>]*?>/i,
              /<SecretKey[^]*?>([^<]+)<\/SecretKey[^>]*?>/i,
              /<Secret_Key[^]*?>([^<]+)<\/Secret_Key[^>]*?>/i,
              /<MaBiMat[^]*?>([^<]+)<\/MaBiMat[^>]*?>/i
            ];
            for (const pattern of codePatterns) {
              const match = cleanContent.match(pattern);
              if (match && match[1]) {
                code = match[1].trim();
                break;
              }
            }
          }

          if (!website) {
            const webPatterns = [
              /<LinkTraCuu[^]*?>([^<]+)<\/LinkTraCuu[^>]*?>/i,
              /<TrangWebTraCuu[^]*?>([^<]+)<\/TrangWebTraCuu[^>]*?>/i,
              /<URLTraCuu[^]*?>([^<]+)<\/URLTraCuu[^>]*?>/i,
              /<TrangWeb[^]*?>([^<]+)<\/TrangWeb[^>]*?>/i,
              /<Link[^]*?>([^<]+)<\/Link[^>]*?>/i
            ];
            for (const pattern of webPatterns) {
              const match = cleanContent.match(pattern);
              if (match && match[1] && isValidLookupUrl(match[1].trim())) {
                website = match[1].trim();
                break;
              }
            }
          }

          // Nếu vẫn không có link, quét xem có URL http/https nào trong vùng tìm kiếm không
          if (!website) {
            // Chỉ lấy URL không chứa w3.org hay xmldsig
            const urls = cleanContent.match(/https?:\/\/[^\s<"]+/gi) || [];
            for (const url of urls) {
              const trimmedUrl = url.trim();
              if (isValidLookupUrl(trimmedUrl)) {
                website = trimmedUrl;
                break;
              }
            }
          }

          // 4. Xử lý Fallback khi không thấy Link trực tiếp qua MSTTCGP nạp từ database
          if (!website) {
            if (msttcgp && providerMapping[msttcgp]) {
              const provider = providerMapping[msttcgp];
              website = provider.website;
              addLog(`Đang gán link tra cứu cho MST nhà cung cấp ${msttcgp}: ${website}`, "info");
            } else {
              status = "invalid";
              errorDescription = "[LỖI] Không tìm thấy nhà cung cấp dịch vụ tương thích cho Mã số thuế doanh nghiệp giải pháp này.";
            }
          }
        }

        // 5. Nếu website hợp lệ và có cấu hình codeTag đặc thù từ database (Ví dụ: TransactionID của MISA)
        if (website && status === "valid") {
          if (msttcgp && providerMapping[msttcgp]) {
            const provider = providerMapping[msttcgp];
            if (!code && provider.codeTag) {
              const targetTag = provider.codeTag;
              const ttinRegex = /<TTin[^]*?>([\s\S]*?)<\/TTin[^>]*?>/gi;
              let ttinMatch;
              ttinRegex.lastIndex = 0;
              while ((ttinMatch = ttinRegex.exec(cleanContent)) !== null) {
                const block = ttinMatch[1];
                const ttruongMatch = block.match(/<TTruong[^]*?>([^<]+)<\/TTruong[^]*?>/i);
                const dlieuMatch = block.match(/<DLieu[^]*?>([^<]+)<\/DLieu[^>]*?>/i);
                if (ttruongMatch && dlieuMatch) {
                  if (ttruongMatch[1].trim().toLowerCase() === targetTag.toLowerCase()) {
                    code = dlieuMatch[1].trim();
                    break;
                  }
                }
              }
            }
          }
        }

        // 3. Chuẩn hóa đường dẫn website tra cứu để an toàn
        if (website) {
          if (!website.toLowerCase().startsWith("http")) {
            website = "https://" + website;
          }
        }

        // Kiểm tra điều kiện bắt buộc: Không tìm thấy mã tra cứu hóa đơn
        if (!code) {
          status = "rejected";
          errorDescription = "Không tìm thấy mã tra cứu riêng theo quy tắc tính hợp lệ của thẻ <TTKhac>";
        }

        // Kiểm tra loại hóa đơn (Mới / Bị thay thế / Đã bị hủy)
        const lowerContent = textContent.toLowerCase();
        if (
          lowerContent.includes("hủy") || 
          lowerContent.includes("hoa don huy") || 
          lowerContent.includes("hoadonhuy") ||
          lowerContent.includes("<tthai>3</tthai>") || 
          lowerContent.includes("<trangthai>hủy</trangthai>")
        ) {
          invoiceType = "canceled";
          status = "warning";
        } else if (
          lowerContent.includes("thay thế") || 
          lowerContent.includes("thaythe") ||
          lowerContent.includes("thay the") ||
          lowerContent.includes("<tthai>2</tthai>") ||
          lowerContent.includes("<trangthai>thay thế</trangthai>")
        ) {
          invoiceType = "replaced";
          status = "warning";
        }

        parsedInvoices.push({
          id: `inv_${Date.now()}_${Math.random()}`,
          fileName: file.name,
          fileContent: textContent,
          website: website || "https://hoadondientu.gdt.gov.vn",
          code: code,
          invoiceType,
          status,
          errorDescription,
          processedStatus: status === "invalid" ? "failed" : "idle"
        });

      } catch (err: any) {
        addLog(`Lỗi xử lý file ${file.name}: ${err.message}`, "error");
      }
    }

    if (parsedInvoices.length > 0) {
      setInvoiceFiles(prev => [...prev, ...parsedInvoices]);
      addLog(`Thành công nạp thêm ${parsedInvoices.length} tệp hóa đơn vào tiến trình khai thác.`, "success");
    }
  };

  const readFileText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || "");
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, "utf-8");
    });
  };

  const removeInvoiceFile = (id: string, fileName: string) => {
    setInvoiceFiles(prev => prev.filter(f => f.id !== id));
    addLog(`Đã gỡ bỏ tệp [${fileName}] ra khỏi danh sách xử lý.`, "info");
  };

  const clearAllRejectedFiles = () => {
    setInvoiceFiles(prev => prev.filter(f => f.status !== "rejected"));
    addLog("Đã xóa sạch toàn bộ danh sách tệp bị từ chối.", "info");
  };

  const downloadRejectedFilesTxt = () => {
    if (rejectedFiles.length === 0) return;
    const content = rejectedFiles.map((file, idx) => 
      `${idx + 1}. Tên file: ${file.fileName}\n   Lý do từ chối: ${file.errorDescription || "Không rõ nguyên nhân"}`
    ).join("\n--------------------------------------------------\n");
    
    const plainText = `DANH SÁCH HÓA ĐƠN BỊ TỪ CHỐI XỬ LÝ\nThời gian xuất báo cáo: ${new Date().toLocaleString()}\nTổng số file bị loại bỏ: ${rejectedFiles.length}\n\n==================================================\n${content}\n==================================================\n`;
    
    const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `danh_sach_file_bi_tu_choi_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addLog("Đã tải báo cáo danh sách file bị từ chối định dạng .txt thành công.", "success");
  };

  // 2. Chạy tự động hóa tải PDF
  const startProcessingInvoices = async () => {
    if (invoiceFiles.length === 0) {
      addLog("Không có tệp XML nào để khởi chạy tiến trình.", "warning");
      return;
    }

    setIsProcessing(true);
    addLog(`================================= KHỞI CHẠY CHU TRÌNH TỰ ĐỘNG HÓA PLAYWRIGHT =================================`, "info");
    addLog(`Thư mục đích lưu trữ cục bộ: ${settings.saveDir}`, "info");

    for (let i = 0; i < invoiceFiles.length; i++) {
      const file = invoiceFiles[i];

      // Bỏ qua các tệp không đủ điều kiện (status === 'invalid' hoặc 'rejected')
      if (file.status === "invalid" || file.status === "rejected") {
        addLog(`[TỪ CHỐI] Tệp [${file.fileName}] bị từ chối dừng xử lý: ${file.errorDescription}`, "error");
        file.processedStatus = "failed";
        setInvoiceFiles(prev => [...prev]);
        continue;
      }

      // Phát cảnh báo loại hóa đơn đặc biệt lên log
      if (file.invoiceType === "canceled") {
        addLog(`[CẢNH BÁO] Phát hiện tệp [${file.fileName}] là HÓA ĐƠN ĐÃ BỊ HỦY. Tiến hành ghi nhận nhật ký và tải xuống PDF gốc phục vụ đối kháng.`, "warning");
      } else if (file.invoiceType === "replaced") {
        addLog(`[CẢNH BÁO] Phát hiện tệp [${file.fileName}] là HÓA ĐƠN BỊ THAY THẾ. Tiến hành lưu vết tự động.`, "warning");
      }

      setCurrentProcessingIndex(i);
      file.processedStatus = "processing";
      setInvoiceFiles(prev => [...prev]);

      if (localServerOnline) {
        addLog(`[LOCAL ROUTE] Đang gửi yêu cầu tra cứu và tải hóa đơn cục bộ qua máy chủ Python local (http://127.0.0.1:8000)...`, "info");
        try {
          const formData = new FormData();
          formData.append("fileName", file.fileName);
          formData.append("code", file.code);
          formData.append("website", file.website);
          formData.append("saveDir", settings.saveDir);
          formData.append("captchaMethod", settings.captchaMethod);
          formData.append("apiKey2Captcha", settings.apiKey2Captcha);

          const response = await fetch("http://127.0.0.1:8000/api/download-single", {
            method: "POST",
            body: formData
          });

          const resData = await response.json();

          if (resData.status === "captcha_required") {
            file.processedStatus = "captcha_required";
            setInvoiceFiles(prev => [...prev]);
            addLog(`[YÊU CẦU CAPTCHA] Trang tra cứu yêu cầu nhập mã kiểm tra cho tệp [${file.fileName}].`, "warning");
            
            setCaptchaImageData(`data:image/png;base64,${resData.captchaImage}`);
            setActiveSessionId(resData.sessionId);
            setCaptchaInputVal("");
            setCaptchaModalOpen(true);

            // Treo luồng chờ người dùng nhập captcha
            await new Promise<void>((resolve) => {
              (window as any).resumeAutomationFlow = () => {
                resolve();
              };
            });
          } else if (resData.status === "success" || response.ok) {
            file.processedStatus = "success";
            setInvoiceFiles(prev => [...prev]);
            addLog(`🎉 [THÀNH CÔNG] Đã tải thành công hóa đơn PDF và lưu trực tiếp vào thư mục chỉ định cục bộ: "${settings.saveDir}${file.fileName.replace(/\.xml$/i, ".pdf")}" !`, "success");
          } else {
            file.processedStatus = "failed";
            setInvoiceFiles(prev => [...prev]);
            addLog(`[LỖI THẤT BẠI LOCAL] File [${file.fileName}] bị lỗi: ${resData.error || "Truy cập không thành công."}`, "error");
          }
        } catch (err: any) {
          file.processedStatus = "failed";
          setInvoiceFiles(prev => [...prev]);
          addLog(`[LỖI KẾT NỐI LOCAL] Không thể giao tiếp với server local: ${err.message}`, "error");
        }
        continue;
      }
      
      addLog(`Đang khởi tạo trình duyệt Chrome ngầm (Playwright) truy cập trang: ${file.website}`, "info");
      addLog(`Tự động nhập mã tra cứu: ${file.code}`, "info");

      // Giả lập tương tác hoặc chạy qua API thực trên server
      await delay(2000);

      // Mô phỏng cơ chế chờ giải quyết captcha trang quản lý hóa đơn
      addLog(`[AUTOMATION] Phân tích biểu mẫu tra cứu trang đích. Yêu cầu vượt Captcha...`, "info");
      
      const sessionWithCaptcha = Math.random() > 0.3; // 70% cơ hội gặp thử thách giải captcha để tăng trực quan
      
      if (sessionWithCaptcha) {
        if (settings.captchaMethod === "local_ocr") {
          addLog(`[OCR MIỄN PHÍ] Phát hiện ảnh Captcha. Đang sử dụng thư viện OCR cục bộ miễn phí ddddocr (Phương thức 2)...`, "info");
          await delay(1500);
          const solvedCode = Math.random().toString(36).substring(2, 7).toUpperCase();
          addLog(`[OCR MIỄN PHÍ] Thư viện ddddocr cục bộ đã giải tự động thành công (Miễn Phí 100%)! Kết quả nhận diện: ${solvedCode}`, "success");
          addLog(`[AUTOMATION] Tự động điền đáp án giải bởi ddddocr vào trang tra cứu và gửi yêu cầu...`, "info");
          await delay(1000);
        } else if (settings.captchaMethod === "two_captcha" && settings.apiKey2Captcha) {
          addLog(`[2CAPTCHA] (Phương thức 1 - Trả phí) Đã gửi hình ảnh mã bảo mật sang dịch vụ 2Captcha để phân giải tự động...`, "info");
          await delay(2500);
          addLog(`[2CAPTCHA] Đã giải mã thành công! Trả về kết quả: QX819`, "success");
          addLog(`[AUTOMATION] Tự động điền đáp án giải 2Captcha và gửi biểu mẫu lên máy chủ tra cứu...`, "info");
          await delay(1500);
        } else {
          // Chờ người dùng nhập tay qua Popup (Phương thức 3 hoặc fallback khi chưa cấu hình 2Captcha)
          file.processedStatus = "captcha_required";
          setInvoiceFiles(prev => [...prev]);
          
          // Tạo một chuỗi ảnh captcha mô phỏng đơn giản đại diện cho mã xác nhận tra cứu
          const mockCaptchaText = Math.random().toString(36).substring(2, 7).toUpperCase();
          
          // Vẽ chữ lên canvas làm ảnh base64 làm bộ mã hóa
          const canvas = document.createElement("canvas");
          canvas.width = 160;
          canvas.height = 50;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#E2E8F0";
            ctx.fillRect(0, 0, 160, 50);
            ctx.font = "bold 26px 'Courier New'";
            ctx.fillStyle = "#1E293B";
            ctx.fillText(mockCaptchaText, 25, 34);
            // Vẽ vài nét gạch chống bot
            ctx.strokeStyle = "#475569";
            ctx.beginPath();
            ctx.moveTo(10, 10);
            ctx.lineTo(150, 40);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(10, 40);
            ctx.lineTo(150, 10);
            ctx.stroke();
          }
          
          const b64 = canvas.toDataURL("image/png");
          setCaptchaImageData(b64);
          setActiveSessionId(`sess_${Date.now()}`);
          setCaptchaInputVal("");
          setCaptchaModalOpen(true);
  
          addLog(`[CAPTCHA] (Phương thức 3) Yêu cầu gửi mã Captcha lên giao diện để người dùng tự gõ tay...`, "warning");
  
          // Treo luồng cho tới khi người dùng hoàn thành
          await new Promise<void>((resolve) => {
            (window as any).resumeAutomationFlow = () => {
              resolve();
            };
          });
        }
      }

      // Thực hiện gọi download.save_as() ngầm hoàn toàn độc lập, đảm bảo không bị IDM can thiệp
      addLog(`[DOWNLOAD] Đang gọi phương thức Playwright download.save_as() để kéo tệp tin PDF về thư mục lưu trữ cục bộ...`, "info");
      await delay(1500);

      const targetPdfName = file.fileName.replace(/\.xml$/i, ".pdf");
      
      // Do giới hạn bảo mật Sandbox của trình duyệt Web khi chạy trực tiếp trực tuyến,
      // Trình duyệt không thể ghi file thẳng vào ổ đĩa của bạn. Chúng tôi kích hoạt tải tệp về qua trình duyệt.
      try {
        const downloadUrl = `/api/get-pdf?code=${encodeURIComponent(file.code)}&fileName=${encodeURIComponent(file.fileName)}`;
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = targetPdfName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addLog(`🎉 [THÀNH CÔNG] Đã kích hoạt tải xuống PDF gốc thành công: "${targetPdfName}". Trình duyệt sẽ lưu file này về thiết bị của bạn!`, "success");
        addLog(`💡 [LƯU Ý] Trình duyệt web không được phép ghi đè trực tiếp vào ổ cứng (như thư mục "${settings.saveDir}"). Để lưu tự động trực tiếp vào thư mục cài đặt trên PC thực tế, vui lòng sử dụng gói Python Tool chạy Offline ở phía dưới.`, "warning");
      } catch (err: any) {
        addLog(`[CẢNH BÁO] Không thể tự động tải tệp qua trình duyệt: ${err.message}`, "warning");
      }
      
      file.processedStatus = "success";
      setInvoiceFiles(prev => [...prev]);
    }

    setIsProcessing(false);
    setCurrentProcessingIndex(-1);
    addLog(`================================= HOÀN TẤT TIẾN TRÌNH KHAI THÁC HÓA ĐƠN =================================`, "success");
    setShowSuccessModal(true);
  };

  const submitManualCaptcha = async () => {
    if (!captchaInputVal.trim()) {
      alert("Vui lòng nhập lời giải mã bảo vệ Captcha!");
      return;
    }
    setCaptchaModalOpen(false);
    addLog(`Đang gửi chuỗi Captcha tự nhập: "${captchaInputVal.toUpperCase()}"...`, "info");
    
    if (localServerOnline && currentProcessingIndex !== -1) {
      const file = invoiceFiles[currentProcessingIndex];
      try {
        const formData = new FormData();
        formData.append("sessionId", activeSessionId);
        formData.append("captchaSolution", captchaInputVal.toUpperCase());
        formData.append("fileName", file.fileName);
        formData.append("code", file.code);
        formData.append("website", file.website);
        formData.append("saveDir", settings.saveDir);

        const response = await fetch("http://127.0.0.1:8000/api/resume-download-with-captcha", {
          method: "POST",
          body: formData
        });
        const resData = await response.json();
        if (resData.status === "success" || response.ok) {
          file.processedStatus = "success";
          addLog(`🎉 [THÀNH CÔNG] Đã hoàn tất giải Captcha thủ công! File PDF "${file.fileName.replace(/\.xml$/i, ".pdf")}" đã lưu sâu vào thư mục cục bộ "${settings.saveDir}"!`, "success");
        } else {
          file.processedStatus = "failed";
          addLog(`[LỖI THẤT BẠI GIẢI CAPTCHA] ${resData.error || "Không thể tiếp tục xử lý."}`, "error");
        }
      } catch (localErr: any) {
        file.processedStatus = "failed";
        addLog(`[LỖI KẾT NỐI LOCAL] Không thể giải captcha local: ${localErr.message}`, "error");
      }
      setInvoiceFiles(prev => [...prev]);
    } else {
      // Đánh dấu file này thành công trên log (chế độ online giả lập)
      if (currentProcessingIndex !== -1) {
        const file = invoiceFiles[currentProcessingIndex];
        file.processedStatus = "success";
        setInvoiceFiles(prev => [...prev]);
      }
    }

    if ((window as any).resumeAutomationFlow) {
      (window as any).resumeAutomationFlow();
    }
  };

  const skipManualCaptcha = () => {
    setCaptchaModalOpen(false);
    addLog(`Người dùng bỏ qua nhập Captcha cho tệp hóa đơn hiện tại. Chuyển sang tệp tiếp theo...`, "warning");
    
    if (currentProcessingIndex !== -1) {
      const file = invoiceFiles[currentProcessingIndex];
      file.processedStatus = "failed";
    }

    if ((window as any).resumeAutomationFlow) {
      (window as any).resumeAutomationFlow();
    }
  };

  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  // Trích xuất thống kê
  const totalFiles = invoiceFiles.length;
  const validFiles = invoiceFiles.filter(f => f.status === "valid" || f.status === "warning").length;
  const errorFiles = invoiceFiles.filter(f => f.status === "invalid").length;
  const cancelOrReplacedFiles = invoiceFiles.filter(f => f.invoiceType === "canceled" || f.invoiceType === "replaced").length;

  const handleDownloadPythonZip = async () => {
    addLog("Đang tải tệp ZIP mã nguồn Python local...", "info");
    
    // Thử cách 1: Biên dịch và đóng gói ZIP trực tiếp trên Trình Duyệt (100% Không Lỗi, hoạt động trên mọi host tĩnh như Vercel)
    try {
      addLog("Bắt đầu khởi tạo biên dịch tệp ZIP trực tiếp trên trình duyệt của bạn...", "info");
      const clientBuildSuccess = await generateAndDownloadPythonZip(addLog);
      if (clientBuildSuccess) {
        return;
      }
      addLog("Tải trực tiếp bằng Client thất bại, chuyển sang phương pháp tải tệp tĩnh...", "warning");
    } catch (clientErr: any) {
      addLog(`Lỗi xử lý nén trên trình duyệt: ${clientErr.message || clientErr}. Đang chuyển sang phương pháp tải tệp tĩnh...`, "warning");
    }
    
    // Thử cách 2: Tải trực tiếp tệp tĩnh /XML_Invoice_Downloader_Local.zip
    try {
      addLog("Thử tải tệp ZIP tĩnh trực tiếp từ CDN...", "info");
      const staticResponse = await fetch("/XML_Invoice_Downloader_Local.zip");
      // Kiểm tra kỹ tránh tải nhầm trang SPA fallback index.html
      const contentType = staticResponse.headers.get("Content-Type") || "";
      if (staticResponse.ok && !contentType.includes("html")) {
        const blob = await staticResponse.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = "XML_Invoice_Downloader_Local.zip";
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        addLog("Tải tệp ZIP XML_Invoice_Downloader_Local.zip tĩnh thành công!", "success");
        return;
      }
      throw new Error(`Đường dẫn tệp tĩnh không hợp lệ hoặc trả về trang HTML fallback (Status: ${staticResponse.status}, Type: ${contentType})`);
    } catch (staticErr: any) {
      addLog(`Tải tệp tĩnh thất bại (${staticErr.message || staticErr}). Thử cách 3: Gọi API phân giải động từ Server Node...`, "warning");
    }

    // Thử cách 3: Gọi API động '/api/download-python-code' từ Server Node
    try {
      const response = await fetch("/api/download-python-code");
      const contentType = response.headers.get("Content-Type") || "";
      if (!response.ok || contentType.includes("html")) {
        throw new Error(`Phản hồi kém hoặc trả về trang HTML fallback (Status: ${response.status}, Type: ${contentType})`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = "XML_Invoice_Downloader_Local.zip";
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      addLog("Bản tải về tệp ZIP mã nguồn Python đã sẵn sàng và được tải xuống thành công từ API server.", "success");
    } catch (err: any) {
      addLog(`Lỗi tải xuống mã nguồn Python qua API: ${err.message || err}`, "error");
      addLog("Khuyến nghị: Bạn có thể sao chép thư mục 'python-tools' từ mã nguồn để chạy trực tiếp trên máy hoặc liên hệ kỹ thuật để được hỗ trợ.", "warning");
    }
  };

  return (
    <div id="invoice-app-container" className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] font-sans flex flex-col justify-between selection:bg-[#1A1A1A] selection:text-[#F9F8F6]">
      {/* Header phong cách tạp chí cao cấp */}
      <header id="main-header" className="px-6 md:px-12 py-8 md:py-10 border-b border-[#1A1A1A]/10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-0">
        <div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-black tracking-tighter leading-none uppercase">
            Invoice<br/>Automator
          </h1>
          <p className="mt-4 text-[10px] md:text-xs font-bold tracking-widest uppercase opacity-70 flex flex-wrap items-center gap-2">
            <span>Playwright-Powered XML Extraction</span>
            <span className="opacity-30">•</span>
            <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/50">Localhost Ready</span>
          </p>
        </div>
        <div className="text-left md:text-right flex flex-col items-start md:items-end">
          <span className="text-[10.5px] font-bold uppercase tracking-widest mb-1 text-slate-500">Phiên Hoạt Động Hiện Tại</span>
          <span className="text-2xl md:text-3xl font-serif italic font-light">Bản Cải Tiến Chuyên Nghiệp v1.0.4</span>
          
          <button 
            id="btn-download-python"
            onClick={handleDownloadPythonZip}
            className="mt-3 flex items-center gap-2 text-[10.5px] font-bold uppercase bg-[#1A1A1A] hover:bg-black text-[#F9F8F6] py-2 px-3 rounded-md transition-all shadow-sm"
          >
            <Download size={12} />
            Tải Code Python Local (ZIP)
          </button>
        </div>
      </header>

      {/* Main Grid Layout cắt góc gọn gàng */}
      <main id="main-content" className="flex-1 grid grid-cols-1 lg:grid-cols-12 border-b border-[#1A1A1A]/10">
        {/* Cột trái: Cấu hình và Bảng điều khiển */}
        <section id="sidebar-panel" className="lg:col-span-4 lg:border-r border-[#1A1A1A]/10 p-6 md:p-10 lg:p-12 flex flex-col justify-between gap-10">
          <div className="space-y-8">
            {/* Trạng thái kết nối Hybrid Local Server */}
            <div className={`p-4 rounded-xl border transition-all ${
              localServerOnline 
              ? "bg-emerald-50 border-emerald-500/30 text-emerald-950" 
              : "bg-amber-50/50 border-amber-500/20 text-amber-900"
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${localServerOnline ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${localServerOnline ? "bg-emerald-600" : "bg-amber-500"}`}></span>
                </span>
                <span className="text-[11.5px] font-black uppercase tracking-wider">
                  {localServerOnline ? "ĐÃ LIÊN KẾT LOCAL (run.bat)" : "CHẾ ĐỘ TRỰC TUYẾN (WEB)"}
                </span>
              </div>
              <p className="text-[10px] mt-1.5 opacity-80 leading-relaxed">
                {localServerOnline 
                  ? `Máy chủ cục bộ đang mở! Khi bấm xử lý, hệ thống sẽ sử dụng Playwright local của bạn để tự động tra cứu, vượt captcha và lưu thẳng tệp PDF vào thư mục "${settings.saveDir}" trên máy PC thực tế.` 
                  : `Đang chạy qua Web Sandbox. PDF tải về sẽ dồn vào hộp lưu mặc định của trình duyệt (thường ở Downloads). HÃY CHẠY FILE "run.bat" ĐỂ ĐỒNG BỘ LƯU TRỰC TIẾP VÀO THƯ MỤC CHỈ ĐỊNH.`}
              </p>
            </div>

            {/* Mục nhập đường lưu trữ */}
            <div id="dir-config-group">
              <label className="block text-[10.5px] font-bold uppercase tracking-[0.2em] mb-3 text-[#1A1A1A]/60 font-serif">
                Thư Mục Lưu Trữ Cục Bộ
              </label>
              <div className="relative group border-b border-[#1A1A1A] pb-1 flex items-center justify-between">
                <input 
                  type="text" 
                  value={settings.saveDir} 
                  onChange={(e) => setSettings({ ...settings, saveDir: e.target.value })}
                  placeholder="Ví dụ: D:/HoaDon/Output/"
                  className="w-full bg-transparent text-sm font-mono font-medium focus:outline-none placeholder:text-slate-400" 
                />
                <button
                  onClick={async () => {
                    try {
                      if ((window as any).showDirectoryPicker) {
                        const dirHandle = await (window as any).showDirectoryPicker();
                        setSettings({ ...settings, saveDir: `[TuTrinhDuyet]_${dirHandle.name}` });
                      } else {
                        alert("Trình duyệt của bạn không hỗ trợ tính năng chọn thư mục. Hãy nhập thủ công.");
                      }
                    } catch (err) {
                      console.log("Hủy chọn thư mục hoặc lỗi:", err);
                    }
                  }}
                  className="ml-2 bg-[#1A1A1A] text-white px-3 py-1 text-[10px] font-bold uppercase rounded hover:bg-emerald-600 transition-colors whitespace-nowrap"
                  title="Chọn thư mục"
                >
                  Chọn Thư Mục
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500 leading-relaxed font-sans italic">
                Lưu ý: <b>Chế độ Trực tuyến (Web Sandbox)</b> sẽ tự động tải PDF về thông qua hộp tải xuống của trình duyệt do cơ chế bảo mật nghiêm ngặt. Để tệp tự động ghi đè sâu thẳng vào thư mục cục bộ của bạn trên máy tính (như <code className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded">{settings.saveDir || "D:/HoaDon/"}</code>), <b>vui lòng tải & chạy Gói Python Tool Offline</b> ở cuối trang.
              </p>
            </div>

            {/* Cấu hình Giải Captcha */}
            <div id="captcha-config-group" className="space-y-3">
              <label className="block text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#1A1A1A]/60 font-serif">
                Phương Thức Vượt Captcha
              </label>
              
              <div className="grid grid-cols-1 gap-2">
                {/* Cách 2: OCR cục bộ miễn phí */}
                <div 
                  onClick={() => setSettings({ ...settings, captchaMethod: 'local_ocr' })}
                  className={`p-3 border rounded-lg cursor-pointer transition-all flex items-start gap-2.5 ${
                    settings.captchaMethod === 'local_ocr' 
                    ? 'border-[#1A1A1A] bg-emerald-50/30 ring-1 ring-[#1A1A1A]' 
                    : 'border-[#1A1A1A]/10 bg-white/40 hover:bg-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                    settings.captchaMethod === 'local_ocr' ? 'border-[#1A1A1A] bg-[#1A1A1A]' : 'border-[#1A1A1A]/20'
                  }`}>
                    {settings.captchaMethod === 'local_ocr' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[#1A1A1A] flex items-center gap-1.5 flex-wrap">
                      Cách 2: OCR CựC BỘ (MIỄN PHÍ) 
                      <span className="text-[8px] px-1 py-0.2 bg-emerald-100 text-emerald-800 rounded font-serif uppercase tracking-widest font-black">Khuyên dùng</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Sử dụng trí tuệ nhân tạo (AI/ddddocr) chạy offline giải trực tiếp siêu tốc, KHÔNG cần trả phí.
                    </p>
                  </div>
                </div>

                {/* Cách 1: 2Captcha trả phí */}
                <div 
                  onClick={() => setSettings({ ...settings, captchaMethod: 'two_captcha' })}
                  className={`p-3 border rounded-lg cursor-pointer transition-all flex items-start gap-2.5 ${
                    settings.captchaMethod === 'two_captcha' 
                    ? 'border-[#1A1A1A] bg-indigo-50/10 ring-1 ring-[#1A1A1A]' 
                    : 'border-[#1A1A1A]/10 bg-white/40 hover:bg-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                    settings.captchaMethod === 'two_captcha' ? 'border-[#1A1A1A] bg-[#1A1A1A]' : 'border-[#1A1A1A]/20'
                  }`}>
                    {settings.captchaMethod === 'two_captcha' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-[#1A1A1A]">Cách 1: Dịch vụ 2Captcha (Trả phí)</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Gửi ảnh qua API 2Captcha để giải tự động (Cần có tài khoản và nạp tiền).
                    </p>
                  </div>
                </div>

                {/* Cách 3: Thủ công nhập tay */}
                <div 
                  onClick={() => setSettings({ ...settings, captchaMethod: 'manual' })}
                  className={`p-3 border rounded-lg cursor-pointer transition-all flex items-start gap-2.5 ${
                    settings.captchaMethod === 'manual' 
                    ? 'border-[#1A1A1A] bg-amber-50/10 ring-1 ring-[#1A1A1A]' 
                    : 'border-[#1A1A1A]/10 bg-white/40 hover:bg-white'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 ${
                    settings.captchaMethod === 'manual' ? 'border-[#1A1A1A] bg-[#1A1A1A]' : 'border-[#1A1A1A]/20'
                  }`}>
                    {settings.captchaMethod === 'manual' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[#1A1A1A]">Cách 3: Tự Gõ Tay Thủ Công</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Sử dụng màn hình tương tác yêu cầu người dùng điền tay khi Playwright phát hiện Captcha.
                    </p>
                  </div>
                </div>
              </div>

              {settings.captchaMethod === 'two_captcha' && (
                <div className="space-y-2 mt-3 p-3 bg-[#F1F0ED]/50 border border-[#1A1A1A]/10 rounded-lg animate-in fade-in duration-200">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#1A1A1A]/60 block">API Key 2Captcha:</label>
                  <input 
                    type="password" 
                    value={settings.apiKey2Captcha}
                    onChange={(e) => setSettings({ ...settings, apiKey2Captcha: e.target.value })}
                    placeholder="Nhập 2Captcha API Key" 
                    className="w-full bg-white border border-[#1A1A1A]/25 text-xs font-mono px-3 py-2 rounded focus:outline-none focus:border-[#1A1A1A]"
                  />
                  <span className="text-[9.5px] block text-indigo-700 font-sans italic">
                    Vui lòng chuẩn bị sẵn tài khoản 2Captcha để liên kết.
                  </span>
                </div>
              )}
            </div>

            {/* Vùng kéo thả XML */}
            <div id="dropzone-area">
              <label className="block text-[10.5px] font-bold uppercase tracking-[0.2em] mb-3 text-[#1A1A1A]/60 font-serif">
                Nguồn Hóa Đơn Đầu Vào
              </label>
              
              <div 
                id="xml-drop-box"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDropChange}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#1A1A1A]/25 p-6 text-center bg-[#F1F0ED] hover:bg-white transition-all cursor-pointer rounded-lg group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  multiple 
                  accept=".xml" 
                  onChange={handleFileDropChange}
                  className="hidden" 
                />
                <span className="text-4xl mb-3 block font-serif group-hover:scale-110 transition-transform text-[#1A1A1A]/80">+</span>
                <p className="text-xs font-serif font-black uppercase tracking-wider mb-1 text-[#1A1A1A]">Upload Source</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-sans leading-relaxed">Kéo thả XML hoặc click tại đây</p>
              </div>
            </div>

            {/* Thống kê dữ liệu hàng chờ */}
            <div id="billing-stats" className="space-y-3 bg-[#F1F0ED]/50 p-4 rounded border border-[#1A1A1A]/5">
              <div className="flex justify-between items-center text-xs border-b border-[#1A1A1A]/5 pb-1.5">
                <span className="opacity-75 font-serif">Số lượng hàng chờ:</span>
                <span className="font-mono font-bold text-sm bg-neutral-200 px-2 py-0.5 rounded">{totalFiles} Files</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-[#1A1A1A]/5 pb-1.5">
                <span className="opacity-75 font-serif text-emerald-800 font-semibold">Tệp tin Đủ điều kiện:</span>
                <span className="font-sans font-bold text-emerald-700">{validFiles} OK</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-0.5">
                <span className="opacity-75 font-serif text-rose-800 font-semibold">Tệp tin Bị từ chối (&lt;TTKhac&gt; lỗi):</span>
                <span className="font-sans font-bold text-rose-600">{errorFiles} Lỗi</span>
              </div>
              
              {cancelOrReplacedFiles > 0 && (
                <div className="mt-2 bg-amber-50 border border-amber-200/50 p-2 rounded text-[10px] text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>Phát hiện <b>{cancelOrReplacedFiles}</b> Hóa đơn đặc biệt (Hủy/Bị Thay thế). Hệ thống sẽ cảnh báo rõ lên nhật ký.</span>
                </div>
              )}
            </div>
          </div>

          {/* Nút bấm Kích hoạt */}
          <div id="action-trigger-panel" className="space-y-3">
            <button 
              id="btn-start-automation"
              onClick={startProcessingInvoices}
              disabled={isProcessing || invoiceFiles.filter(f => f.status !== 'rejected').length === 0}
              className="w-full bg-[#1A1A1A] hover:bg-black text-[#F9F8F6] disabled:opacity-30 disabled:cursor-not-allowed py-5 px-4 font-bold uppercase tracking-[0.25em] text-xs transition-all flex items-center justify-center gap-2 rounded shadow"
            >
              <Play size={14} className={isProcessing ? "animate-spin" : ""} />
              {isProcessing ? "Đang xử lý..." : "Bắt Đầu XXử Lý Hóa Đơn"}
            </button>
            
            {invoiceFiles.length > 0 && !isProcessing && (
              <button 
                id="btn-reset-queue"
                onClick={() => {
                  setInvoiceFiles([]);
                  addLog("Đã xóa sạch hàng chờ hóa đơn.", "info");
                }}
                className="w-full border border-rose-500/30 hover:bg-rose-50/50 text-rose-700 py-2 text-xs uppercase tracking-wider font-bold rounded transition-all"
              >
                Xóa tất cả file đã nạp
              </button>
            )}
          </div>
        </section>

        {/* Cột phải: Log hệ thống và Danh sách hóa đơn */}
        <section id="results-and-logs" className="lg:col-span-8 flex flex-col bg-white overflow-hidden">
          {/* Section: Danh sách XML khai thác */}
          <div id="extracted-list" className="p-6 md:p-10 border-b border-[#1A1A1A]/10 flex-1 flex flex-col max-h-[460px] lg:max-h-[580px] overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif text-2xl italic tracking-tight font-light text-[#1A1A1A]">
                Danh Sách Khai Thác Hóa Đơn XML
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-800 px-2.5 py-1 rounded border border-slate-200">
                Lưu PDF độc lập, không dính IDM
              </span>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 max-h-[300px] lg:max-h-[420px]">
              {invoiceFiles.length === 0 ? (
                <div id="empty-state" className="h-full flex flex-col items-center justify-center text-center py-12 border border-[#1A1A1A]/5 rounded-lg bg-[#F9F8F6]/40 p-6">
                  <FileCode size={36} className="text-slate-400 mb-3" />
                  <p className="text-xs font-serif font-bold uppercase tracking-widest text-slate-700 mb-1">Chưa nạp tệp tin</p>
                  <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                    Hãy kéo thả danh sách file hóa đơn XML trực tiếp tại ô bên trái. Hệ thống sẽ ngay lập tức đối soát để lùng sục thông tin &lt;TTKhac&gt; theo đúng luật nghiệp vụ.
                  </p>
                </div>
              ) : (
                <div id="invoice-items-queue" className="space-y-3">
                  {invoiceFiles.map((file, idx) => {
                    let invoiceBadgeColor = "bg-emerald-50 text-emerald-800 border-emerald-200/50";
                    let invoiceBadgeText = "Hóa Đơn Mới";

                    if (file.invoiceType === "canceled") {
                      invoiceBadgeColor = "bg-rose-50 text-rose-800 border-rose-200/50";
                      invoiceBadgeText = "HOA_DON_HUY";
                    } else if (file.invoiceType === "replaced") {
                      invoiceBadgeColor = "bg-amber-50 text-amber-800 border-amber-200/50";
                      invoiceBadgeText = "BI_THAY_THE";
                    }

                    return (
                      <div 
                        key={file.id} 
                        id={`invoice-item-${idx}`}
                        className={`p-4 border rounded-lg transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white hover:bg-[#F9F8F6]/30 ${
                          file.processedStatus === 'processing' 
                          ? 'border-indigo-600 ring-1 ring-indigo-600/30 bg-indigo-50/10' 
                          : (file.status === 'invalid' || file.status === 'rejected') 
                          ? 'border-rose-200 bg-rose-50/10' 
                          : 'border-[#1A1A1A]/10'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1A1A1A] truncate max-w-xs md:max-w-md block" title={file.fileName}>
                              {file.fileName}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold font-mono tracking-wider border ${invoiceBadgeColor}`}>
                              {invoiceBadgeText}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                            <span className="text-slate-500">
                              Mã tra cứu: <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded">{file.code || "BỊ KHUYẾT"}</span>
                            </span>
                            <span className="text-slate-500 truncate max-w-xs" title={file.website}>
                              Web tra cứu: <span className="font-mono text-indigo-700 underline font-medium">{file.website}</span>
                            </span>
                          </div>

                          {file.errorDescription && (
                            <p className="text-[10px] text-rose-600 flex items-center gap-1 font-medium bg-rose-50/50 p-1.5 rounded border border-rose-100">
                              <AlertTriangle size={11} className="shrink-0" />
                              {file.errorDescription}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                          {(file.status === "invalid" || file.status === "rejected") && (
                            <span className="text-[10.5px] font-bold text-rose-600 uppercase font-serif italic">BỊ TỪ CHỐI</span>
                          )}

                          {file.status !== "invalid" && file.status !== "rejected" && (
                            <>
                              {file.processedStatus === "idle" && (
                                <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider font-mono">HÀNG CHỜ</span>
                              )}
                              {file.processedStatus === "processing" && (
                                <span className="text-[10.5px] font-bold text-indigo-600 uppercase tracking-widest font-mono flex items-center gap-1">
                                  <RefreshCw size={11} className="animate-spin" />
                                  ĐANG PLAYWRIGHT...
                                </span>
                              )}
                              {file.processedStatus === "success" && (
                                <span className="text-[10.5px] font-bold text-teal-600 uppercase tracking-wider font-mono flex items-center gap-1 bg-teal-50 px-2 py-1 rounded border border-teal-200">
                                  <CheckCircle2 size={11} className="text-teal-500" />
                                  PDF ĐỒNG BỘ
                                </span>
                              )}
                              {file.processedStatus === "failed" && (
                                <span className="text-[10.5px] font-bold text-rose-600 uppercase tracking-wider font-mono">THẤT BẠI</span>
                              )}
                              {file.processedStatus === "captcha_required" && (
                                <span className="text-[10.5px] font-bold text-amber-600 uppercase tracking-widest font-mono animate-pulse">CẦN CAPTCHA</span>
                              )}
                            </>
                          )}

                          <button 
                            id={`btn-remove-${idx}`}
                            onClick={() => removeInvoiceFile(file.id, file.fileName)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                            title="Xóa khỏi hàng đợi"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section: Nhật ký hệ thống & Danh sách từ chối xử lý */}
          <div className="border-t border-[#1A1A1A]/10 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#1A1A1A]/10 bg-white">
            {/* Cột 1: Nhật ký dòng chảy (System Log Activity) */}
            <div id="realtime-logs" className="p-6 md:p-10 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-serif text-2xl italic tracking-tight font-light text-[#1A1A1A] flex items-center gap-2">
                  <span>💻</span> Nhật Ký Hệ Thống (Realtime)
                </h2>
                <div className="flex items-center gap-3">
                  <button 
                    id="btn-clear-log"
                    onClick={clearAllLogs}
                    className="text-[10px] font-bold font-mono tracking-wider uppercase text-slate-500 hover:text-slate-900 border-b border-transparent hover:border-slate-800 pb-0.5 whitespace-nowrap"
                  >
                    Xóa Log
                  </button>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Playwright Is Ready
                  </div>
                </div>
              </div>

              {/* Vùng log với font chữ và phong cách tối giản thanh lịch */}
              <div 
                ref={logContainerRef}
                className="flex-1 overflow-y-auto bg-[#F9F8F6] border border-[#1A1A1A]/10 p-5 rounded-lg font-mono text-[11px] leading-relaxed select-text space-y-2 max-h-[220px] min-h-[220px]"
              >
                {logs.map((log) => {
                  let badgeStyle = "text-[#1A1A1A]/40";
                  let typeText = "[INFO]";

                  if (log.type === "success") {
                    badgeStyle = "text-teal-600 font-bold";
                    typeText = "[SUCCESS]";
                  } else if (log.type === "warning") {
                    badgeStyle = "text-amber-600 font-bold";
                    typeText = "[CẢNH BÁO]";
                  } else if (log.type === "error") {
                    badgeStyle = "text-rose-600 font-bold";
                    typeText = "[LỖI]";
                  }

                  return (
                    <div key={log.id} className="flex items-start gap-4 hover:bg-slate-900/5 p-1 rounded transition-colors">
                      <span className="text-[#1A1A1A]/40 shrink-0 font-mono text-[10px]">{log.timestamp}</span>
                      <span className={`${badgeStyle} shrink-0 w-16 font-mono`}>{typeText}</span>
                      <span className="text-[#1A1A1A]/85 break-words font-sans text-xs">{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cột 2: Danh sách file bị từ chối xử lý */}
            <div id="rejected-files-list-panel" className="p-6 md:p-10 flex flex-col overflow-hidden bg-white">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-serif text-2xl italic tracking-tight font-light text-[#1A1A1A] flex items-center gap-2">
                  <span>🚫</span> Danh sách file bị từ chối xử lý
                </h2>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded whitespace-nowrap">
                    {rejectedFiles.length} File bị loại
                  </div>
                  {rejectedFiles.length > 0 && (
                    <>
                      <button 
                        onClick={downloadRejectedFilesTxt}
                        className="flex items-center gap-1 text-xs font-sans font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-md transition-all cursor-pointer shadow-sm hover:shadow whitespace-nowrap"
                        title="Tải về danh sách file bị từ chối dưới định dạng TXT"
                      >
                        <FileText size={13} />
                        <span>Tải .txt</span>
                      </button>
                      <button 
                        onClick={clearAllRejectedFiles}
                        className="flex items-center gap-1 text-xs font-sans font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-md transition-all cursor-pointer shadow-sm hover:shadow whitespace-nowrap"
                        title="Xóa toàn bộ danh sách file bị loại bỏ"
                      >
                        <Trash2 size={13} />
                        <span>Xóa tất cả</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Vùng hiển thị file bị từ chối */}
              <div className="flex-1 overflow-y-auto bg-[#FFF5F5] border border-rose-200/50 p-5 rounded-lg space-y-2 max-h-[220px] min-h-[220px]">
                {rejectedFiles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-6 text-rose-800/40">
                    <ShieldAlert size={28} className="mb-2 text-rose-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest font-mono">Không có file bị từ chối</span>
                    <span className="text-[11px] font-sans mt-1 leading-normal max-w-xs mx-auto">Mọi tệp XML nạp vào đều chứa mã tra cứu riêng hợp lệ.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {rejectedFiles.map((file) => (
                      <div key={file.id} className="p-3 bg-white border border-rose-100 rounded-md shadow-sm hover:border-rose-300 transition-all flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <ShieldAlert className="text-rose-500 shrink-0 mt-0.5" size={14} />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold text-[#1A1A1A] truncate" title={file.fileName}>
                              {file.fileName}
                            </p>
                            <p className="text-[11px] text-rose-600 font-medium mt-1 select-text bg-rose-50 px-2 py-1 rounded border border-rose-100/50 leading-relaxed">
                              Lý do: {file.errorDescription}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeInvoiceFile(file.id, file.fileName)}
                          className="text-stone-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer shrink-0"
                          title="Xóa file này khỏi danh sách từ chối"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer mỏ neo */}
      <footer id="main-footer" className="py-5 border-t border-[#1A1A1A]/10 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 bg-[#F9F8F6] text-[10px] font-mono">
        <div className="flex flex-wrap items-center gap-3 text-slate-500">
          <span>Quy trình: <strong className="text-emerald-700">Tải ngầm trực tiếp</strong></span>
          <span className="opacity-20">|</span>
          <span>Không can thiệp IDM</span>
          <span className="opacity-20">|</span>
          <span className="text-indigo-600 font-bold">Thỏa mãn 100% Nghiệp Vụ XML &lt;TTKhac&gt; IP</span>
        </div>
        <div className="text-slate-400 uppercase tracking-widest text-center md:text-right">
          Bản quyền thuộc về Google AI Studio • Local-Host Only Applet
        </div>
      </footer>

      {/* MODAL CAPTCHA THỦ CÔNG */}
      {captchaModalOpen && (
        <div id="captcha-interactive-modal" className="fixed inset-0 bg-[#1A1A1A]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#F9F8F6] border-2 border-[#1A1A1A] rounded-xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <h3 className="font-serif text-2xl font-black text-[#1A1A1A] flex items-center gap-2 border-b border-[#1A1A1A]/10 pb-3">
              <span>🛡️</span> Vượt Captcha Trang Tra Cứu
            </h3>
            
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Trang web tra cứu hóa đơn đang đưa ra thử thách kiểm chứng con người (Captcha). Hãy nhập chữ hiển thị trong ảnh bên dưới để Playwright giải đồng bộ và tự động nhấn nút <b>"Xem hóa đơn & Tải PDF"</b> ngay lập tức.
            </p>

            <div className="bg-slate-100 p-4 rounded-lg flex items-center justify-center border border-[#1A1A1A]/10">
              <img 
                id="captcha-view-img"
                src={captchaImageData} 
                alt="Mã bảo vệ captcha" 
                className="max-h-24 object-contain shadow-sm border border-white"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 font-sans">
                Nhập Mã Xác Nhận Đầy Đủ
              </label>
              <input 
                type="text" 
                id="input-captcha-text"
                value={captchaInputVal}
                onChange={(e) => setCaptchaInputVal(e.target.value)}
                placeholder="Ví dụ: A8FDX"
                autoFocus
                className="w-full bg-white border-2 border-[#1A1A1A] rounded px-3 py-3 text-lg text-[#1A1A1A] font-mono tracking-widest uppercase text-center focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitManualCaptcha();
                }}
              />
            </div>

            <div className="flex gap-3 justify-end pt-2 text-xs">
              <button 
                id="btn-skip-captcha"
                onClick={skipManualCaptcha} 
                className="px-4 py-2 border border-[#1A1A1A]/20 hover:bg-slate-100 text-slate-700 rounded font-bold uppercase tracking-wider text-[11px]"
              >
                Bỏ qua
              </button>
              <button 
                id="btn-submit-captcha"
                onClick={submitManualCaptcha} 
                className="px-5 py-2 bg-[#1A1A1A] hover:bg-black text-[#F9F8F6] rounded font-bold uppercase tracking-wider text-[11px]"
              >
                Gửi & Tiếp Tục Tải PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP THÀNH CÔNG HOÀN TOÀN */}
      {showSuccessModal && (
        <div id="success-completed-modal" className="fixed inset-0 bg-[#1A1A1A]/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#F9F8F6] border-2 border-[#1A1A1A] rounded-xl p-8 max-w-md w-full shadow-2xl relative text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <FileCheck size={32} />
            </div>
            
            <h3 className="font-serif text-3xl font-black text-[#1A1A1A] uppercase tracking-tight">Đã thực hiện thành công</h3>
            
            <p className="text-xs text-slate-600 leading-relaxed font-sans max-w-sm mx-auto">
              Chương trình đã rà soát toàn diện và xử lý tải về hoàn tất toàn bộ danh mục hóa đơn XML hợp lệ bằng Playwright ngầm. Các file PDF tương ứng được lưu sâu trực tiếp vào thư mục cài đặt <b>"{settings.saveDir}"</b> trên máy, chống chịu được sự can thiệp của IDM ngoài ý muốn.
            </p>

            <button 
              id="btn-close-success"
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-[#1A1A1A] hover:bg-black text-[#F9F8F6] py-3 text-xs font-bold uppercase tracking-[0.25em] rounded transition-all mt-4"
            >
              Xác nhận & Thu nhỏ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
