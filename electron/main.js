const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = process.env.NODE_ENV === 'development';

// Allow using the custom protocol inside the renderer (images, fetch, etc.)
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

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
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
    const indexHtml = path.join(__dirname, '..', 'out', 'index.html');
    mainWindow.loadFile(indexHtml);
  }
};

app.whenReady().then(() => {
  registerLocalResourceProtocol();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
