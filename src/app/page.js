'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

function DirectoryPicker({ isOpen, onClose, onSelect }) {
  const [currentPath, setCurrentPath] = useState('');
  const [dirs, setDirs] = useState([]);
  const [parentPath, setParentPath] = useState('');
  const [loading, setLoading] = useState(false);

  const getParentPath = useCallback((p) => {
    if (!p) return '';
    const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const parts = normalized.split('/');
    if (parts.length <= 1) return normalized || '/';
    parts.pop();
    return parts.join('/') || '/';
  }, []);

  const loadDirs = useCallback(async (path) => {
    setLoading(true);
    try {
      // Check if running in Electron
      if (typeof window !== 'undefined' && window.electronAPI) {
        const data = await window.electronAPI.getDirs(path || '');
        if (!data.error) {
          setCurrentPath(data.path);
          setParentPath(data.parent || '');
          setDirs(data.directories);
        }
      } else {
        // Fallback to HTTP API for web mode
        const url = path ? `/api/dirs?path=${encodeURIComponent(path)}` : '/api/dirs';
        const res = await fetch(url);
        const data = await res.json();
        if (!data.error) {
          setCurrentPath(data.path);
          setParentPath(data.parent || '');
          setDirs(data.directories);
        }
      }
    } catch (err) {
      console.error('Failed to load dirs', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !currentPath) {
      loadDirs('');
    }
  }, [isOpen, currentPath, loadDirs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-xl border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-white">Select Folder</h2>
        <div className="mb-4 text-sm text-gray-400 break-all">
          Current: {currentPath}
        </div>
        <div className="flex-1 overflow-y-auto min-h-[300px] border border-gray-700 rounded bg-gray-900 p-2">
          {loading ? (
            <div className="text-gray-500 p-2">Loading...</div>
          ) : (
            <ul className="space-y-1">
              <li 
                className="p-2 hover:bg-gray-700 cursor-pointer text-blue-400"
                onClick={() => {
                  const nextPath = parentPath || getParentPath(currentPath);
                  if (nextPath) loadDirs(nextPath);
                }}
              >
                .. (Parent Directory)
              </li>
              {dirs.map(dir => (
                <li 
                  key={dir}
                  className="p-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                  onClick={() => loadDirs(`${currentPath === '/' ? '' : currentPath}/${dir}`)}
                >
                  <span className="text-yellow-500">📁</span> {dir}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button 
            onClick={() => { onSelect(currentPath); onClose(); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold"
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [directory, setDirectory] = useState('');
  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentCaption, setCurrentCaption] = useState('');
  const [jumpInput, setJumpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  
  // Track if caption has been modified to avoid unnecessary saves (optional, but good practice)
  // For this requirement "Auto save when there is a change", we can just save on nav.
  const captionRef = useRef(currentCaption);

  const normalizePath = useCallback((p) => {
    if (!p) return '';
    return p.replace(/\\/g, '/');
  }, []);

  useEffect(() => {
    captionRef.current = currentCaption;
  }, [currentCaption]);

  const loadFiles = useCallback(async (dir) => {
    if (!dir) return;
    setLoading(true);
    setStatus('Loading files...');
    try {
      let data;
      if (typeof window !== 'undefined' && window.electronAPI) {
        data = await window.electronAPI.getFiles(dir);
      } else {
        const res = await fetch(`/api/files?path=${encodeURIComponent(dir)}`);
        data = await res.json();
      }
      
      if (data.error) {
        setStatus(`Error: ${data.error}`);
      } else {
        setFiles(data.files);
        if (data.files.length > 0) {
          setCurrentIndex(0);
          setStatus(`Loaded ${data.files.length} pairs.`);
        } else {
          setStatus('No image files found.');
        }
      }
    } catch (err) {
      setStatus('Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCaption = useCallback(async (index) => {
    if (index < 0 || index >= files.length) return;
    const file = files[index];
    const textPath = `${normalizePath(directory)}/${file.baseName}.txt`;
    
    try {
      let data;
      if (typeof window !== 'undefined' && window.electronAPI) {
        data = await window.electronAPI.readCaption(textPath);
      } else {
        const res = await fetch(`/api/caption?path=${encodeURIComponent(textPath)}`);
        data = await res.json();
      }
      setCurrentCaption(data.content || '');
    } catch (err) {
      console.error('Error loading caption:', err);
    }
  }, [files, directory]);

  useEffect(() => {
    if (currentIndex >= 0) {
      loadCaption(currentIndex);
    }
  }, [currentIndex, loadCaption]);

  const saveCaption = async (index, caption) => {
    if (index < 0 || !files[index]) return;
    const file = files[index];
    const textPath = `${normalizePath(directory)}/${file.baseName}.txt`;

    setStatus('Saving...');
    try {
      let data;
      if (typeof window !== 'undefined' && window.electronAPI) {
        data = await window.electronAPI.saveCaption({ path: textPath, content: caption });
      } else {
        const res = await fetch('/api/caption', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: textPath, content: caption }),
        });
        data = await res.json();
      }
      
      if (data.success) {
        setStatus('Saved!');
        setTimeout(() => setStatus(''), 1000);
      } else {
        setStatus(`Save failed: ${data.error}`);
      }
    } catch (err) {
      setStatus('Save failed.');
    }
  };

  const handleNavigation = async (direction) => {
    // Auto-save current
    if (currentIndex >= 0) {
        await saveCaption(currentIndex, captionRef.current);
    }

    if (direction === 'next' && currentIndex < files.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleJump = async () => {
    const target = parseInt(jumpInput, 10);
    if (Number.isNaN(target)) {
      setStatus('Enter a valid number');
      return;
    }

    // Convert to zero-based index
    const nextIndex = target - 1;
    if (nextIndex < 0 || nextIndex >= files.length) {
      setStatus(`Enter a number between 1 and ${files.length}`);
      return;
    }

    if (currentIndex >= 0) {
      await saveCaption(currentIndex, captionRef.current);
    }
    setCurrentIndex(nextIndex);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+S or Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCaption(currentIndex, captionRef.current);
      }
      
      // Navigation with Auto-save
      // Support both Ctrl and Cmd for cross-platform
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNavigation('next');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleNavigation('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files]); // Dependencies

  const currentFile = files[currentIndex];

  return (
    <main className="h-screen p-8 bg-gray-900 text-gray-100 flex flex-col gap-6 overflow-hidden">
      <header className="flex gap-4 items-center bg-gray-800 p-4 rounded-lg shadow-md">
        <button
          onClick={() => setIsPickerOpen(true)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600"
        >
          📂 Browse
        </button>
        <input
          type="text"
          placeholder="Enter absolute directory path..."
          className="flex-1 p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadFiles(directory)}
        />
        <button
          onClick={() => loadFiles(directory)}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
      </header>

      <DirectoryPicker 
        isOpen={isPickerOpen} 
        onClose={() => setIsPickerOpen(false)}
        onSelect={(path) => {
          setDirectory(path);
          loadFiles(path);
        }}
      />

      {status && <div className="text-sm text-gray-400 text-center h-5">{status}</div>}

      {currentFile && (
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Image Viewer */}
          <div className="flex-1 min-h-0 bg-gray-800 rounded-lg flex items-center justify-center p-4 shadow-inner overflow-hidden relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                typeof window !== 'undefined' && window.electronAPI
                  ? `local-resource://file?path=${encodeURIComponent(`${normalizePath(directory)}/${currentFile.image}`)}`
                  : `/api/image?path=${encodeURIComponent(`${normalizePath(directory)}/${currentFile.image}`)}`
              }
              alt={currentFile.baseName}
              className="max-w-full max-h-full h-full object-contain"
            />
             <div className="absolute bottom-4 left-4 bg-black/50 px-2 py-1 rounded text-xs">
                {currentFile.image} ({currentIndex + 1}/{files.length})
             </div>
          </div>

          {/* Caption Editor */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <textarea
              className="flex-1 w-full p-4 bg-gray-800 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 resize-none font-mono text-lg leading-relaxed min-h-0"
              value={currentCaption}
              onChange={(e) => setCurrentCaption(e.target.value)}
              placeholder="Enter caption here..."
            />
            
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                  <button
                    onClick={() => handleNavigation('prev')}
                    disabled={currentIndex === 0}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
                  >
                    Previous (Ctrl/Cmd+Left)
                  </button>
                  <button
                    onClick={() => handleNavigation('next')}
                    disabled={currentIndex === files.length - 1}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
                  >
                    Next (Ctrl/Cmd+Right)
                  </button>
               </div>
               <div className="flex items-center gap-2">
                 <input
                   type="number"
                   min={1}
                   max={files.length || undefined}
                   value={jumpInput}
                   onChange={(e) => setJumpInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                   className="w-24 p-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
                   placeholder={files.length ? `1-${files.length}` : 'Jump to'}
                 />
                 <button
                   onClick={handleJump}
                   disabled={!files.length}
                   className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
                 >
                   Go
                 </button>
               </div>
               <button
                onClick={() => saveCaption(currentIndex, currentCaption)}
                className="px-8 py-2 bg-green-600 hover:bg-green-700 rounded font-bold shadow-lg"
               >
                 Save (Ctrl/Cmd+S)
               </button>
            </div>
          </div>
        </div>
      )}
      
      {!currentFile && files.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Select a directory to get started.
        </div>
      )}
    </main>
  );
}
