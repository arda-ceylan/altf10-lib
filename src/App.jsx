import { useState, useEffect, useRef } from 'react';
import './App.css';

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };

function App() {
  const [view, setView] = useState('categories');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [libraryPath, setLibraryPath] = useState('');
  
  const [categories, setCategories] = useState([]);
  const [videos, setVideos] = useState([]);
  
  const [hoveredVideo, setHoveredVideo] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null); 
  
  const [renameModal, setRenameModal] = useState({ isOpen: false, video: null, newName: '', isSaving: false, error: null });
  const [cacheModal, setCacheModal] = useState(false);

  const hiddenVideoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const hoverTimeout = useRef(null); 

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('appVolume');
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.invoke('get-library-path').then(path => {
        setLibraryPath(path);
        refreshCategories();
      });
    }
  }, []);

  const refreshCategories = () => {
    ipcRenderer.invoke('get-categories').then(setCategories).catch(console.error);
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

  const handleMediaClick = (media) => setSelectedVideo(media);
  const closePlayer = () => setSelectedVideo(null);
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

  const openRenameModal = (e, video) => {
    e.stopPropagation();
    setHoveredVideo(null);
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    document.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
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
      setRenameModal(prev => ({ ...prev, isSaving: false, error: result.error }));
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        {view === 'videos' && <button className="back-btn" onClick={handleBack}>← Geri</button>}
        
        <h1>AltF10 Kütüphanesi</h1>

        <div className="path-selector">
          <span className="current-path" title={libraryPath}>
            {libraryPath.length > 25 ? '...' + libraryPath.slice(-25) : libraryPath}
          </span>
          <button className="change-folder-btn" onClick={handleChangeFolder} title="Klasör Değiştir">📂</button>
          <button className="clear-cache-btn" onClick={() => setCacheModal(true)} title="Önbelleği Temizle">🗑️</button>
        </div>
      </header>

      <main className="content">
        {view === 'categories' ? (
          // ▼▼▼ KATEGORİ EKRANI ▼▼▼
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
            // KATEGORİ YOKSA GÖSTERİLECEK MESAJ
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <h3>Kategori Bulunamadı</h3>
              <p>
                Seçilen konumda <strong>({libraryPath})</strong> herhangi bir klasör bulunamadı.
                <br/>
                Lütfen sağ üstten video klasörünüzü seçin.
              </p>
            </div>
          )
        ) : (
          // ▼▼▼ VİDEO EKRANI ▼▼▼
          videos.length > 0 ? (
            <div className="video-grid">
              {videos.map((vid, index) => {
                const isHovered = hoveredVideo === index;
                return (
                  <div key={index} className="video-card" 
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
                      <button className="edit-btn" onClick={(e) => openRenameModal(e, vid)}>✏️</button>
                    </div>
                    <div className="video-info">{vid.ad}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            // VİDEO YOKSA GÖSTERİLECEK MESAJ
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>Bu Klasör Boş</h3>
              <p>
                <strong>{selectedCategory}</strong> klasöründe hiç video veya resim bulunamadı.
              </p>
            </div>
          )
        )}
      </main>

      {selectedVideo && (
        <div className="player-overlay">
          <div className="player-header">
             <button className="back-btn" onClick={closePlayer}>← Geri</button>
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
            <h3>Yeniden Adlandır</h3>
            <input className="modal-input" value={renameModal.newName} onChange={(e) => setRenameModal({...renameModal, newName: e.target.value})} />
            {renameModal.error && <div className="modal-error">{renameModal.error}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setRenameModal({...renameModal, isOpen: false})}>İptal</button>
              <button className="btn-save" onClick={saveRename}>{renameModal.isSaving ? '...' : 'Kaydet'}</button>
            </div>
          </div>
        </div>
      )}

      {cacheModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{width: '350px'}}>
            <h3 style={{color: '#ff6b6b', display:'flex', alignItems:'center', gap:'10px'}}>
              <span>⚠️</span> Dikkat
            </h3>
            <p style={{color: '#ddd', marginBottom:'20px', lineHeight:'1.5'}}>
              Tüm önizleme resimleri silinecek. Onaylıyor musun?
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCacheModal(false)}>İptal</button>
              <button className="btn-save" style={{background: '#d32f2f'}} onClick={confirmClearCache}>Evet, Temizle</button>
            </div>
          </div>
        </div>
      )}

      <video ref={hiddenVideoRef} style={{ display: 'none' }} onSeeked={handleVideoSeeked} onError={() => setIsProcessing(false)} crossOrigin="anonymous"/>
      <canvas ref={hiddenCanvasRef} width="320" height="180" style={{ display: 'none' }} />
    </div>
  );
}

export default App;