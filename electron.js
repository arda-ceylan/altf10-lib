const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const os = require('os');

// --- CONFIG ---
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const historyPath = path.join(userDataPath, 'compress_history.json');
let currentLibraryPath = path.join(os.homedir(), 'Videos');
let compressionHistory = [];

const log = (msg) => console.log(msg);

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath);
      const config = JSON.parse(data);
      if (config.libraryPath && fs.existsSync(config.libraryPath)) {
        currentLibraryPath = config.libraryPath;
      }
    }
  } catch (e) { log("Config load error: " + e); }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ libraryPath: currentLibraryPath }));
  } catch (e) { log("Config save error: " + e); }
}

function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      const data = fs.readFileSync(historyPath);
      compressionHistory = JSON.parse(data);
    } else {
      compressionHistory = [];
    }
  } catch (e) { log("History load error: " + e); }
}

function addToHistory(filePath) {
  try {
    if (!compressionHistory.includes(filePath)) {
      compressionHistory.push(filePath);
      fs.writeFileSync(historyPath, JSON.stringify(compressionHistory));
    }
  } catch (e) { log("History save error: " + e); }
}

loadConfig();
loadHistory();

let ffmpegPath, ffprobePath;

if (app.isPackaged) {
  const appPath = path.dirname(app.getPath('exe'));
  
  ffmpegPath = path.join(appPath, 'ffmpeg.exe');
  ffprobePath = path.join(appPath, 'ffprobe.exe');
  
} else {
  try {
    ffmpegPath = require('ffmpeg-static');
    ffprobePath = require('ffprobe-static').path;
  } catch (err) {
    ffmpegPath = path.join(__dirname, 'ffmpeg.exe');
    ffprobePath = path.join(__dirname, 'ffprobe.exe');
  }
}

const CACHE_PATH = path.join(userDataPath, 'thumbnails');
if (!fs.existsSync(CACHE_PATH)) fs.mkdirSync(CACHE_PATH, { recursive: true });

let mainWindow;
let currentFFmpegProcess = null;
let isCompressionCancelled = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "AltF10 Library",
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173').catch(e => log(e));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.maximize();
  mainWindow.show();
}

// --- IPC HANDLERS ---
ipcMain.handle('get-library-path', () => currentLibraryPath);

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Library Folder'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    currentLibraryPath = result.filePaths[0];
    saveConfig();
    return currentLibraryPath;
  }
  return null;
});

ipcMain.handle('clear-thumbnail-cache', async () => {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const files = fs.readdirSync(CACHE_PATH);
      for (const file of files) {
        if (file.endsWith('.jpg')) {
          fs.unlinkSync(path.join(CACHE_PATH, file));
        }
      }
      return { success: true };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-categories', async () => {
  if (!fs.existsSync(currentLibraryPath)) return [];
  return fs.readdirSync(currentLibraryPath, { withFileTypes: true })
           .filter(d => d.isDirectory())
           .map(d => d.name);
});

ipcMain.handle('get-videos', async (event, categoryName) => {
  const categoryPath = path.join(currentLibraryPath, categoryName);
  if (!fs.existsSync(categoryPath)) return [];
  
  const files = fs.readdirSync(categoryPath);
  
  return files.map(file => {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(categoryPath, file);
    const fileUrl = `file://${fullPath.replace(/\\/g, '/')}`;
    const thumbPath = path.join(CACHE_PATH, file + '.jpg');
    const thumbUrl = fs.existsSync(thumbPath) ? `file://${thumbPath.replace(/\\/g, '/')}` : null;

    if (['.mp4', '.mkv', '.avi', '.webm'].includes(ext)) {
      return { ad: file, type: 'video', video_url: fileUrl, thumbnail_url: thumbUrl, fullPath };
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      return { ad: file, type: 'image', video_url: fileUrl, thumbnail_url: fileUrl };
    }
    return null;
  }).filter(Boolean);
});

ipcMain.handle('save-thumbnail-from-browser', async (event, { fileName, base64Data }) => {
  try {
    const data = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(data, 'base64');
    const thumbPath = path.join(CACHE_PATH, fileName + '.jpg');
    fs.writeFileSync(thumbPath, buffer);
    return { success: true, path: `file://${thumbPath.replace(/\\/g, '/')}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Rename
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
ipcMain.handle('rename-file', async (event, { categoryName, oldName, newName }) => {
    try {
        const dirPath = path.join(currentLibraryPath, categoryName);
        const oldPath = path.join(dirPath, oldName);
        const ext = path.extname(oldName);
        const finalNewName = newName.replace(ext, '') + ext;
        const newPath = path.join(dirPath, finalNewName);
        
        for (let i = 0; i < 10; i++) { 
          try { 
            await fs.promises.rename(oldPath, newPath); 
            const oldThumb = path.join(CACHE_PATH, oldName + '.jpg');
            const newThumb = path.join(CACHE_PATH, finalNewName + '.jpg');
            
            if (compressionHistory.includes(oldPath)) {
                compressionHistory = compressionHistory.filter(p => p !== oldPath);
                addToHistory(newPath);
            }

            if (fs.existsSync(oldThumb)) try { fs.renameSync(oldThumb, newThumb); } catch(e){}
            return { success: true, newName: finalNewName }; 
          } 
          catch (error) { 
            if (error.code === 'EBUSY' || error.code === 'EPERM') { await sleep(500); continue; } 
            else throw error; 
          }
        }
        throw new Error("FILE_LOCKED");
    } catch (error) { return { success: false, error: error.message }; }
});

function getVideoHeight(filePath) {
  return new Promise((resolve) => {
    execFile(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=height',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], (error, stdout) => {
      if (error) return resolve(1080);
      const height = parseInt(stdout.trim());
      resolve(isNaN(height) ? 1080 : height);
    });
  });
}

function compressVideo(inputPath, tempPath, ffmpegArgs) {
  return new Promise((resolve, reject) => {
    const finalArgs = ['-hwaccel', 'auto', '-i', inputPath, ...ffmpegArgs, '-y', tempPath];
    
    currentFFmpegProcess = spawn(ffmpegPath, finalArgs, { env: process.env });

    currentFFmpegProcess.stderr.on('data', (data) => {
       console.log(`FFmpeg: ${data}`)
    });

    currentFFmpegProcess.on('close', (code) => {
      currentFFmpegProcess = null;
      if (isCompressionCancelled) resolve(false);
      else resolve(code === 0);
    });
    
    currentFFmpegProcess.on('error', () => {
        currentFFmpegProcess = null;
        resolve(false);
    });
  });
}

ipcMain.on('cancel-compression', () => {
  isCompressionCancelled = true;
  if (currentFFmpegProcess) {
    try {
      currentFFmpegProcess.kill('SIGKILL');
    } catch (e) {
    }
  }
});

ipcMain.handle('compress-videos', async (event, { scope, categoryName, codecType, singleFilePath }) => {
  try {
    loadHistory();
    isCompressionCancelled = false;

    let filesToProcess = [];
    
    if (scope === 'single' && singleFilePath) {
        if (fs.existsSync(singleFilePath)) {
            const dir = path.dirname(singleFilePath);
            const name = path.basename(singleFilePath);
            filesToProcess.push({ name: name, dir: dir, fullPath: singleFilePath });
        }
    } 
    else if (scope === 'category' && categoryName) {
      const dirPath = path.join(currentLibraryPath, categoryName);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv'));
        files.forEach(f => filesToProcess.push({ name: f, dir: dirPath, fullPath: path.join(dirPath, f) }));
      }
    } else {
      const categories = fs.readdirSync(currentLibraryPath, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const cat of categories) {
        const dirPath = path.join(currentLibraryPath, cat.name);
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv'));
        files.forEach(f => filesToProcess.push({ name: f, dir: dirPath, fullPath: path.join(dirPath, f) }));
      }
    }

    if (filesToProcess.length === 0) return { success: true, message: "No videos found." };

    const tempDir = path.join(app.getPath('temp'), 'altf10_compression');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      if (isCompressionCancelled) break;

      const file = filesToProcess[i];
      
      if (compressionHistory.includes(file.fullPath)) {
        skippedCount++;
        mainWindow.webContents.send('compression-progress', {
          current: i + 1,
          total: filesToProcess.length,
          currentFile: `${file.name} (Atlandı - Zaten Yapılmış)`
        });
        continue;
      }

      mainWindow.webContents.send('compression-progress', {
        current: i + 1,
        total: filesToProcess.length,
        currentFile: file.name
      });

      const height = await getVideoHeight(file.fullPath);
      let baseQ = 32; 
      if (height > 1200) baseQ += 2; 
      if (height > 1700) baseQ += 4; 

      let encoder = "av1_nvenc";
      let qualityParam = "-cq";
      let finalQ = baseQ;
      let args = [];

      if (codecType === 'CPU') {
         encoder = "libx264";
         qualityParam = "-crf";
         finalQ = baseQ - 6; 
         args = ["-c:v", encoder, "-preset", "slow", "-tune", "film", "-crf", finalQ.toString(), "-g", "120", "-bf", "3", "-c:a", "copy"];
      } else {
        let bFrameValue = "7";
        switch (codecType) {
          case 'AV1': encoder = "av1_nvenc"; finalQ = baseQ; bFrameValue = "7"; break;
          case 'HEVC': encoder = "hevc_nvenc"; finalQ = baseQ - 4; bFrameValue = "5"; break;
          case 'H264': encoder = "h264_nvenc"; finalQ = baseQ - 8; bFrameValue = "3"; break;
        }

        args = [
          "-c:v", encoder, "-preset", "p7", "-rc", "vbr",
          qualityParam, finalQ.toString(), "-b:v", "0",
          "-bf", bFrameValue,
          "-rc-lookahead", "32", "-spatial-aq", "1", "-temporal-aq", "1", "-g", "120",
          "-c:a", "copy"
        ];
        
        if (codecType !== 'H264') args.push("-multipass", "fullres");
      }

      const tempFile = path.join(tempDir, `temp_${file.name}`);
      const success = await compressVideo(file.fullPath, tempFile, args);

      if (isCompressionCancelled) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        break;
      }

      if (success) {
        try {
          fs.unlinkSync(file.fullPath);
          fs.renameSync(tempFile, file.fullPath);
          successCount++;
          addToHistory(file.fullPath); 
        } catch (e) { failCount++; }
      } else {
        failCount++;
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.log("Temp cleanup error: " + cleanupError);
    }

    return { success: true, processed: successCount, failed: failCount, skipped: skippedCount, cancelled: isCompressionCancelled };

  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);

      const fileName = path.basename(filePath);
      const thumbPath = path.join(CACHE_PATH, fileName + '.jpg');
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }

      if (compressionHistory.includes(filePath)) {
         compressionHistory = compressionHistory.filter(p => p !== filePath);
         fs.writeFileSync(historyPath, JSON.stringify(compressionHistory));
      }

      return { success: true };
    } else {
      return { success: false, error: "File not found" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });