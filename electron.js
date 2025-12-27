const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process'); 
const os = require('os');

// ▼▼▼ CONFIG (AYAR) SİSTEMİ ▼▼▼
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

// Varsayılan kütüphane yolu (İlk açılış için)
let currentLibraryPath = path.join(os.homedir(), 'Videos'); 

// Ayarları Yükle
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath);
      const config = JSON.parse(data);
      if (config.libraryPath && fs.existsSync(config.libraryPath)) {
        currentLibraryPath = config.libraryPath;
      }
    }
  } catch (e) { console.error("Config yüklenemedi:", e); }
}

// Ayarları Kaydet
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ libraryPath: currentLibraryPath }));
  } catch (e) { console.error("Config kaydedilemedi:", e); }
}

// Program başlarken ayarları oku
loadConfig();

// --- LOGLAMA ---
const logPath = path.join(os.homedir(), 'Desktop', 'altf10_debug_log.txt');
const log = (message) => {
  /* Loglama kodları aynı kalabilir veya kaldırabilirsin */
};

// --- FFMPEG ---
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
} catch (err) {}

// Cache Yolu
const CACHE_PATH = path.join(userDataPath, 'thumbnails');
if (!fs.existsSync(CACHE_PATH)) fs.mkdirSync(CACHE_PATH, { recursive: true });

let mainWindow; 
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "AltF10 Kütüphanesi",
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false 
    }
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173').catch(e => console.log(e));
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
  
  mainWindow.maximize();
  mainWindow.show();
}

// ▼▼▼ YENİ: KLASÖR SEÇME İŞLEMLERİ ▼▼▼

// 1. Mevcut yolu gönder
ipcMain.handle('get-library-path', () => currentLibraryPath);

// 2. Yeni klasör seç ve kaydet
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Kütüphane Klasörünü Seç'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    currentLibraryPath = result.filePaths[0];
    saveConfig(); // Yeni yolu kaydet
    return currentLibraryPath;
  }
  return null;
});

// --- DİĞER FONKSİYONLAR (Artık currentLibraryPath kullanıyor) ---

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
    
    // Thumbnail yolu (Basit: dosyaadi.ext.jpg)
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

// Rename (İnatçı Mod)
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
            
            // Eğer thumbnail varsa onun da adını değiştir ki kaybolmasın
            const oldThumb = path.join(CACHE_PATH, oldName + '.jpg');
            const newThumb = path.join(CACHE_PATH, finalNewName + '.jpg');
            if (fs.existsSync(oldThumb)) {
                try { fs.renameSync(oldThumb, newThumb); } catch(e){}
            }

            return { success: true, newName: finalNewName }; 
          } 
          catch (error) { 
            if (error.code === 'EBUSY' || error.code === 'EPERM') { await sleep(500); continue; } 
            else throw error; 
          }
        }
        throw new Error("Dosya kilitli (Program veya başka bir şey kullanıyor).");
    } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('clear-thumbnail-cache', async () => {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const files = fs.readdirSync(CACHE_PATH);
      
      // Sadece .jpg dosyalarını sil (Güvenlik önlemi)
      for (const file of files) {
        if (file.endsWith('.jpg')) {
          fs.unlinkSync(path.join(CACHE_PATH, file));
        }
      }
      return { success: true };
    }
    return { success: true }; // Klasör yoksa zaten temizdir
  } catch (error) {
    console.error("Cache temizleme hatası:", error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });