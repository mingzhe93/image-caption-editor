const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SidecarManager } = require('./sidecar');

const isDev = process.env.NODE_ENV === 'development';

// Ensure userData is stable across versions/releases so cached downloads persist.
const stableUserData = path.join(app.getPath('appData'), 'Image Caption Editor');
app.setPath('userData', stableUserData);

// Allow using custom protocols inside the renderer (images, app assets, etc.)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-resource',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Resolve an optional path input, defaulting to the user's home directory
const resolveDir = (dirPath) => {
  if (!dirPath) return os.homedir();
  return dirPath;
};

const listDirectories = async (dirPath) => {
  const target = resolveDir(dirPath);
  const items = await fs.promises.readdir(target, { withFileTypes: true });
  const directories = items
    .filter((item) => item.isDirectory() && !item.name.startsWith('.'))
    .map((item) => item.name);

  return {
    path: target,
    parent: path.dirname(target),
    directories,
  };
};

const listFiles = async (dirPath) => {
  const target = resolveDir(dirPath);
  const files = await fs.promises.readdir(target);
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

  const imageFiles = files.filter((file) => imageExtensions.includes(path.extname(file).toLowerCase()));
  return imageFiles.map((imageFile) => {
    const ext = path.extname(imageFile);
    const baseName = path.basename(imageFile, ext);
    const textFile = `${baseName}.txt`;
    const hasTextFile = files.includes(textFile);

    return {
      image: imageFile,
      text: hasTextFile ? textFile : null,
      baseName,
    };
  });
};

const readCaption = async (filePath) => {
  try {
    await fs.promises.access(filePath);
  } catch {
    return '';
  }

  return fs.promises.readFile(filePath, 'utf-8');
};

const saveCaption = (filePath, content) => fs.promises.writeFile(filePath, content, 'utf-8');

const registerIpcHandlers = () => {
  ipcMain.handle('get-dirs', async (_event, dirPath) => {
    try {
      return await listDirectories(dirPath);
    } catch (error) {
      console.error('get-dirs failed', error);
      return { error: 'Failed to read directory' };
    }
  });

  ipcMain.handle('get-files', async (_event, dirPath) => {
    if (!dirPath) return { error: 'Path is required' };
    try {
      const files = await listFiles(dirPath);
      return { files };
    } catch (error) {
      console.error('get-files failed', error);
      return { error: 'Failed to read directory' };
    }
  });

  ipcMain.handle('read-caption', async (_event, filePath) => {
    if (!filePath) return { error: 'Path is required' };
    try {
      const content = await readCaption(filePath);
      return { content };
    } catch (error) {
      console.error('read-caption failed', error);
      return { error: 'Failed to read file' };
    }
  });

  ipcMain.handle('save-caption', async (_event, payload) => {
    const { path: filePath, content } = payload || {};
    if (!filePath) return { error: 'Path is required' };
    try {
      await saveCaption(filePath, content ?? '');
      return { success: true };
    } catch (error) {
      console.error('save-caption failed', error);
      return { error: 'Failed to write file' };
    }
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    try {
      return await listDirectories(result.filePaths[0]);
    } catch (error) {
      console.error('select-folder failed', error);
      return { error: 'Failed to read directory' };
    }
  });
};

const registerCaptionerIpc = (sidecar) => {
  ipcMain.handle('captioner:get-status', async () => sidecar.getStatus());
  ipcMain.handle('captioner:start', async (_event, options) => sidecar.start(options));
  ipcMain.handle('captioner:stop', async () => sidecar.stop());
  ipcMain.handle('captioner:install-accel', async (_event, preferredBackend) =>
    sidecar.installAcceleration(preferredBackend)
  );
  ipcMain.handle('captioner:install-backend', async (_event, preferredBackend) =>
    sidecar.ensureBackendOnly(preferredBackend)
  );
  ipcMain.handle('captioner:download-model', async (_event, payload) =>
    sidecar.downloadModel(payload?.modelUrl, payload?.mmprojUrl)
  );
  ipcMain.handle('captioner:clear-cache', async () => sidecar.clearCache());
  ipcMain.handle('captioner:open-cache', async () => sidecar.openCacheFolder(shell));
};

const registerLocalResourceProtocol = () => {
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    try {
      const urlObj = new URL(request.url);
      const queryPath = urlObj.searchParams.get('path');

      let filePath = queryPath
        ? decodeURIComponent(queryPath)
        : decodeURIComponent(urlObj.pathname);

      // Handle legacy/absolute style: /C:/path or C:/path
      if (process.platform === 'win32') {
        // Remove leading slash before drive letter (e.g., /C:/foo -> C:/foo)
        if (filePath.startsWith('/') && /^[A-Za-z]:/.test(filePath.slice(1))) {
          filePath = filePath.slice(1);
        }
      }

      const normalizedPath = path.normalize(filePath);
      callback({ path: normalizedPath });
    } catch (error) {
      console.error('local-resource protocol failed', error);
      callback({ error });
    }
  });
};

// Serve the exported Next.js app from a custom protocol so deep links map to the correct index.html
const registerAppProtocol = () => {
  if (isDev) return; // dev uses localhost
  const distPath = path.normalize(path.join(__dirname, '..', 'out'));

  protocol.registerFileProtocol('app', (request, callback) => {
    try {
      const url = new URL(request.url);
      let relPath = decodeURIComponent(url.pathname || '/');

      // Remove leading slash so path.join does not drop distPath on Windows
      if (relPath.startsWith('/')) {
        relPath = relPath.slice(1);
      }

      const resolvePath = (candidate) => {
        const normalized = path.normalize(path.join(distPath, candidate));
        if (!normalized.startsWith(distPath)) {
          throw new Error('Invalid app path');
        }
        return normalized;
      };

      let targetPath = resolvePath(relPath);

      // If the target is a directory or missing, fall back to index.html so nested routes still work
      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        // Append index.html for folder-style paths
        targetPath = resolvePath(path.join(relPath || '.', 'index.html'));
        // If still missing (e.g., unexpected path), fall back to root index.html
        if (!fs.existsSync(targetPath)) {
          targetPath = resolvePath('index.html');
        }
      }

      callback({ path: targetPath });
    } catch (error) {
      console.error('app protocol failed', error);
      callback({ error });
    }
  });
};

const getIconPath = () => {
  const iconName = 'image_caption_edit.ico';
  if (app.isPackaged) {
    const direct = path.join(process.resourcesPath, iconName);
    if (fs.existsSync(direct)) return direct;
    const nested = path.join(process.resourcesPath, 'public', iconName);
    if (fs.existsSync(nested)) return nested;
  }
  return path.join(__dirname, '..', 'public', iconName);
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Use custom protocol so nested routes (e.g., /captioner/) resolve inside the packaged app
    mainWindow.loadURL('app://-/');
  }
};

let sidecar;

app.whenReady().then(() => {
  sidecar = new SidecarManager(app);
  registerLocalResourceProtocol();
  registerAppProtocol();
  registerIpcHandlers();
  registerCaptionerIpc(sidecar);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (sidecar) {
    sidecar.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
