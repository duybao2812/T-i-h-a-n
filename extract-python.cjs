const fs = require('fs');

const serverTs = fs.readFileSync('./server.ts', 'utf8');

const extractRegex = /const appPyContent = `([^`]+)`;[\s\S]+const requirementsContent = `([^`]+)`;[\s\S]+const runBatContent = `([^`]+)`;[\s\S]+const indexHtmlContent = `([^`]+)`;[\s\S]+const readmeContent = `([^`]+)`;/;

const match = serverTs.match(extractRegex);

if (match) {
    const tsCode = `import JSZip from "jszip";

export const generatePythonZip = async () => {
  const zip = new JSZip();

  const appPyContent = \`${match[1]}\`;
  const requirementsContent = \`${match[2]}\`;
  const runBatContent = \`${match[3]}\`;
  const indexHtmlContent = \`${match[4]}\`;
  const readmeContent = \`${match[5]}\`;

  zip.file("app.py", appPyContent);
  zip.file("requirements.txt", requirementsContent);
  zip.file("run.bat", runBatContent);
  zip.file("index.html", indexHtmlContent);
  zip.file("README.md", readmeContent);

  const content = await zip.generateAsync({ type: "blob" });
  
  // Trigger download
  const url = window.URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = "XML_Invoice_Downloader_Local.zip";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
`;
    if (!fs.existsSync('./src/lib')) {
        fs.mkdirSync('./src/lib', { recursive: true });
    }
    fs.writeFileSync('./src/lib/pythonToolGen.ts', tsCode);
    console.log("Successfully created src/lib/pythonToolGen.ts !");
} else {
    console.error("Could not match the content blocks in server.ts");
}
