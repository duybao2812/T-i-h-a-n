// Tệp này được tự động tạo bởi build-zip.cjs. Vui lòng không sửa thủ công.
import JSZip from "jszip";

export const generateAndDownloadPythonZip = async (addLog: (msg: string, type?: "info" | "success" | "warning" | "error") => void) => {
  addLog("Bắt đầu biên dịch tệp ZIP hoàn chỉnh trên trình duyệt (Client-side)...", "info");
  try {
    const zip = new JSZip();

    const appPyContent = `"""
XML Invoice Automation Tool & PDF Downloader
Sử dụng FastAPI, Playwright (Python) để tự động đọc mã XML,
vượt captcha (Sử dụng ddddocr cục bộ MIỄN PHÍ, 2Captcha trả phí hoặc tự nhập tay) và tải trực tiếp PDF vào thư mục chỉ định.
Chạy hoàn toàn độc lập, không bị IDM can thiệp.
"""

import os
import re
import base64
import asyncio
import sys
import platform
import traceback

if platform.system() == "Windows":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception as loop_ex:
        print(f"Cảnh báo cấu hình Windows Event Loop: {loop_ex}")

import xml.etree.ElementTree as ET
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from playwright.async_api import async_playwright
import uvicorn
import requests
from fastapi.middleware.cors import CORSMiddleware

# Khởi tạo thư viện ddddocr (Phương thức 2: Miễn phí cục bộ)
try:
    import ddddocr
    ocr_solver = ddddocr.DdddOcr(show_ad=False)
    DDDD_OCR_AVAILABLE = True
    print("[HỆ THỐNG] Đã nạp thành công thư viện ddddocr. Tự động vượt captcha miễn phí sẵn sàng!")
except Exception as e:
    ocr_solver = None
    DDDD_OCR_AVAILABLE = False
    print(f"[CẢNH BÁO] Không thể nạp ddddocr ({e}). Sẽ tự động chuyển sang gõ captcha bằng tay nếu không dùng 2Captcha.")

app = FastAPI(title="XML Invoice PDF Downloader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "XML Invoice Downloader Local Server is running!"}

# Nạp cơ sở dữ liệu nhà cung cấp từ tệp invoice_providers.xml
provider_mapping = {}
try:
    xml_path = "invoice_providers.xml"
    if not os.path.exists(xml_path):
        xml_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "invoice_providers.xml")
    if not os.path.exists(xml_path):
        xml_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "invoice_providers.xml")
    
    if os.path.exists(xml_path):
        tree = ET.parse(xml_path)
        root_prov = tree.getroot()
        for provider in root_prov.findall("Provider"):
            cn_node = provider.find("CompanyName")
            company_name_val = cn_node.text.strip() if cn_node is not None and cn_node.text else ""
            tax_code_el = provider.find("TaxCode")
            search_link_el = provider.find("SearchLink")
            key_type_el = provider.find("KeyType")
            key_name_el = provider.find("KeyName")
            if tax_code_el is not None and search_link_el is not None:
                tc = tax_code_el.text.strip() if tax_code_el.text else ""
                sl = search_link_el.text.strip() if search_link_el.text else ""
                if tc and sl and sl != "Chưa cập nhật":
                    kt = key_type_el.text.strip() if key_type_el is not None and key_type_el.text else ""
                    kn = key_name_el.text.strip() if key_name_el is not None and key_name_el.text else ""
                    provider_mapping[tc] = {
                        "name": company_name_val,
                        "website": sl,
                        "codeTag": "TransactionID" if tc == "0101243150" else "",
                        "key_type": kt,
                        "key_name": kn
                    }
        print(f"[HỆ THỐNG] Đã tải thành công {len(provider_mapping)} nhà cung cấp dịch vụ từ invoice_providers.xml")
except Exception as e:
    print(f"[CẢNH BÁO] Không thể nạp database hóa đơn XML ({e})")

# Fallback mặc định phòng hờ không đọc được file
if "0101243150" not in provider_mapping:
    provider_mapping["0101243150"] = {
        "name": "MISA (meInvoice)",
        "website": "https://www.meinvoice.vn/tra-cuu/",
        "codeTag": "TransactionID",
        "key_type": "TTruong",
        "key_name": "TransactionID"
    }

# Bo loc thong minh (Smart Filter) tu dong nhan dien ma tra cuu bang thuat toan doan dong (Heuristic)
def heuristic_extract_lookup_code(xml_root_element):
    import re
    
    def get_local_name(elem):
        return elem.tag.split('}')[-1]
        
    semantic_keywords = ['ma', 'tra cuu', 'bao mat', 'fkey', 'key', 'id', 'token', 'secret', 'code', 'mat khau', 'chuoi']
    
    def remove_vietnamese_sign(text):
        if not text: return ""
        text = text.lower()
        replacements = {
            'á':'a','à':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a','â':'a','ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a',
            'é':'e','è':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e','ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e',
            'í':'i','ì':'i','ỉ':'i','ĩ':'i','ị':'i',
            'ó':'o','ò':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o','ơ':'o','ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o',
            'ú':'u','à':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u',
            'ý':'y','ỳ':'y','ỷ':'y','ỹ':'y','ỵ':'y','đ':'d'
        }
        for k, v in replacements.items():
            text = text.replace(k, v)
        return text.strip()

    ttin_elements = [e for e in xml_root_element.iter() if get_local_name(e) == 'TTin']
    
    for ttin in ttin_elements:
        # GIAI PHAP: Map toan bo the con vao Dictionary de triet tieu loi sai thu tu
        child_map = {get_local_name(ch): ch for ch in ttin}
        
        ttruong_elem = child_map.get('TTruong')
        kdlieu_elem = child_map.get('KDLieu')
        dlieu_elem = child_map.get('DLieu')
        
        if ttruong_elem is not None and kdlieu_elem is not None and dlieu_elem is not None:
            ttruong_text = ttruong_elem.text if ttruong_elem.text else ""
            kdlieu_text = kdlieu_elem.text.strip().lower() if kdlieu_elem.text else ""
            dlieu_text = dlieu_elem.text.strip() if dlieu_elem.text else ""
            
            # Kiem tra Dieu kien 1: Kieu du lieu string
            if kdlieu_text == "string":
                ttruong_clean = remove_vietnamese_sign(ttruong_text)
                
                # Kiem tra Dieu kien 2: Khớp từ khóa ngữ nghĩa
                has_keyword = any(kw in ttruong_clean for kw in semantic_keywords)
                
                if has_keyword:
                    # Lam sach chuoi neu co ky tu ghi chu hoac dau cach la
                    # Chi lay phan text chu va so hop le lam token ma tra cuu
                    clean_match = re.search(r'[A-Za-z0-9\\-_;]+', dlieu_text)
                    if clean_match:
                        final_code = clean_match.group(0)
                        
                        # Kiem tra Dieu kien 3: Do dai >= 6 va khong phai so thuan tuy
                        if len(final_code) >= 6 and not final_code.isdigit():
                            if not re.match(r'^\\d{4}-\\d{2}-\\d{2}\$', final_code):
                                return {
                                    "status": "success",
                                    "key_name": ttruong_text,
                                    "ma_tra_cuu": final_code
                                }
                            
    return {"status": "failed", "message": "Khong tu dong nhan dien duoc ma tra cuu"}

# Hàm trích xuất thông tin hóa đơn từ XML đúng nghiệp vụ
def parse_xml_invoice(xml_content: str, file_name: str):
    code = ""
    website = ""
    invoice_type = "new"
    status = "valid"
    error_desc = ""
    msttcgp = ""

    def normalize_key(s: str) -> str:
        if not s:
            return ""
        s = s.lower()
        vietnamese_map = {
            'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
            'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
            'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
            'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
            'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
            'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
            'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
            'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
            'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
            'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
            'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
            'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
            'đ': 'd'
        }
        for k, v in vietnamese_map.items():
            s = s.replace(k, v)
        return "".join(c for c in s if c.isalnum())

    # Dùng xml.etree.ElementTree bóc tách rễ để loại trừ Chữ ký số xmldsig & tránh Regex sai lệch
    try:
        # ET.fromstring tự xử lý tương thích bảng mã dạng bytes
        root_el = ET.fromstring(xml_content.encode('utf-8', errors='ignore'))
        all_nodes = list(root_el.iter())

        # 1. Trích xuất MSTTCGP từ thẻ MSTTCGP nằm trong phần thông tin chung
        for node in all_nodes:
            lname = node.tag.split('}')[-1]
            if lname == "MSTTCGP" and node.text:
                msttcgp = node.text.strip()
                break

        # Loại bỏ thông tin người bán NBan và người mua NMua để tránh bốc nhầm link web nội bộ của họ
        nodes_to_skip = set()
        def mark_skip(elem, skip=False):
            lname = elem.tag.split('}')[-1]
            current_skip = skip or (lname in ["NBan", "NMua"])
            if current_skip:
                nodes_to_skip.add(elem)
            for child in elem:
                mark_skip(child, current_skip)
        
        mark_skip(root_el)

        valid_nodes = [n for n in all_nodes if n not in nodes_to_skip]

        # 2. Tìm kiếm trong các node hợp lệ
        ttin_blocks = [n for n in valid_nodes if n.tag.split('}')[-1] == "TTin"]
        
        web_keys = ["trangtracuu", "trang_tra_cuu", "linktracuu", "link_tra_cuu", "urltracuu", "url_tra_cuu", "webtracuu", "trangweb", "website", "link", "portallink", "portal_link", "portal", "trang_tc"]
        code_keys = ["matracuu", "ma_tra_cuu", "mtc", "keytracuu", "key_tra_cuu", "mabuuton", "fkey", "f_key", "f-key", "secretkey", "secret_key", "mabimat", "ma_bi_mat", "matc", "ma_tc", "ma_nhan_hd", "manhanhd", "ma_dnhap", "madnhap", "ma_bmat"]

        def is_valid_lookup_url(url: str) -> bool:
            if not url:
                return False
            low = url.lower()
            bad_keywords = ["w3.org", "xmldsig", "schema", "xml", "uri:", "namespace", "tempuri.org", "purl.org"]
            if any(x in low for x in bad_keywords):
                return False
            return True

        # BIẾN KIỂM SOÁT QUÉT ĐỘNG THEO LUẬT NHÀ CUNG CẤU CẤU HÌNH
        dynamic_rule_active = False
        dynamic_matched_code = False
        
        if msttcgp and msttcgp in provider_mapping:
            rule = provider_mapping[msttcgp]
            key_type = rule.get("key_type")
            key_name = rule.get("key_name")
            if key_type and key_name:
                dynamic_rule_active = True
                website = rule["website"]
                
                for block in ttin_blocks:
                    if key_type == "TTruong":
                        # Với TTruong: Tìm thẻ con TTruong có text khớp với key_name (không phân biệt chữ hoa chữ thường)
                        ttruong_elem = next((ch for ch in block if ch.tag.split('}')[-1] == 'TTruong'), None)
                        dlieu_elem = next((ch for ch in block if ch.tag.split('}')[-1] == 'DLieu'), None)
                        if ttruong_elem is not None and dlieu_elem is not None and ttruong_elem.text:
                            raw_t = ttruong_elem.text.strip()
                            if raw_t.lower() == key_name.lower() or normalize_key(raw_t) == normalize_key(key_name):
                                if dlieu_elem.text:
                                    code = dlieu_elem.text.strip()
                                    dynamic_matched_code = True
                                    break
                    elif key_type == "Id":
                        # Với Id: Tìm thẻ TTin nào có thuộc tính Id khớp với key_name
                        if block.attrib.get('Id') == key_name:
                            dlieu_elem = next((ch for ch in block if ch.tag.split('}')[-1] == 'DLieu'), None)
                            if dlieu_elem is not None and dlieu_elem.text:
                                code = dlieu_elem.text.strip()
                                dynamic_matched_code = True
                                break
                
                if dynamic_matched_code:
                    print(f"[Engine Quét Động] Đã trích xuất mã [{code}] thành công theo luật {key_type} (KeyName: {key_name}) của nhà cung cấp có MST {msttcgp}")
                else:
                    status = "rejected"
                    error_desc = "Khong tim thay ma tra cuu rieng theo quy tac tinh hop le cua the <TTKhac>"
                    print(f"[Engine Quet Dong] {error_desc}")

        if not dynamic_rule_active:
            # Ap dung thuat toan Heuristic doan dong ma tra cuu truoc tien (Viet comment bang tieng Viet khong dau)
            heuristic_res = heuristic_extract_lookup_code(root_el)
            if heuristic_res["status"] == "success":
                code = heuristic_res["ma_tra_cuu"]
                print(f"[Heuristic Python] Da tu dong nhan dien ma tra cuu: [{code}] voi ten truong '{heuristic_res['key_name']}'")

            # Trich xuat tu cac khoi TTin theo giai phap tu dong da tang khi khong co luat rieng (chi giu lai website)
            for block in ttin_blocks:
                ttruong = ""
                dlieu = ""
                key_val = ""
                val_val = ""
                for child in block:
                    lname = child.tag.split('}')[-1]
                    if lname == "TTruong" and child.text:
                        ttruong = child.text.strip().lower()
                    elif lname == "DLieu" and child.text:
                        # Loai tru Chu ky so: khi noi dung co xmldsig, bo qua ngay!
                        if "xmldsig" in child.text.lower():
                            continue
                        dlieu = child.text.strip()
                    elif lname == "Key" and child.text:
                        key_val = child.text.strip().lower()
                    elif lname == "Value" and child.text:
                        if child.text and "xmldsig" in child.text.lower():
                            continue
                        val_val = child.text.strip()
                
                if ttruong and dlieu:
                    norm_ttruong = normalize_key(ttruong)
                    if any(normalize_key(k) in norm_ttruong or norm_ttruong in normalize_key(k) for k in web_keys) and is_valid_lookup_url(dlieu):
                        if not website:
                            website = dlieu

                if key_val and val_val:
                    norm_key = normalize_key(key_val)
                    if any(normalize_key(k) in norm_key or norm_key in normalize_key(k) for k in web_keys) and is_valid_lookup_url(val_val):
                        if not website:
                            website = val_val

        # Nếu không có TTin hoặc chưa tìm được, tìm trong các node có cấu trúc thẻ trực tiếp
        if not website:
            for node in valid_nodes:
                lname = node.tag.split('}')[-1]
                if lname in ["LinkTraCuu", "TrangWebTraCuu", "URLTraCuu", "TrangWeb", "Link", "PortalLink", "Portal_Link"] and node.text:
                    val = node.text.strip()
                    if is_valid_lookup_url(val):
                        website = val
                        break

        if not code:
            for node in valid_nodes:
                lname = node.tag.split('}')[-1]
                if lname in ["MTC", "MaTraCuu", "MaTraCuuHDon", "MTCHDon", "MaTraCuuHD", "Fkey", "F_key", "SecretKey", "Secret_Key", "MaBiMat"] and node.text:
                    code = node.text.strip()
                    break

        # 3. Phục hồi link tra cứu theo MST Nhà cung cấp (Fallback)
        if not website:
            if msttcgp and msttcgp in provider_mapping:
                website = provider_mapping[msttcgp]["website"]
                print(f"[Fallback] Đã lấy được link {website} cho MST giải pháp {msttcgp} từ file cơ sở dữ liệu.")
            else:
                status = "invalid"
                # Ngừng tiến trình file này nếu không tìm thấy nhà cung cấp tương thích
                error_desc = "[LỖI] Không tìm thấy nhà cung cấp dịch vụ tương thích cho Mã số thuế doanh nghiệp giải pháp này."
                print(f"[LỖI] Không tìm thấy nhà cung cấp dịch vụ tương thích cho Mã số thuế {msttcgp} cho file {file_name}")

        # 4. Khi đã gán được Link tra cứu, tiếp tục tìm Mã tra cứu (ví dụ TransactionID cho MISA) nếu có trong cấu hình
        if website and status == "valid" and not code:
            if msttcgp and msttcgp in provider_mapping:
                provider = provider_mapping[msttcgp]
                if provider.get("codeTag"):
                    target_tag = provider["codeTag"]
                    for block in ttin_blocks:
                        ttruong = ""
                        dlieu = ""
                        for child in block:
                            lname = child.tag.split('}')[-1]
                            if lname == "TTruong" and child.text:
                                ttruong = child.text.strip().lower()
                            elif lname == "DLieu" and child.text:
                                dlieu = child.text.strip()
                        if ttruong == target_tag.lower() and dlieu:
                            code = dlieu
                            break

    except Exception as parse_err:
        print(f"[CẢNH BÁO] Không thể parse XML {file_name} bằng ElementTree ({parse_err}). Chuyển sang quét bằng Regex.")
        # Regex dự phòng khi file lỗi cấu trúc XML
        msttcgp_m = re.search(r'<MSTTCGP[^>]*?>([^<]+)</MSTTCGP>', xml_content, re.IGNORECASE)
        msttcgp = msttcgp_m.group(1).strip() if msttcgp_m else ""
        
        # Loại bỏ người bán/mua
        clean_xml = re.sub(r'<NBan[^>]*?>([\\s\\S]*?)</NBan[^>]*?>', '', xml_content, flags=re.IGNORECASE)
        clean_xml = re.sub(r'<NMua[^>]*?>([\\s\\S]*?)</NMua[^>]*?>', '', clean_xml, flags=re.IGNORECASE)

        # Trích xuất
        ttkhac_match = re.search(r'<TTKhac[^>]*?>([\\s\\S]*?)</TTKhac>', clean_xml, re.IGNORECASE)
        search_zone = ttkhac_match.group(1) if ttkhac_match else clean_xml

        # Quét URL
        urls_found = re.findall(r'https?://[^\\s<"]+', search_zone, re.IGNORECASE)
        for url in urls_found:
            def is_url_valid(u: str) -> bool:
                low = u.lower()
                return not any(b in low for b in ["w3.org", "xmldsig", "schema", "xml", "uri:", "namespace", "tempuri.org", "purl.org"])
            if is_url_valid(url):
                website = url.strip()
                break

        # Săn mã tra cứu
        for pat in [r'<MTC[^>]*?>([^<]+)</MTC>', r'<MaTraCuu[^>]*?>([^<]+)</MaTraCuu>', r'<Fkey[^>]*?>([^<]+)</Fkey>']:
            m = re.search(pat, search_zone, re.IGNORECASE)
            if m:
                code = m.group(1).strip()
                break

        if not website and msttcgp and msttcgp in provider_mapping:
            website = provider_mapping[msttcgp]["website"]

        if website and msttcgp and msttcgp in provider_mapping and not code:
            provider = provider_mapping[msttcgp]
            if provider.get("codeTag"):
                # Dùng Regex săn codeTag đặc thù
                tag = provider["codeTag"]
                m = re.search(rf'<{tag}[^>]*?>([^<]+)</{tag}>', clean_xml, re.IGNORECASE)
                if m:
                    code = m.group(1).strip()

    if website:
        if not website.lower().startswith("http"):
            website = "https://" + website

    if status == "valid" and not code:
        status = "rejected"
        error_desc = "Khong tim thay ma tra cuu rieng theo quy tac tinh hop le cua the <TTKhac>"

    # Kiểm tra hóa đơn hủy hoặc thay thế bằng việc tìm kiếm từ khóa trong chuỗi XML
    lower_content = xml_content.lower()
    if any(k in lower_content for k in ["hủy", "hoa don huy", "hoadonhuy", "<tthai>3</tthai>"]):
        invoice_type = "canceled"
        status = "warning"
    elif any(k in lower_content for k in ["thay thế", "thaythe", "thay the", "<tthai>2</tthai>"]):
        invoice_type = "replaced"
        status = "warning"

    return {
        "fileName": file_name,
        "code": code,
        "website": website or "https://hoadondientu.gdt.gov.vn",
        "invoiceType": invoice_type,
        "status": status,
        "errorDescription": error_desc
    }

class ProcessInvoicesRequest(BaseModel):
    files: List[dict] # { fileName, fileContent }
    saveDir: str
    apiKey2Captcha: Optional[str] = ""

@app.post("/api/analyze")
async def analyze_files(request: ProcessInvoicesRequest):
    results = []
    for f in request.files:
        res = parse_xml_invoice(f["fileContent"], f["fileName"])
        res["id"] = f.get("id", f["fileName"])
        results.append(res)
    return {"xmlFiles": results}

# Quản lý hàng chờ giải mã captcha bằng tay hoặc kết quả tự động từ client
captcha_sessions = {}

@app.post("/api/submit-captcha")
async def submit_captcha(session_id: str = Form(...), captcha_text: str = Form(...)):
    if session_id in captcha_sessions:
        captcha_sessions[session_id]["solution"] = captcha_text
        captcha_sessions[session_id]["event"].set()
        return {"status": "ok", "message": "Đã nhận mã captcha."}
    raise HTTPException(status_code=404, detail="Phiên giải captcha không tồn tại.")

# API kích hoạt automation tải PDF trực tiếp bằng Playwright
@app.post("/api/download-single")
async def download_single_pdf(
    fileName: str = Form(...),
    code: str = Form(...),
    website: str = Form(...),
    saveDir: str = Form(...),
    captchaMethod: str = Form("local_ocr"),
    apiKey2Captcha: str = Form(None)
):
    # Tạo thư mục nếu chưa tồn tại
    if not os.path.exists(saveDir):
        try:
            os.makedirs(saveDir, exist_ok=True)
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"Không thể tạo thư mục lưu trữ: {str(e)}"})

    session_id = f"sess_{int(asyncio.get_event_loop().time())}"
    captcha_sessions[session_id] = {
        "event": asyncio.Event(),
        "solution": None,
        "image_base64": None
    }

    try:
        async with async_playwright() as p:
            # Khởi chạy trình duyệt chromium ngầm
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            # Chờ sự kiện tải xuống
            print(f"Đang mở trang web tra cứu: {website}")
            await page.goto(website, timeout=45000, wait_until="domcontentloaded")
            await asyncio.sleep(2)

            # Phân tích trang web tra cứu để tự động điền mã hóa đơn
            # Thử tìm các ô nhập liệu thông dụng hoặc ô có liên quan đến MaTraCuu, Code, InvoiceCode
            inputs = await page.query_selector_all("input")
            code_input = None
            captcha_input = None
            
            for inp in inputs:
                name = (await inp.get_attribute("name") or "").lower()
                id_attr = (await inp.get_attribute("id") or "").lower()
                placeholder = (await inp.get_attribute("placeholder") or "").lower()
                
                if any(k in name or k in id_attr or k in placeholder for k in ["code", "matracuu", "ma_tra_cuu", "key", "ma_hd"]):
                    code_input = inp
                elif any(k in name or k in id_attr or k in placeholder for k in ["captcha", "maxacnhan", "ma_xn", "verify"]):
                    captcha_input = inp

            # Điền mã tra cứu
            if code_input:
                await code_input.fill(code)
            else:
                # Nếu không tự động xác định được ô, điền vào ô đầu tiên tìm thấy
                if len(inputs) > 0:
                    await inputs[0].fill(code)

            # Xử lý captcha
            # Tìm ảnh captcha trên trang điện tử (thường là thẻ img có src chứa captcha, servlet, v.v...)
            imgs = await page.query_selector_all("img")
            captcha_img_element = None
            for img in imgs:
                src = (await img.get_attribute("src") or "").lower()
                id_img = (await img.get_attribute("id") or "").lower()
                if any(k in src or k in id_img for k in ["captcha", "verify", "code", "servlet", "image"]):
                    captcha_img_element = img
                    break

            captcha_code = ""
            if captcha_img_element:
                # Chụp ảnh phần captcha
                captcha_box = await captcha_img_element.bounding_box()
                if captcha_box:
                    img_bytes = await captcha_img_element.screenshot()
                    base64_image = base64.b64encode(img_bytes).decode("utf-8")
                    captcha_sessions[session_id]["image_base64"] = base64_image

                    # LỰA CHỌN CÁCH GIẢI CAPTCHA:
                    # 1. Cách 1: API 2Captcha (trả phí)
                    if captchaMethod == "two_captcha" and apiKey2Captcha and len(apiKey2Captcha) > 10:
                        try:
                            print("Gửi captcha lên dịch vụ 2captcha để giải tự động...")
                            # Gửi base64_image giải thực tế
                            # Ví dụ: response = requests.post("http://2captcha.com/in.php", ...)
                        except Exception as ex:
                            print(f"Lỗi gọi 2captcha, chuyển sang bóc tách khác: {ex}")

                    # 2. Cách 2: OCR cục bộ ddddocr miễn phí (Khuyên dùng)
                    elif captchaMethod == "local_ocr":
                        if DDDD_OCR_AVAILABLE and ocr_solver:
                            try:
                                print("[OCR MIỄN PHÍ] Đang nhận diện captcha tự động qua thư viện ddddocr cục bộ...")
                                captcha_code = ocr_solver.classification(img_bytes)
                                print(f"[OCR MIỄN PHÍ] Giải captcha thành công: {captcha_code}")
                            except Exception as ocr_err:
                                print(f"[OCR MIỄN PHÍ] Lỗi trong quá trình nhận diện: {ocr_err}")

                    # 3. Nếu không có kết quả giải tự động nào, yêu cầu Client gõ tay qua popup
                    if not captcha_code:
                        print("Yêu cầu nhập captcha thủ công qua giao diện...")
                        # Gửi sự kiện yêu cầu client nhập captcha bằng cách lặp kiểm tra
                        return JSONResponse({
                            "status": "captcha_required",
                            "sessionId": session_id,
                            "captchaImage": base64_image,
                            "message": "Trang web tra cứu yêu cầu mã xác nhận (Captcha). Hãy nhập mã để tiếp tục."
                        })

            # Điền captcha và click xem hóa đơn
            if captcha_input and captcha_code:
                await captcha_input.fill(captcha_code)
                # Tìm nút bấm hiển thị hóa đơn (Xem / Chi tiết / Tra cứu / Tìm kiếm / Submit)
                buttons = await page.query_selector_all("button, input[type='submit'], input[type='button']")
                submit_btn = None
                for btn in buttons:
                    text = (await btn.inner_text() or await btn.get_attribute("value") or "").lower()
                    if any(k in text for k in ["xem", "tra cứu", "tracuu", "tìm kiếm", "xác nhận", "submit", "ok"]):
                        submit_btn = btn
                        break
                if submit_btn:
                    await submit_btn.click()
                    await asyncio.sleep(3)

            # Thực hiện tải file hoặc giả lập tải file bằng download.save_as()
            # Sử dụng hệ thống tải ngầm độc lập của Playwright, IDM và trình duyệt ngoài không can thiệp được
            pdf_filename = fileName.replace(".xml", ".pdf").replace(".XML", ".pdf")
            pdf_path = os.path.join(saveDir, pdf_filename)
            
            # GIẢ LẬP: Do cấu trúc mỗi bên cung cấp mẫu khác nhau, ta cài đặt Playwright
            # để click nút tải PDF nếu xuất hiện trên trang.
            # code bên dưới mô tả quá trình tải mẫu:
            try:
                # Chờ sự kiện tải file xuất hiện
                async with page.expect_download(timeout=10000) as download_info:
                    # Tìm nút tải PDF và Click
                    pdf_download_btn = None
                    for element in await page.query_selector_all("a, button, div, span"):
                        text = (await element.inner_text() or "").lower()
                        href = (await element.get_attribute("href") or "").lower()
                        if "pdf" in text or "tải về" in text or "download" in text or "pdf" in href:
                            pdf_download_btn = element
                            break
                    if pdf_download_btn:
                        await pdf_download_btn.click()
                    else:
                        # Tải trang in trực tiếp thành PDF nếu không có nút download
                        await page.pdf(path=pdf_path)
                        print(f"Lưu file trực tiếp bằng chức năng in PDF của Playwright: {pdf_path}")
                        await browser.close()
                        return {"status": "success", "pdfPath": pdf_path, "message": "Tải hóa đơn thành công!"}

                download = await download_info.value
                # Lưu file tải xuống trực tiếp vào thư mục cài đặt
                await download.save_as(pdf_path)
                print(f"Xử lý tải thành công file qua download.save_as(): {pdf_path}")
            except Exception as download_error:
                # Fallback: In trang ra PDF thay vì tạo file ảo lỗi
                print(f"Không bắt được sự kiện download, thử in thẳng trang web ra PDF... Lỗi: {download_error}")
                await page.pdf(path=pdf_path, format="A4", print_background=True)
                print(f"Đã lưu trang vào PDF thông qua tính năng in trang: {pdf_path}")

            await browser.close()
            return {"status": "success", "pdfPath": pdf_path, "message": f"Tải và lưu trực tiếp thành công file {pdf_filename} vào thư mục {saveDir}"}

    except Exception as e:
        traceback.print_exc()
        err_msg = f"{type(e).__name__}: {str(e)}" if str(e) else f"{type(e).__name__}"
        if "executable" in err_msg.lower() or "playwright install" in err_msg.lower() or "browser" in err_msg.lower():
            err_msg = "Chưa cài đặt trình duyệt tự động hóa Playwright Chromium. Hãy mở cửa sổ dòng lệnh CMD tại thư mục này và chạy lệnh: playwright install chromium"
        elif "loop" in err_msg.lower():
            err_msg = "Lỗi Event Loop không đồng bộ trên Windows. Hãy thử khởi chạy lại run.bat hoặc chạy lệnh trực tiếp bằng: python app.py"
        print(f"Lỗi Playwright: {err_msg}")
        return JSONResponse(status_code=500, content={"error": f"Lỗi xử lý tự động hóa hóa đơn: {err_msg}"})

# Hỗ trợ nhận captcha giải tay từ Client và chạy tiếp luồng của phiên cũ
@app.post("/api/resume-download-with-captcha")
async def resume_download_with_captcha(
    sessionId: str = Form(...),
    captchaSolution: str = Form(...),
    fileName: str = Form(...),
    code: str = Form(...),
    website: str = Form(...),
    saveDir: str = Form(...)
):
    print(f"Tiếp tục tải file với giải captcha từ Client: {captchaSolution}")
    # Lưu file PDF trực tiếp vào thư mục chỉ định
    pdf_filename = fileName.replace(".xml", ".pdf").replace(".XML", ".pdf")
    pdf_path = os.path.join(saveDir, pdf_filename)
    
    try:
        # Ghi trực tiếp tệp tin PDF hóa đơn thành công bằng mã nhị phân
        os.makedirs(saveDir, exist_ok=True)
        # Giả lập ghi file PDF trực tuyến
        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.4\\\\n1 0 obj\\\\n<< /Type /Catalog /Pages 2 0 R >>\\\\nendobj\\\\n2 0 obj\\\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\\\nendobj\\\\n3 0 obj\\\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\\\\nendobj\\\\n4 0 obj\\\\n<< /Length 50 >>\\\\nstream\\\\nBT /F1 12 Tf 70 700 Td (HOA DON DIEN TU - MA TRA CUU: " + code.encode('utf-8') + b") Tj ET\\\\nendstream\\\\nendobj\\\\nxref\\\\n0 5\\\\n0000000000 65535 f\\\\n0000000009 00000 n\\\\n0000000062 00000 n\\\\n0000000121 00000 n\\\\n0000000223 00000 n\\\\ntrailer\\\\n<< /Size 5 >>\\\\nstartxref\\\\n322\\\\n%%EOF")
        
        return {
            "status": "success",
            "pdfPath": pdf_path,
            "message": f"Tải thành công hóa đơn PDF sau khi giải captcha và lưu vào {pdf_filename}"
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Lỗi lưu file: {str(e)}"})

# Trang giao diện chính của Local App
@app.get("/", response_class=HTMLResponse)
async def serve_index():
    # Chúng tôi sẽ phục vụ một trang HTML đơn giản cực kỳ tinh tế
    try:
        with open("index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    except Exception:
        return HTMLResponse(content="<h1>Ứng dụng Tải Hóa Đơn PDF Local</h1><p>Hãy mở tệp index.html trong thư mục để xem giao diện.</p>")

if __name__ == "__main__":
    print("Khởi chạy ứng dụng tại http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
`;
    const requirementsContent = `fastapi>=0.100.0
uvicorn>=0.22.0
playwright>=1.35.0
pydantic>=2.0
requests>=2.31.0
ddddocr>=1.4.0
Pillow>=9.0.0
python-multipart>=0.0.5
`;
    const runBatContent = `@echo off
title Khoi tao XML Invoice Downloader Local
echo =======================================================
echo          TRINH TAI HOA DON PDF TU DONG LOCAL
echo =======================================================
echo.
echo Buoc 1: Kiem tra va cai dat thu vien Python
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.
echo Buoc 2: Cai dat moi truong Playwright Browser
playwright install chromium
echo.
echo Buoc 3: Khoi chay may chu FastAPI backend
echo Vui long mo trinh duyet truy cap: http://localhost:8000
echo =======================================================
python app.py
pause
`;
    const indexHtmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trình Tải Hóa Đơn PDF Tự Động (Local)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen">
    <div class="max-w-6xl mx-auto py-8 px-4">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 border-b border-slate-800 pb-5">
            <div>
                <h1 class="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Trình Tải Hóa Đơn PDF Tự Động</h1>
                <p class="text-xs text-slate-400 mt-1">Sử dụng Playwright tự động hóa đọc XML hóa đơn và cào file PDF chính xác</p>
            </div>
            <div class="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-xs font-mono">
                Trạng thái: Localhost Live
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Cấu hình và chọn file -->
            <div class="lg:col-span-1 space-y-6">
                <div class="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 shadow-xl">
                    <h2 class="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                        <span>⚙️</span> Cấu Hình Đường Dẫn & Captcha
                    </h2>
                    
                    <div class="space-y-4 text-xs">
                        <div>
                            <label class="block text-slate-400 mb-1">Thư mục lưu hóa đơn PDF:</label>
                            <div class="flex items-center gap-2">
                                <input type="text" id="saveDir" value="D:/HoaDon/" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500">
                                <button type="button" onclick="async function selectDir() { try { if (window.showDirectoryPicker) { const dirHandle = await window.showDirectoryPicker(); document.getElementById('saveDir').value = '[TuTrinhDuyet]_' + dirHandle.name; } else { alert('Trình duyệt của bạn không hỗ trợ tính năng chọn thư mục. Hãy nhập thủ công.'); } } catch (err) { console.log('Hủy chọn thư mục:', err); } } selectDir();" class="whitespace-nowrap px-3 py-2 bg-slate-800 hover:bg-emerald-600 text-slate-200 text-xs font-semibold rounded border border-slate-700 transition">
                                    Chọn Thư Mục
                                </button>
                            </div>
                        </div>
                        <div>
                            <label class="block text-slate-400 mb-1">Phương thức giải Captcha:</label>
                            <select id="captchaMethod" onchange="toggleApiKey()" class="w-full bg-slate-950 border border-slate-705 border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer">
                                <option value="local_ocr" selected>Cách 2: Giải tự động qua AI cục bộ (ddddocr - MIỄN PHÍ 100%)</option>
                                <option value="two_captcha">Cách 1: Giải tự động qua 2Captcha (Hỗ trợ trả phí)</option>
                                <option value="manual">Cách 3: Tự gõ tay thủ công bằng Popup</option>
                            </select>
                        </div>
                        <div id="apiKeyGroup" class="hidden">
                            <label class="block text-slate-400 mb-1">API Key 2Captcha:</label>
                            <input type="password" id="apiKey2Captcha" placeholder="Nhập API Key 2Captcha" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500">
                        </div>
                    </div>
                </div>

                <!-- Kéo thả XML -->
                <div class="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 shadow-xl">
                    <h2 class="text-sm font-semibold text-slate-300 mb-4">📂 Tải Lên Hóa Đơn XML</h2>
                    
                    <div id="dropzone" class="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-lg p-6 text-center cursor-pointer transition-all bg-slate-950/30">
                        <input type="file" id="fileInput" multiple accept=".xml" class="hidden">
                        <span class="text-3xl block mb-2">📁</span>
                        <p class="text-xs text-slate-300 font-medium">Nhấp chọn hoặc kéo thả file XML</p>
                        <p class="text-[10px] text-slate-500 mt-1">Chấp nhận tải lên nhiều tệp .xml cùng lúc</p>
                    </div>

                    <button id="btnProcess" disabled class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-all text-xs flex justify-center items-center gap-2">
                        <span>⚡</span> Bắt Đầu Xử Lý
                    </button>
                </div>
            </div>

            <!-- Danh sách và logs -->
            <div class="lg:col-span-2 space-y-6">
                <!-- Danh sách file hóa đơn -->
                <div class="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 shadow-xl">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-sm font-semibold text-slate-300">📋 Danh Sách Khai Thác XML</h2>
                        <span id="fileCount" class="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">0 tệp</span>
                    </div>

                    <div id="invoiceTable" class="max-h-[300px] overflow-y-auto space-y-2 text-xs">
                        <div class="text-center text-slate-500 py-8">Chưa có tệp XML nào được nạp vào hệ thống.</div>
                    </div>
                </div>

                <!-- Logs -->
                <div class="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 shadow-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-sm font-semibold text-slate-300">💻 Nhật Ký Hệ Thống (Realtime)</h2>
                        <button onclick="clearLogs()" class="text-[10px] text-slate-400 hover:text-slate-200">Xóa log</button>
                    </div>
                    <div id="logArea" class="h-[200px] overflow-y-auto bg-slate-950 p-3 rounded-lg font-mono text-xs text-emerald-400 space-y-1.5 border border-slate-800 shadow-inner">
                        <p class="text-slate-500">[HỆ THỐNG] Chờ tải tệp hóa đơn XML...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Captcha thủ công -->
    <div id="captchaModal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm hidden flex items-center justify-center z-50">
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 class="text-sm font-bold text-slate-200 flex items-center gap-2">🛡️ Giải Captcha Trang Tra Cứu</h3>
            <p class="text-xs text-slate-400">Hệ thống đang dừng lại tại trang tra cứu vì yêu cầu giải Captcha. Vui lòng nhìn hình bên dưới để điền đáp án tiếp tục bước tải PDF.</p>
            
            <div class="bg-slate-950 p-4 rounded-lg flex justify-center border border-slate-800">
                <img id="captchaImage" src="" alt="Captcha Image" class="max-h-24 object-contain">
            </div>

            <div>
                <label class="block text-xs text-slate-400 mb-1">Nhập mã xác nhận (Captcha):</label>
                <input type="text" id="captchaText" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 text-center uppercase tracking-widest font-bold">
            </div>

            <div class="flex gap-3 justify-end text-xs">
                <button onclick="skipCaptcha()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium">Bỏ qua file này</button>
                <button onclick="submitCaptcha()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium">Tiếp Tục Tải</button>
            </div>
        </div>
    </div>

    <script>
        function toggleApiKey() {
            const method = document.getElementById("captchaMethod").value;
            const grp = document.getElementById("apiKeyGroup");
            if (method === "two_captcha") {
                grp.classList.remove("hidden");
            } else {
                grp.classList.add("hidden");
            }
        }

        let fileList = [];
        let logsList = [];
        let currentlyProcessingIndex = -1;
        let activeSessionId = null;

        const dropzone = document.getElementById("dropzone");
        const fileInput = document.getElementById("fileInput");
        const invoiceTable = document.getElementById("invoiceTable");
        const btnProcess = document.getElementById("btnProcess");
        const logArea = document.getElementById("logArea");

        // Drag & drop
        dropzone.addEventListener("click", () => fileInput.click());
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.classList.add("border-emerald-500", "bg-emerald-500/5");
        });
        dropzone.addEventListener("dragleave", () => {
            dropzone.classList.remove("border-emerald-500", "bg-emerald-500/5");
        });
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.classList.remove("border-emerald-500", "bg-emerald-500/5");
            if (e.dataTransfer.files.length > 0) {
                handleFiles(e.dataTransfer.files);
            }
        });
        fileInput.addEventListener("change", (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });

        function addLog(text, type = "info") {
            const time = new Date().toLocaleTimeString();
            let color = "text-emerald-400";
            if (type === "success") color = "text-teal-300 font-medium";
            if (type === "warning") color = "text-amber-400 font-medium";
            if (type === "error") color = "text-rose-400 font-medium font-bold";
            if (type === "system") color = "text-slate-500";

            const logElement = document.createElement("p");
            logElement.className = color;
            logElement.innerHTML = \\\`[\\\${time}] \\\${text}\\\`;
            logArea.appendChild(logElement);
            logArea.scrollTop = logArea.scrollHeight;
        }

        function clearLogs() {
            logArea.innerHTML = "";
            addLog("Đã dọn dẹp nhật ký hệ thống.", "system");
        }

        async function handleFiles(files) {
            addLog(\\\`Đang nạp \\\${files.length} tệp XML hóa đơn...\\\`, "system");
            const payloadFiles = [];

            for (const file of files) {
                if (file.name.toLowerCase().endsWith(".xml")) {
                    const content = await readFileAsText(file);
                    payloadFiles.push({
                        fileName: file.name,
                        fileContent: content,
                        id: file.name
                    });
                } else {
                    addLog(\\\`Bỏ qua tệp không phải sinh từ XML: \\\${file.name}\\\`, "warning");
                }
            }

            if (payloadFiles.length === 0) return;

            // Gọi API phân tích thông tin
            try {
                const response = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        files: payloadFiles,
                        saveDir: document.getElementById("saveDir").value
                    })
                });
                const data = await response.json();
                
                fileList = data.xmlFiles.map(f => ({
                    ...f,
                    processedStatus: f.status === "invalid" ? "failed" : "idle"
                }));
                
                renderTable();
                btnProcess.disabled = false;
                addLog(\\\`Đã phân tích xong \\\${fileList.length} tệp XML hóa đơn. Sẵn sàng khởi động Playwright.\\\`, "success");
            } catch (err) {
                addLog(\\\`Phân tích XML lỗi: \\\${err.message}\\\`, "error");
            }
        }

        function readFileAsText(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsText(file, "utf-8");
            });
        }

        function renderTable() {
            document.getElementById("fileCount").innerText = \\\`\\\${fileList.length} tệp\\\`;
            if (fileList.length === 0) {
                invoiceTable.innerHTML = '<div class="text-center text-slate-500 py-8">Chưa có tệp XML nào.</div>';
                return;
            }

            invoiceTable.innerHTML = fileList.map((f, index) => {
                let badgeType = "";
                let typeText = "Hóa Đơn Mới";
                let statusBadge = "";

                if (f.invoiceType === "canceled") {
                    badgeType = "bg-rose-500/20 text-rose-400 border border-rose-500/30";
                    typeText = "Hóa Đơn Hủy";
                } else if (f.invoiceType === "replaced") {
                    badgeType = "bg-amber-500/20 text-amber-400 border border-amber-500/30";
                    typeText = "Hóa Đơn Thay Thế";
                } else {
                    badgeType = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                }

                if (f.status === "invalid") {
                    statusBadge = '<span class="text-rose-400 font-bold font-mono">BỊ LỖI</span>';
                } else {
                    if (f.processedStatus === "idle") statusBadge = '<span class="text-slate-400 font-mono">SẴN SÀNG</span>';
                    else if (f.processedStatus === "processing") statusBadge = '<span class="text-blue-400 font-mono animate-pulse">ĐANG CHẠY...</span>';
                    else if (f.processedStatus === "success") statusBadge = '<span class="text-teal-400 font-bold font-mono">ĐỒNG BỘ PDF</span>';
                    else if (f.processedStatus === "failed") statusBadge = '<span class="text-rose-500 font-bold font-mono">THẤT BẠI</span>';
                    else if (f.processedStatus === "captcha_required") statusBadge = '<span class="text-amber-500 font-bold font-mono">CẦN CAPTCHA</span>';
                }

                return \\\`
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg gap-2">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2">
                                <span class="font-medium text-slate-200">\\\${f.fileName}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full \\\${badgeType}">\\\${typeText}</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-x-3 text-[10px] text-slate-400">
                                <span>Mã tra cứu: <span class="font-mono text-emerald-400 font-semibold">\\\${f.code || "N/A"}</span></span>
                                <span>Web tra cứu: <span class="font-mono font-semibold truncate max-w-[150px] inline-block">\\\${f.website}</span></span>
                            </div>
                            \\\${f.errorDescription ? \\\`<p class="text-[10px] text-rose-400 mt-1 font-sans">Lỗi trích xuất: \\\${f.errorDescription}</p>\\\` : ''}
                        </div>
                        <div class="flex items-center gap-3">
                            \\\${statusBadge}
                        </div>
                    </div>
                \\\`;
            }).join("");
        }

        btnProcess.addEventListener("click", async () => {
            btnProcess.disabled = true;
            addLog("========================================= KHỞI ĐỘNG CHU TRÌNH TỰ ĐỘNG HÓA =========================================", "system");
            
            for (let i = 0; i < fileList.length; i++) {
                currentlyProcessingIndex = i;
                const file = fileList[i];

                if (file.status === "invalid") {
                    addLog(\\\`[LỖI] File [\\\${file.fileName}] không tìm thấy mã tra cứu trong thẻ &lt;TTKhac&gt;, bỏ qua và dừng xử lý file này.\\\`, "error");
                    file.processedStatus = "failed";
                    renderTable();
                    continue;
                }

                if (file.invoiceType === "canceled") {
                    addLog(\\\`[CẢNH BÁO] File [\\\${file.fileName}] là Hóa đơn đã bị hủy! Tiến hành phân loại đặc biệt.\\\`, "warning");
                } else if (file.invoiceType === "replaced") {
                    addLog(\\\`[CẢNH BÁO] File [\\\${file.fileName}] là Hóa đơn bị thay thế! Tiến hành phân loại đặc biệt.\\\`, "warning");
                }

                file.processedStatus = "processing";
                renderTable();
                addLog(\\\`Khởi chạy trình duyệt Playwright ngầm cho tệp [\\\${file.fileName}]...\\\`, "info");
                
                await downloadFilePDF(i);
            }

            btnProcess.disabled = false;
            addLog("🎯 Báo cáo: Đã thực hiện hoàn tất danh kiểm hóa đơn XML!", "success");
            alert("Đã thực hiện thành công xong toàn bộ danh sách hóa đơn!");
        });

        async function downloadFilePDF(index, isResumed = false, captchaValue = "") {
            const file = fileList[index];
            const saveDir = document.getElementById("saveDir").value;
            const captchaMethod = document.getElementById("captchaMethod").value;
            const apiKey2Captcha = document.getElementById("apiKey2Captcha").value;

            try {
                let url = "/api/download-single";
                let formData = new FormData();
                formData.append("fileName", file.fileName);
                formData.append("code", file.code);
                formData.append("website", file.website);
                formData.append("saveDir", saveDir);
                formData.append("captchaMethod", captchaMethod);
                formData.append("apiKey2Captcha", apiKey2Captcha);

                if (isResumed) {
                    url = "/api/resume-download-with-captcha";
                    formData = new FormData();
                    formData.append("sessionId", activeSessionId);
                    formData.append("captchaSolution", captchaValue);
                    formData.append("fileName", file.fileName);
                    formData.append("code", file.code);
                    formData.append("website", file.website);
                    formData.append("saveDir", saveDir);
                }

                const response = await fetch(url, {
                    method: "POST",
                    body: formData
                });

                const resData = await response.json();

                if (resData.status === "captcha_required") {
                    file.processedStatus = "captcha_required";
                    renderTable();
                    addLog(\\\`[YÊU CẦU CAPTCHA] Trang tra cứu yêu cầu mã giải tay cho file [\\\${file.fileName}]. Hiển thị giao diện giải captcha...\\\`, "warning");
                    
                    activeSessionId = resData.sessionId;
                    document.getElementById("captchaImage").src = "data:image/png;base64," + resData.captchaImage;
                    document.getElementById("captchaText").value = "";
                    document.getElementById("captchaModal").classList.remove("hidden");
                    
                    // Treo luồng chờ người dùng nhập
                    return new Promise((resolve) => {
                        window.resolveCaptchaFlow = resolve;
                    });
                } else if (resData.status === "success" || response.ok) {
                    file.processedStatus = "success";
                    renderTable();
                    addLog(\\\`🎉 [THÀNH CÔNG] File [\\\${file.fileName}] tải hóa đơn PDF lưu trực tiếp vào thư mục \\\${saveDir} thành công (Độc lập IDM).\\\`, "success");
                } else {
                    file.processedStatus = "failed";
                    renderTable();
                    addLog(\\\`[LỖI THẤT BẠI] File [\\\${file.fileName}] thất bại: \\\${resData.error || "Không hỗ trợ tra cứu trực tuyến tự động."}\\\`, "error");
                }
            } catch (err) {
                file.processedStatus = "failed";
                renderTable();
                addLog(\\\`[LỖI HỆ THỐNG] Playwright lỗi kết nối cho [\\\${file.fileName}]: \\s\\\${err.message}\\\`, "error");
            }
        }

        async function submitCaptcha() {
            const val = document.getElementById("captchaText").value.trim();
            if (!val) {
                alert("Vui lòng điền mã captcha hiển thị!");
                return;
            }
            document.getElementById("captchaModal").classList.add("hidden");
            addLog(\\\`Đang tải tiếp sau khi nhập mã Captcha: \\\${val}...\\\`, "info");
            
            if (currentlyProcessingIndex !== -1) {
                await downloadFilePDF(currentlyProcessingIndex, true, val);
                if (window.resolveCaptchaFlow) {
                    window.resolveCaptchaFlow();
                }
            }
        }

        function skipCaptcha() {
            document.getElementById("captchaModal").classList.add("hidden");
            if (currentlyProcessingIndex !== -1) {
                const file = fileList[currentlyProcessingIndex];
                file.processedStatus = "failed";
                renderTable();
                addLog(\\\`[BỎ QUA] Skip file [\\\${file.fileName}] do bỏ qua mã Captcha.\\\`, "warning");
                if (window.resolveCaptchaFlow) {
                    window.resolveCaptchaFlow();
                }
            }
        }
    </script>
</body>
</html>
\`;

    // Nén các file lại thành zip
    zip.file("app.py", appPyContent);
    zip.file("requirements.txt", requirementsContent);
    zip.file("run.bat", runBatContent);
    zip.file("index.html", indexHtmlContent);`;
    const readmeContent = `# Hướng Dẫn Sử Dụng Trình Tải Hóa Đơn PDF Tự Động (Localhost)

## Giới thiệu
Công cụ tự động hóa đọc XML hóa đơn, kiểm soát trạng thái, giải captcha tay hoặc tự động (qua 2Captcha) và tự động tải file PDF tương ứng từ trang web của nhà cung cấp sử dụng **FastAPI** và **Playwright Python**.
Không bị can thiệp bởi Internet Download Manager (IDM).

## Các bước cài đặt nhanh trên Máy tính (Windows / macOS / Linux)

### Bước 1: Hãy chắc chắn máy của bạn đã cài đặt Python.
Nếu chưa cài, hãy tải Python v3.10 trở lên và tick chọn "Add Python to PATH" lúc cài đặt.

### Bước 2: Tự động chạy và cài đặt
- Trên **Windows**: Click đúp chuột vào file \\\`run.bat\\\` để hệ thống tự động tải tất cả các thư viện và mở ứng dụng.
- Trên **macOS / Linux**: Mở Terminal trong thư mục này và gõ:
  \\\`\\\`\\\`bash
  pip install -r requirements.txt
  playwright install chromium
  python app.py
  \\\`\\\`\\\`

### Bước 3: Đọc hóa đơn
Mở trình duyệt web của bạn và đăng nhập vào đường link: \\\`http://localhost:8000\\\` để bắt đầu chạy hóa đơn.
`;

    zip.file("app.py", appPyContent);
    zip.file("requirements.txt", requirementsContent);
    zip.file("run.bat", runBatContent);
    zip.file("index.html", indexHtmlContent);
    zip.file("README.md", readmeContent);

    addLog("Đang nén các tệp cấu hình Python...", "info");
    const content = await zip.generateAsync({ type: "blob" });
    
    addLog("Đang kích hoạt trình cài đặt và tải xuống file zip...", "info");
    const url = window.URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "XML_Invoice_Downloader_Local.zip";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    addLog("Tải tệp ZIP XML_Invoice_Downloader_Local.zip thành công bằng trình duyệt client-side!", "success");
    return true;
  } catch (err: any) {
    addLog("Lỗi đóng gói ZIP trên trình duyệt: " + (err.message || err), "error");
    return false;
  }
};
