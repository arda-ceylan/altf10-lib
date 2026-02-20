// Copyright 2026 Arda Ceylan
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

const { shell } = window.require('electron');

export default function AboutModal({ isOpen, onClose, language, t }) {
  if (!isOpen) return null;

  const openExternalLink = (e, url) => {
    e.preventDefault();
    shell.openExternal(url);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{t.aboutTitle || "AltF10 Library"}</h2>
        
        <div style={styles.infoBlock}>
          <p><strong>{t.version || "Version"}:</strong> 1.1.4</p>
          <p><strong>{t.developer || "Developer"}:</strong> Arda Ceylan</p>
          <p>
            <strong>{t.githubRepo || "GitHub"}:</strong>{' '}
            <a 
              href="#" 
              onClick={(e) => openExternalLink(e, 'https://github.com/arda-ceylan/altf10-lib')}
              style={styles.link}
            >
              github.com/arda-ceylan/altf10-lib
            </a>
          </p>
        </div>

        <hr style={styles.divider} />

        <div style={styles.licenseSection}>
          <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>{t.licenseTitle || "License"}</h3>
          <p style={styles.text}>{t.licenseApache}</p>
          <p style={styles.text}>
            <strong>FFmpeg:</strong> {t.licenseFFmpeg}{' '}
            <a href="#" onClick={(e) => openExternalLink(e, 'https://ffmpeg.org')} style={styles.link}>
              ffmpeg.org
            </a>
          </p>
        </div>

        <div style={{ textAlign: 'right', marginTop: '20px' }}>
          <button onClick={onClose} style={styles.button}>
            {t.closeBtn || "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: '#1e1e1e',
    color: '#ffffff',
    padding: '30px',
    borderRadius: '8px',
    width: '550px',
    maxWidth: '90%',
    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
    fontFamily: 'sans-serif'
  },
  infoBlock: {
    lineHeight: '1.6',
    fontSize: '15px'
  },
  divider: {
    borderColor: '#333',
    margin: '20px 0'
  },
  licenseSection: {
    fontSize: '14px',
    color: '#cccccc',
    lineHeight: '1.5'
  },
  text: {
    marginBottom: '10px'
  },
  link: {
    color: '#61dafb',
    textDecoration: 'none',
    cursor: 'pointer'
  },
  button: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};