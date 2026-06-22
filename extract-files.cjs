const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function createZip() {
    const serverTs = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');

    function extractVariableContent(varName) {
        const regex = new RegExp(`const\\s+${varName}\\s*=\\s*\`([\\s\\S]*?)\`;`);
        const match = serverTs.match(regex);
        if (match) return match[1];
        return null;
    }

    const appPyContent = extractVariableContent('appPyContent');
    const requirementsContent = extractVariableContent('requirementsContent');
    const runBatContent = extractVariableContent('runBatContent');
    const indexHtmlContent = extractVariableContent('indexHtmlContent');
    const readmeContent = extractVariableContent('readmeContent');

    if (appPyContent && requirementsContent) {
        // Create root source folder
        const toolDir = path.join(__dirname, 'python-tools');
        if (!fs.existsSync(toolDir)) {
            fs.mkdirSync(toolDir);
        }
        fs.writeFileSync(path.join(toolDir, 'app.py'), appPyContent);
        fs.writeFileSync(path.join(toolDir, 'requirements.txt'), requirementsContent);
        fs.writeFileSync(path.join(toolDir, 'run.bat'), runBatContent);
        fs.writeFileSync(path.join(toolDir, 'index.html'), indexHtmlContent);
        fs.writeFileSync(path.join(toolDir, 'README.md'), readmeContent);

        // Create public ZIP for static download
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir);
        }
        
        const zip = new JSZip();
        zip.file("app.py", appPyContent);
        zip.file("requirements.txt", requirementsContent);
        zip.file("run.bat", runBatContent);
        zip.file("index.html", indexHtmlContent);
        zip.file("README.md", readmeContent);

        const content = await zip.generateAsync({ type: "nodebuffer" });
        fs.writeFileSync(path.join(publicDir, 'XML_Invoice_Downloader_Local.zip'), content);
        
        console.log("Successfully created python-tools/ folder and public/XML_Invoice_Downloader_Local.zip!");
    } else {
        console.error("Could not extract files");
    }
}

createZip();
