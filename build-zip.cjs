const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function main() {
  console.log("Starting build-zip.cjs extract and package process...");
  try {
    const serverTsPath = path.join(__dirname, 'server.ts');
    if (!fs.existsSync(serverTsPath)) {
      throw new Error("server.ts not found at root!");
    }
    const serverTs = fs.readFileSync(serverTsPath, 'utf8');

    // Helper to find exact string boundaries
    function getVariableContent(varName, nextMarker) {
      const decl = `const ${varName} = \``;
      const startIndex = serverTs.indexOf(decl);
      if (startIndex === -1) {
        throw new Error(`Could not find declaration for ${varName} in server.ts`);
      }
      const nextIndex = serverTs.indexOf(nextMarker, startIndex);
      if (nextIndex === -1) {
        throw new Error(`Could not find next marker [${nextMarker}] for ${varName} in server.ts`);
      }
      let content = serverTs.substring(startIndex + decl.length, nextIndex);
      // Clean up closing backtick and semicolon at the end
      content = content.trim();
      if (content.endsWith('`;')) {
        content = content.slice(0, -2);
      }
      return content;
    }

    const appPyContent = getVariableContent('appPyContent', 'const requirementsContent = `');
    const requirementsContent = getVariableContent('requirementsContent', 'const runBatContent = `');
    const runBatContent = getVariableContent('runBatContent', 'const indexHtmlContent = `');
    const indexHtmlContent = getVariableContent('indexHtmlContent', 'const readmeContent = `');
    
    // For readmeContent, it is followed by zip.file("README.md", readmeContent); or zip.file(
    const readmeContent = getVariableContent('readmeContent', 'zip.file("README.md", readmeContent);');

    console.log("Successfully extracted all 5 files from server.ts!");
    console.log(`- app.py: ${appPyContent.length} chars`);
    console.log(`- requirements.txt: ${requirementsContent.length} chars`);
    console.log(`- run.bat: ${runBatContent.length} chars`);
    console.log(`- index.html: ${indexHtmlContent.length} chars`);
    console.log(`- README.md: ${readmeContent.length} chars`);

    // 1. Write to local python-tools/ folder so user has individual files if they want
    const pythonToolsDir = path.join(__dirname, 'python-tools');
    if (!fs.existsSync(pythonToolsDir)) {
      fs.mkdirSync(pythonToolsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(pythonToolsDir, 'app.py'), appPyContent);
    fs.writeFileSync(path.join(pythonToolsDir, 'requirements.txt'), requirementsContent);
    fs.writeFileSync(path.join(pythonToolsDir, 'run.bat'), runBatContent);
    fs.writeFileSync(path.join(pythonToolsDir, 'index.html'), indexHtmlContent);
    fs.writeFileSync(path.join(pythonToolsDir, 'README.md'), readmeContent);
    console.log("Saved individual files to ./python-tools/");

    // 2. Generate zip archive buffer
    const zip = new JSZip();
    zip.file("app.py", appPyContent);
    zip.file("requirements.txt", requirementsContent);
    zip.file("run.bat", runBatContent);
    zip.file("index.html", indexHtmlContent);
    zip.file("README.md", readmeContent);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // 3. Save zip to public/ and dist/
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    fs.writeFileSync(path.join(publicDir, 'XML_Invoice_Downloader_Local.zip'), zipBuffer);
    fs.writeFileSync(path.join(distDir, 'XML_Invoice_Downloader_Local.zip'), zipBuffer);
    console.log("Wrote XML_Invoice_Downloader_Local.zip to ./public/ and ./dist/");

    // 4. Generate client-side downloader file src/lib/pythonToolGen.ts for browser-side ZIP compilation
    const srcLibDir = path.join(__dirname, 'src', 'lib');
    if (!fs.existsSync(srcLibDir)) {
      fs.mkdirSync(srcLibDir, { recursive: true });
    }

    // Since we write strings with backticks, let's escape backticks inside files so JS doesn't break
    const escapeStr = (str) => {
      return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    };

    const clientTsContent = `// Tệp này được tự động tạo bởi build-zip.cjs. Vui lòng không sửa thủ công.
import JSZip from "jszip";

export const generateAndDownloadPythonZip = async (addLog: (msg: string, type?: "info" | "success" | "warning" | "error") => void) => {
  addLog("Bắt đầu biên dịch tệp ZIP hoàn chỉnh trên trình duyệt (Client-side)...", "info");
  try {
    const zip = new JSZip();

    const appPyContent = \`${escapeStr(appPyContent)}\`;
    const requirementsContent = \`${escapeStr(requirementsContent)}\`;
    const runBatContent = \`${escapeStr(runBatContent)}\`;
    const indexHtmlContent = \`${escapeStr(indexHtmlContent)}\`;
    const readmeContent = \`${escapeStr(readmeContent)}\`;

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
`;

    fs.writeFileSync(path.join(srcLibDir, 'pythonToolGen.ts'), clientTsContent);
    console.log("Successfully generated src/lib/pythonToolGen.ts for browser execution!");

  } catch (error) {
    console.error("CRITICAL ERROR in build-zip.cjs:", error);
    process.exit(1);
  }
}

main();
