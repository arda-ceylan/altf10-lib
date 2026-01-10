import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import './App.css';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

//Dictionary
const TRANSLATIONS = {
  tr: {
    appTitle: "AltF10 Kütüphanesi",
    back: "← Geri",
    changeFolder: "📂 Değiştir",
    clearCacheTitle: "Önbelleği Temizle",
    catNotFound: "Kategori Bulunamadı",
    catNotFoundDesc: "Seçilen konumda herhangi bir klasör bulunamadı.",
    folderEmptyTitle: "Bu Klasör Boş",
    folderEmptyDesc: "klasöründe hiç video veya resim bulunamadı.",
    renameTitle: "Yeniden Adlandır",
    cancel: "İptal",
    save: "Kaydet",
    saving: "Kaydediliyor...",
    warning: "Dikkat",
    cacheWarning: "Tüm önizleme resimleri (thumbnail) silinecek ve videolara girdiğinde baştan oluşturulacak. Onaylıyor musun?",
    confirmClear: "Evet, Temizle",
    cacheCleared: "Önbellek başarıyla temizlendi!",
    selectFolder: "Lütfen sağ üstten video klasörünüzü seçin.",
    fileLocked: "Dosya şu an kilitli. Lütfen dosyayı kullanan diğer programları kapatın.",
    deleteTitle: "Videoyu Sil",
    deleteConfirm: "Bu dosyayı kalıcı olarak silmek istediğinize emin misiniz?",
    deleteBtn: "🗑️ Sil",
    deleting: "Siliniyor...",
    
    // Sıkıştırma Çevirileri
    compressBtn: "⚡ Sıkıştır",
    compressTitle: "Sıkıştırma İşlemi",
    compressSettingsTitle: "Sıkıştırma Ayarları",
    codecLabel: "Video Kodeği Seçin:",
    startBtn: "İşlemi Başlat",
    cancelBtn: "İptal Et",
    stopBtn: "🛑 Durdur",
    processing: "İşleniyor:",
    compressDesc: "Lütfen bekleyin, bilgisayarınızı kapatmayın.",
    compressSuccess: "İşlem Tamamlandı!",
    compressStopped: "İşlem Durduruldu!",
    compressResult: "başarılı, başarısız.",
    skipped: "Atlandı (Zaten Yapılmış)",
    codecNote: "Not: AV1 (RTX 40+), HEVC (GTX 900+), H.264 (Tüm Kartlar).",
    preparing: "Hazırlanıyor...",
    errorTitle: "Hata",
    unknownError: "Bilinmeyen bir hata oluştu.",
    okeyBtn: "Tamam"
  },
  en: {
    appTitle: "AltF10 Library",
    back: "← Back",
    changeFolder: "📂 Change",
    clearCacheTitle: "Clear Cache",
    catNotFound: "No Categories Found",
    catNotFoundDesc: "No folders were found in the selected path.",
    folderEmptyTitle: "Folder is Empty",
    folderEmptyDesc: "No videos or images found in",
    renameTitle: "Rename File",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    warning: "Warning",
    cacheWarning: "All thumbnail images will be deleted and regenerated when you enter a folder. Do you confirm?",
    confirmClear: "Yes, Clear",
    cacheCleared: "Cache cleared successfully!",
    selectFolder: "Please select your video folder from the top right.",
    fileLocked: "File is locked. Please close other programs using this file.",
    deleteTitle: "Delete Video",
    deleteConfirm: "Are you sure you want to delete this file permanently?",
    deleteBtn: "🗑️ Delete",
    deleting: "Deleting...",
    
    // Compression Translations
    compressBtn: "⚡ Compress",
    compressTitle: "Compression Process",
    compressSettingsTitle: "Compression Settings",
    codecLabel: "Select Video Codec:",
    startBtn: "Start Process",
    cancelBtn: "Cancel",
    stopBtn: "🛑 Stop",
    processing: "Processing:",
    compressDesc: "Please wait, do not turn off your PC.",
    compressSuccess: "Process Completed!",
    compressStopped: "Process Stopped!",
    compressResult: "succeeded, failed.",
    skipped: "Skipped (Already Done)",
    codecNote: "Note: AV1 (RTX 40+), HEVC (GTX 900+), H.264 (All Cards).",
    preparing: "Preparing...",
    errorTitle: "Error",
    unknownError: "An unknown error occurred.",
    okeyBtn: "Okey"
  }
};

function App() {
  const [view, setView] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [libraryPath, setLibraryPath] = useState('');
  
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, video: null, isDeleting: false });

  // Language State
  const [lang, setLang] = useState(() => localStorage.getItem('appLanguage') || 'en');
  const t = TRANSLATIONS[lang];

  const [categories, setCategories] = useState([]);
  const [videos, setVideos] = useState([]);
  
  const [hoveredVideo, setHoveredVideo] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null); 
  
  const [renameModal, setRenameModal] = useState({ isOpen: false, video: null, newName: '', isSaving: false, error: null });
  const [cacheModal, setCacheModal] = useState(false);
  
  // Compression States
  const [settingsModal, setSettingsModal] = useState(false);
  const [selectedCodec, setSelectedCodec] = useState('AV1');
  const [singleCompressTarget, setSingleCompressTarget] = useState(null);
  const [compressModal, setCompressModal] = useState({ 
    isOpen: false, current: 0, total: 0, currentFile: '', isFinished: false, result: null 
  });

  const hiddenVideoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const hoverTimeout = useRef(null); 
  const gridRef = useRef(null);
  const scrollPos = useRef(0);

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('appVolume');
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  // --- INITIALIZATION ---
  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.invoke('get-library-path').then(path => {
        setLibraryPath(path);
        refreshCategories();
      });

      const handleProgress = (event, data) => {
        setCompressModal(prev => ({ 
          ...prev, 
          isOpen: true, 
          current: data.current, 
          total: data.total, 
          currentFile: data.currentFile 
        }));
      };
      
      ipcRenderer.on('compression-progress', handleProgress);
      return () => { ipcRenderer.removeListener('compression-progress', handleProgress); };
    }
  }, []);

  useLayoutEffect(() => {
    if (view === 'videos' && videos.length > 0) {
      const timer = setTimeout(() => {
        if (gridRef.current) {
          gridRef.current.scrollTo({ top: scrollPos.current, behavior: 'auto' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [view, videos]);

  const refreshCategories = () => {
    ipcRenderer.invoke('get-categories').then(setCategories).catch(console.error);
  };

  const changeLanguage = (selectedLang) => {
    setLang(selectedLang);
    localStorage.setItem('appLanguage', selectedLang);
  };

  const handleChangeFolder = async () => {
    if (ipcRenderer) {
      const newPath = await ipcRenderer.invoke('select-folder');
      if (newPath) {
        setLibraryPath(newPath);
        handleBack();
        refreshCategories();
      }
    }
  };

  const handleBack = () => {
    setView('categories');
    setSelectedCategory(null);
    setVideos([]);
    setProcessingQueue([]);
    setIsProcessing(false);
  };

  const handleCategoryClick = async (category) => {
    setSelectedCategory(category);
    setView('videos');
    setVideos([]);
    setProcessingQueue([]);
    setIsProcessing(false);
    scrollPos.current = 0;

    if (ipcRenderer) {
      const vids = await ipcRenderer.invoke('get-videos', category);
      setVideos(vids);
      const missing = vids.filter(v => v.type === 'video' && !v.thumbnail_url);
      setProcessingQueue(missing);
    }
  };

  const confirmClearCache = async () => {
    setCacheModal(false);
    if (ipcRenderer) {
      await ipcRenderer.invoke('clear-thumbnail-cache');
      alert(t.cacheCleared);
      if (view === 'videos' && selectedCategory) {
        setVideos(prev => prev.map(v => ({...v, thumbnail_url: null})));
        setProcessingQueue([]);
        const freshVideos = await ipcRenderer.invoke('get-videos', selectedCategory);
        setVideos(freshVideos);
        const allVideos = freshVideos.filter(v => v.type === 'video');
        setProcessingQueue(allVideos);
      } else {
        setProcessingQueue([]);
        setIsProcessing(false);
      }
    }
  };

  const handleMediaClick = (media) => {
    if (gridRef.current) {
        scrollPos.current = gridRef.current.scrollTop;
    }
    setSelectedVideo(media);
  };

  const closePlayer = () => {
    const activeVideo = document.querySelector('.full-video');
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute('src');
      activeVideo.load();
    }
    setSelectedVideo(null);
  };

  const handleVolumeChange = (e) => {
    setVolume(e.target.volume);
    localStorage.setItem('appVolume', e.target.volume);
  };

  const handleMouseEnter = (index) => {
    hoverTimeout.current = setTimeout(() => setHoveredVideo(index), 400); 
  };
  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHoveredVideo(null);
  };

  useEffect(() => {
    if (processingQueue.length > 0 && !isProcessing) {
      setIsProcessing(true);
      const videoEl = hiddenVideoRef.current;
      if (videoEl) {
        videoEl.src = processingQueue[0].video_url;
        videoEl.currentTime = 5;
        videoEl.muted = true;
      }
    }
  }, [processingQueue, isProcessing]);

  const handleVideoSeeked = async () => {
    const videoEl = hiddenVideoRef.current;
    const canvasEl = hiddenCanvasRef.current;
    const videoToProcess = processingQueue[0];
    if (videoEl && canvasEl && videoToProcess) {
      try {
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, 320, 180);
        const dataUrl = canvasEl.toDataURL('image/jpeg', 0.8);
        const result = await ipcRenderer.invoke('save-thumbnail-from-browser', { fileName: videoToProcess.ad, base64Data: dataUrl });
        if (result.success) {
          setVideos(prev => prev.map(v => v.ad === videoToProcess.ad ? { ...v, thumbnail_url: result.path } : v));
        }
      } catch (e) {}
      videoEl.removeAttribute('src');
      videoEl.load();
      setProcessingQueue(prev => prev.slice(1));
      setIsProcessing(false);
    }
  };

  const handleCompress = () => {
    setSingleCompressTarget(null);
    setSettingsModal(true);
  };

  const handleCancelCompression = () => {
    ipcRenderer.send('cancel-compression');
  };

  const closeCompressModal = () => {
    setCompressModal({ isOpen: false, current: 0, total: 0, currentFile: '', isFinished: false, result: null });
  };

  // Single Compress
  const openSingleCompressSettings = (e, video) => {
    e.stopPropagation();
    setHoveredVideo(null);
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);

    setSingleCompressTarget(video);
    setSettingsModal(true);
  };

  const startCompression = async () => {
    setSettingsModal(false);

    setCompressModal({ 
      isOpen: true, 
      current: 0, 
      total: 0, 
      currentFile: t.preparing, 
      isFinished: false, 
      result: null 
    });

    let scope = 'all';
    let singleFilePath = null;

    if (singleCompressTarget) {
        scope = 'single';
        singleFilePath = singleCompressTarget.fullPath;
    } else if (view === 'videos' && selectedCategory) {
        scope = 'category';
    }

    const result = await ipcRenderer.invoke('compress-videos', { 
      scope, 
      categoryName: selectedCategory, 
      codecType: selectedCodec,
      singleFilePath
    });

    if (result.success) {
      let statusMsg = "";
      if (result.cancelled) {
          statusMsg = ` (${t.compressStopped})`;
      }

      setCompressModal(prev => ({ 
        ...prev, 
        isFinished: true, 
        result: `${result.processed} ${t.compressResult.split(',')[0]}, ${result.failed} ${t.compressResult.split(',')[1]} (${result.skipped} ${t.skipped})${statusMsg}` 
      }));

      if (view === 'videos' && selectedCategory) {
          const fresh = await ipcRenderer.invoke('get-videos', selectedCategory);
          setVideos(fresh);
      }
    } else {
      alert(t.errorTitle + ": " + result.error);
      setCompressModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const openRenameModal = (e, video) => {
    e.stopPropagation();
    setHoveredVideo(null);
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    
    document.querySelectorAll('video').forEach(v => { 
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e){} 
    });
    if (hiddenVideoRef.current) { hiddenVideoRef.current.removeAttribute('src'); hiddenVideoRef.current.load(); }
    setIsProcessing(false);

    setTimeout(() => {
      setRenameModal({ isOpen: true, video, newName: video.ad.split('.').slice(0, -1).join('.'), isSaving: false, error: null });
    }, 200);
  };

  const saveRename = async () => {
    const { video, newName } = renameModal;
    if (!newName.trim()) return;
    setRenameModal(prev => ({ ...prev, isSaving: true }));
    const result = await ipcRenderer.invoke('rename-file', { categoryName: selectedCategory, oldName: video.ad, newName: newName });
    if (result.success) {
      const fresh = await ipcRenderer.invoke('get-videos', selectedCategory);
      setVideos(fresh);
      setRenameModal(prev => ({ ...prev, isOpen: false }));
    } else {
      let errorMsg = result.error;
      if (errorMsg.includes("FILE_LOCKED") || errorMsg.includes("EBUSY")) errorMsg = t.fileLocked;
      setRenameModal(prev => ({ ...prev, isSaving: false, error: errorMsg }));
    }
  };

  const openDeleteModal = (e, video) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, video: video, isDeleting: false });
  };

  const confirmDelete = async () => {
    if (!deleteModal.video) return;
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));

    const result = await ipcRenderer.invoke('delete-file', deleteModal.video.fullPath);

    if (result.success) {
      setVideos(prev => prev.filter(v => v.fullPath !== deleteModal.video.fullPath));
      setDeleteModal({ isOpen: false, video: null, isDeleting: false });
    } else {
      alert(t.errorTitle + ": " + result.error);
      setDeleteModal(prev => ({ ...prev, isDeleting: false }));
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        {view === 'videos' && <button className="back-btn" onClick={handleBack}>{t.back}</button>}
        <h1>{t.appTitle}</h1>
        <div className="path-selector">
          <span className="current-path" title={libraryPath}>
            {libraryPath.length > 25 ? '...' + libraryPath.slice(-25) : libraryPath}
          </span>
          <button className="change-folder-btn" onClick={handleChangeFolder} title={t.changeFolder}>📂</button>
          <button className="clear-cache-btn" onClick={() => setCacheModal(true)} title={t.clearCacheTitle}>🗑️</button>
          <button className="compress-btn" onClick={handleCompress} title={t.compressBtn}>⚡</button>
        </div>
      </header>

      <main className="content">
        {view === 'categories' ? (
          categories.length > 0 ? (
            <div className="category-grid">
              {categories.map((cat, i) => (
                <div key={i} className="category-card" onClick={() => handleCategoryClick(cat)}>
                  <div className="folder-icon">📁</div>
                  <h3>{cat}</h3>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <h3>{t.catNotFound}</h3>
              <p>{t.catNotFoundDesc} <strong>({libraryPath})</strong><br/>{t.selectFolder}</p>
            </div>
          )
        ) : (
          videos.length > 0 ? (
            <div className="video-grid" ref={gridRef}>
              {videos.map((vid, index) => {
                const isHovered = hoveredVideo === index;
                const isLast = selectedVideo && vid.ad === selectedVideo.ad;
                const cardClass = `video-card ${isLast ? 'last-watched' : ''}`;

                return (
                  <div key={index} className={cardClass} 
                       onClick={() => handleMediaClick(vid)}
                       onMouseEnter={() => handleMouseEnter(index)} 
                       onMouseLeave={handleMouseLeave}>
                    <div className="thumb-wrapper">
                      {vid.type === 'video' ? (
                        isHovered ? (
                          <video src={vid.video_url} autoPlay muted loop className="preview-video"/>
                        ) : (
                          vid.thumbnail_url ? <img src={vid.thumbnail_url} className="video-thumbnail"/> : <div className="video-placeholder">🎬</div>
                        )
                      ) : ( <img src={vid.video_url} className="video-thumbnail"/> )}

                      <div className="action-btn-group">
                          {vid.type === 'video' && (
                            <button className="mini-action-btn compress" onClick={(e) => openSingleCompressSettings(e, vid)} title={t.compressBtn}>⚡</button>
                          )}
                          <button className="mini-action-btn edit" onClick={(e) => openRenameModal(e, vid)} title={t.renameTitle}>✏️</button>
                          <button className="mini-action-btn delete" onClick={(e) => openDeleteModal(e, vid)} title={t.deleteBtn}>🗑️</button>
                      </div>
                    </div>
                    <div className="video-info">{vid.ad}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>{t.folderEmptyTitle}</h3>
              <p>{t.folderEmptyDesc} <strong>{selectedCategory}</strong></p>
            </div>
          )
        )}
      </main>

      {selectedVideo && (
        <div className="player-overlay">
          <div className="player-header">
             <button className="back-btn" onClick={closePlayer}>{t.back}</button>
             <h1>{selectedVideo.ad}</h1>
          </div>
          {selectedVideo.type === 'video' ? (
            <video src={selectedVideo.video_url} className="full-video" controls autoPlay ref={(el) => { if (el) el.volume = volume; }} onVolumeChange={handleVolumeChange}/>
          ) : ( <img src={selectedVideo.video_url} className="full-image" alt={selectedVideo.ad}/> )}
        </div>
      )}

      {renameModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>{t.renameTitle}</h3>
            <input className="modal-input" value={renameModal.newName} onChange={(e) => setRenameModal({...renameModal, newName: e.target.value})} />
            {renameModal.error && <div className="modal-error">{renameModal.error}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setRenameModal({...renameModal, isOpen: false})}>{t.cancel}</button>
              <button className="btn-save" onClick={saveRename}>{renameModal.isSaving ? t.saving : t.save}</button>
            </div>
          </div>
        </div>
      )}

      {cacheModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{width: '350px'}}>
            <h3 style={{color: '#ff6b6b', display:'flex', alignItems:'center', gap:'10px'}}>
              <span>⚠️</span> {t.warning}
            </h3>
            <p style={{color: '#ddd', marginBottom:'20px', lineHeight:'1.5'}}>{t.cacheWarning}</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCacheModal(false)}>{t.cancel}</button>
              <button className="btn-save" style={{background: '#d32f2f'}} onClick={confirmClearCache}>{t.confirmClear}</button>
            </div>
          </div>
        </div>
      )}

      {settingsModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>{t.compressSettingsTitle}</h3>
            <label style={{display:'block', marginBottom:'10px', color:'#ccc'}}>{t.codecLabel}</label>
            <select className="modal-select" value={selectedCodec} onChange={(e) => setSelectedCodec(e.target.value)}>
              <option value="AV1">AV1</option>
              <option value="HEVC">HEVC</option>
              <option value="H264">H.264</option>
              <option value="CPU">x264</option>
            </select>
            <p style={{fontSize:'12px', color:'#888', marginTop:'10px'}}>{t.codecNote}</p>
            <div className="modal-actions" style={{marginTop:'20px'}}>
              <button className="btn-cancel" onClick={() => setSettingsModal(false)}>{t.cancel}</button>
              <button className="compress-btn" onClick={startCompression}>{t.startBtn}</button>
            </div>
          </div>
        </div>
      )}

      {compressModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{textAlign:'center'}}>
            {!compressModal.isFinished ? (
              <>
                <h3 style={{color: '#ffd700'}}>{t.compressTitle}</h3>
                <div className="loader-spinner" style={{margin: '20px auto'}}></div>
                <p style={{wordBreak: 'break-all'}}>{t.processing} <br/><strong style={{color: '#fff'}}>{compressModal.currentFile}</strong></p>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{width: `${compressModal.total > 0 ? (compressModal.current / compressModal.total) * 100 : 0}%`}}></div>
                </div>
                <p style={{fontSize:'12px', color:'#888', marginTop:'5px'}}>{compressModal.current} / {compressModal.total}</p>
                <p style={{fontSize:'12px', color:'#ff6b6b', marginTop:'15px'}}>{t.compressDesc}</p>
                <button className="btn-cancel" style={{marginTop: '20px', width: '100%', border:'1px solid #d32f2f', color:'#ff8a80'}} onClick={handleCancelCompression}>{t.stopBtn}</button>
              </>
            ) : (
              <>
                <h3 style={{color: compressModal.result && compressModal.result.includes(t.compressStopped) ? '#ff6b6b' : '#4caf50'}}>
                   {compressModal.result && compressModal.result.includes(t.compressStopped) ? "⚠️ " + t.compressStopped : "✅ " + t.compressSuccess}
                </h3>
                <p style={{marginTop:'15px', lineHeight:'1.5'}}>{compressModal.result}</p>
                <button className="btn-save" onClick={closeCompressModal}>{t.okeyBtn}</button>
              </>
            )}
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 style={{color: '#ff6b6b'}}>{t.deleteTitle}</h3>
            <p style={{color: '#ddd', margin: '20px 0'}}>{t.deleteConfirm}</p>
            <div style={{background: '#111', padding: '10px', borderRadius: '5px', marginBottom: '20px', color: '#fff', fontSize: '13px', wordBreak: 'break-all'}}>
              {deleteModal.video.ad}
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setDeleteModal({ isOpen: false, video: null })}>{t.cancel}</button>
              <button className="btn-save" style={{background: '#d32f2f', color: 'white'}} onClick={confirmDelete}>
                {deleteModal.isDeleting ? t.deleting : t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'categories' && (
        <div className="language-selector">
          <button className={`lang-btn ${lang === 'tr' ? 'active' : ''}`} onClick={() => changeLanguage('tr')} title="Türkçe">🇹🇷</button>
          <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => changeLanguage('en')} title="English">🇬🇧</button>
        </div>
      )}

      <video ref={hiddenVideoRef} style={{ display: 'none' }} onSeeked={handleVideoSeeked} onError={() => setIsProcessing(false)} crossOrigin="anonymous"/>
      <canvas ref={hiddenCanvasRef} width="320" height="180" style={{ display: 'none' }} />
    </div>
  );
}

export default App;