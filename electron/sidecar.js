const fs = require('fs');
const path = require('path');
const net = require('net');
const https = require('https');
const { spawn, execFile } = require('child_process');
const extractZip = require('extract-zip');

const SERVER_BIN = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
const CLI_BIN = process.platform === 'win32' ? 'llama-cli.exe' : 'llama-cli';

const USER_AGENT = 'image-caption-editor';

const waitForClose = (child) =>
  new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }
    child.on('close', () => resolve());
    child.on('exit', () => resolve());
  });

class SidecarManager {
  constructor(app) {
    this.app = app;
    this.child = null;
    this.state = {
      running: false,
      backend: 'cpu',
      status: 'idle',
      port: null,
      baseURL: null,
      binDir: null,
      message: null,
      error: null,
      source: null,
      tag: null,
      progress: null,
      downloadedModel: null,
      downloadedMmproj: null,
      logs: [],
    };
    this.cacheRoot = path.join(this.app.getPath('userData'), 'llama', 'sidecar');
    this.modelsRoot = path.join(this.app.getPath('userData'), 'llama', 'models');
  }

  async getStatus() {
    return this.state;
  }

  appendLog(chunk) {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const maxLines = 200;
    const next = [...(this.state.logs || []), ...lines];
    const trimmed = next.length > maxLines ? next.slice(next.length - maxLines) : next;
    this.state = { ...this.state, logs: trimmed };
  }

  setProgress(progress) {
    this.state = { ...this.state, progress };
    return this.state;
  }

  async clearCache() {
    try {
      // stop running server before deleting files
      if (this.child) {
        await this.stop();
      }

      if (fs.existsSync(this.cacheRoot)) {
        fs.rmSync(this.cacheRoot, { recursive: true, force: true });
      }
      if (fs.existsSync(this.modelsRoot)) {
        fs.rmSync(this.modelsRoot, { recursive: true, force: true });
      }

      this.state = {
        ...this.state,
        downloadedModel: null,
        downloadedMmproj: null,
        binDir: null,
        message: 'Cleared downloaded backends and models',
        logs: [],
      };
      return { success: true, message: 'Cleared downloads' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async openCacheFolder(shell) {
    try {
      fs.mkdirSync(this.cacheRoot, { recursive: true });
      const result = await shell.openPath(this.cacheRoot);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true, path: this.cacheRoot };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getBackendChain(preferred, force) {
    if (force) {
      return [force];
    }
    const platform = process.platform;
    let baseChain = ['cpu'];

    if (platform === 'win32') {
      baseChain = ['cuda', 'vulkan', 'cpu'];
    } else if (platform === 'darwin') {
      baseChain = process.arch === 'arm64' ? ['metal', 'cpu'] : ['cpu'];
    }

    if (!preferred) {
      return baseChain;
    }

    const ordered = [preferred, ...baseChain];
    return [...new Set(ordered)]; // dedupe while preserving order
  }

  getCachedBackends(backend) {
    const dirs = [];
    if (!fs.existsSync(this.cacheRoot)) return dirs;
    const tags = fs.readdirSync(this.cacheRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const tag of tags) {
      const candidate = path.join(this.cacheRoot, tag.name, backend);
      if (fs.existsSync(candidate)) {
        dirs.push(candidate);
      }
    }
    return dirs;
  }

  async detectBestBackend() {
    const platform = process.platform;

    if (platform === 'win32') {
      // Prefer already-cached CUDA if present
      const cachedCuda = this.getCachedBackends('cuda');
      if (cachedCuda.length > 0) return 'cuda';

      let hasCuda = await this.commandExists('nvidia-smi');
      if (!hasCuda) {
        const alt = 'C:\\\\Windows\\\\System32\\\\nvidia-smi.exe';
        if (fs.existsSync(alt)) {
          hasCuda = await this.commandExists(alt);
        }
      }
      return hasCuda ? 'cuda' : 'vulkan';
    }

    if (platform === 'darwin') {
      return process.arch === 'arm64' ? 'metal' : 'cpu';
    }

    return 'cpu';
  }

  async commandExists(command) {
    try {
      await execFileAsync(command, ['--help'], { timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  }

  async start(options = {}) {
    const chain = this.getBackendChain(
      options.preferredBackend || (await this.detectBestBackend()),
      options.forceBackend
    );
    let lastError = null;
    this.state = { ...this.state, status: 'starting', message: null, error: null };

    for (const backend of chain) {
      let ensured;
      if (options.useExisting) {
        if (!this.state.binDir || this.state.backend !== backend) {
          lastError = `Backend ${backend} not installed yet`;
          continue;
        }
        ensured = {
          ok: true,
          backend,
          binDir: this.state.binDir,
          serverPath: await this.findBinary(this.state.binDir, SERVER_BIN),
          cliPath: await this.findBinary(this.state.binDir, CLI_BIN),
          source: this.state.source,
          tag: this.state.tag,
          message: 'Using installed backend',
        };
      } else {
        ensured = await this.ensureBackend(backend);
      }
      if (!ensured.ok) {
        lastError = ensured.error;
        continue;
      }

      const verified = await this.verifyBackend(ensured.binDir, backend, ensured.cliPath);
      if (!verified.ok) {
        lastError = verified.error;
        continue;
      }

      const port = options.port || (await this.findFreePort());
      const serverPath = ensured.serverPath || (await this.findBinary(ensured.binDir, SERVER_BIN));
      const modelPath = options.modelPath || this.state.downloadedModel;
      const mmprojPath = options.mmprojPath || this.state.downloadedMmproj;
      const started = await this.launchServer(serverPath, port, modelPath, mmprojPath);
      if (!started.ok) {
        lastError = started.error;
        continue;
      }

      this.state = {
        running: true,
        backend,
        status: 'running',
        port,
        baseURL: `http://127.0.0.1:${port}/v1`,
        binDir: ensured.binDir,
        message: verified.message || started.message || ensured.message || `Running on ${backend}`,
        error: null,
        source: ensured.source,
        tag: ensured.tag,
        progress: null,
      };
      return this.state;
    }

    this.state = {
      ...this.state,
      running: false,
      status: 'error',
      baseURL: null,
      port: null,
      message: null,
      error: lastError || 'No backend succeeded',
    };
    return this.state;
  }

  async stop() {
    if (!this.child) {
      this.state = { ...this.state, running: false, status: 'stopped', baseURL: null, port: null };
      return this.state;
    }

    const child = this.child;
    this.child = null;
    child.kill();
    await waitForClose(child);
    this.state = { ...this.state, running: false, status: 'stopped', baseURL: null, port: null };
    return this.state;
  }

  async installAcceleration(preferredBackend) {
    const chain = this.getBackendChain(preferredBackend).filter((b) => b !== 'cpu');
    let lastError = null;

    for (const backend of chain) {
      const ensured = await this.ensureAcceleration(backend);
      if (ensured.ok) {
        return {
          success: true,
          backend,
          binDir: ensured.binDir,
          tag: ensured.tag,
          source: ensured.source,
          message: ensured.message || `Installed assets for ${backend}`,
        };
      }
      lastError = ensured.error;
    }

    return { success: false, error: lastError || 'No acceleration backend available' };
  }

  async ensureBackend(backend) {
    return this.ensureAcceleration(backend);
  }

  async ensureBackendOnly(preferredBackend) {
    const chain = this.getBackendChain(preferredBackend || (await this.detectBestBackend()), preferredBackend);
    let lastError = null;
    for (const backend of chain) {
      const ensured = await this.ensureBackend(backend);
      if (ensured.ok) {
        this.state = {
          ...this.state,
          backend: backend,
          status: 'idle',
          message: ensured.message || `Backend ${backend} ready`,
          source: ensured.source,
          tag: ensured.tag,
          binDir: ensured.binDir,
        };
        return { success: true, backend, binDir: ensured.binDir, message: this.state.message };
      }
      lastError = ensured.error;
    }
    return { success: false, error: lastError || 'No backend available' };
  }

  async ensureAcceleration(backend) {
    // Try cached backends first
    const candidates = this.getCachedBackends(backend);
    for (const candidate of candidates) {
      const serverPath = await this.findBinary(candidate, SERVER_BIN);
      if (serverPath) {
        const cliPath = await this.findBinary(candidate, CLI_BIN);
        return {
          ok: true,
          backend,
          binDir: path.dirname(serverPath),
          serverPath,
          cliPath,
          source: 'download',
          tag: path.basename(path.dirname(candidate)),
          message: `Using cached ${backend} backend`,
        };
      }
    }

    const release = await this.fetchReleaseMeta();
    if (!release.ok) {
      return { ok: false, error: release.error };
    }
    return this.downloadBackendAssets(backend, release.data);
  }

  async fetchReleaseMeta() {
    const url = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
    return new Promise((resolve) => {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/vnd.github+json',
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            https
              .get(res.headers.location, { headers: { 'User-Agent': USER_AGENT } }, (redirectRes) => {
                this.consumeReleaseResponse(redirectRes, resolve);
              })
              .on('error', (err) => resolve({ ok: false, error: err.message }));
            return;
          }
          this.consumeReleaseResponse(res, resolve);
        }
      );

      req.on('error', (err) => resolve({ ok: false, error: err.message }));
    });
  }

  consumeReleaseResponse(res, resolve) {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk.toString();
    });
    res.on('end', () => {
      if (res.statusCode !== 200) {
        resolve({ ok: false, error: `Release metadata failed (${res.statusCode})` });
        return;
      }
      try {
        const data = JSON.parse(body);
        resolve({ ok: true, data });
      } catch (err) {
        resolve({ ok: false, error: 'Invalid release metadata' });
      }
    });
  }

  assetMatchersForBackend(backend) {
    const platform = process.platform;
    if (backend === 'cpu') {
      if (platform === 'win32') {
        return [
          /llama-.*-bin-win-cpu-.*x64\.zip$/i,
          /llama-.*-bin-win-.*x64\.zip$/i, // fallback naming (avx/avx2)
        ];
      }
      if (platform === 'darwin') {
        return [/llama-.*-bin-macos-.*\.zip$/i];
      }
      return [
        /llama-.*-bin-linux-.*x64\.zip$/i,
        /llama-.*-bin-linux-.*\.zip$/i,
      ];
    }
    if (backend === 'cuda' && platform === 'win32') {
      return [
        /llama-.*-bin-win-cuda-.*x64\.zip$/i,
        /cudart-llama-.*-bin-win-cuda-.*x64\.zip$/i,
      ];
    }
    if (backend === 'vulkan' && platform === 'win32') {
      return [/llama-.*-bin-win-vulkan-.*x64\.zip$/i];
    }
    if (backend === 'metal' && platform === 'darwin') {
      return [/llama-.*-bin-macos-.*\.zip$/i];
    }
    return [];
  }

  async downloadBackendAssets(backend, release) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const patterns = this.assetMatchersForBackend(backend);
    if (!patterns.length) {
      return { ok: false, error: `No asset matcher for backend ${backend}` };
    }

    const selected = patterns
      .map((regex) => assets.find((asset) => regex.test(asset.name)))
      .filter(Boolean);

    if (selected.length !== patterns.length) {
      return { ok: false, error: `Required assets for ${backend} not found in latest release` };
    }

    const tag = release?.tag_name || 'latest';
    const destDir = path.join(this.cacheRoot, tag, backend);
    fs.mkdirSync(destDir, { recursive: true });

    const existingServer = await this.findBinary(destDir, SERVER_BIN);
    if (existingServer) {
      const cliPath = await this.findBinary(destDir, CLI_BIN);
      return {
        ok: true,
        backend,
        binDir: path.dirname(existingServer),
        serverPath: existingServer,
        cliPath,
        source: 'download',
        tag,
        message: `Using cached ${backend} backend (${tag})`,
      };
    }

    for (const asset of selected) {
      const zipPath = path.join(destDir, asset.name);
      this.setProgress({ label: `Downloading ${asset.name}`, loaded: 0, total: 0 });
      await this.downloadFile(asset.browser_download_url, zipPath, `Downloading ${asset.name}`);
      this.setProgress({ label: `Extracting ${asset.name}`, loaded: 0, total: 0 });
      await this.extractZip(zipPath, destDir);
    }

    this.setProgress(null);

    const serverPath = await this.findBinary(destDir, SERVER_BIN);
    const cliPath = await this.findBinary(destDir, CLI_BIN);
    if (!serverPath) {
      const entries = fs.readdirSync(destDir, { withFileTypes: true }).map((e) => e.name).join(', ');
      return { ok: false, error: `Downloaded assets for ${backend} but could not find ${SERVER_BIN}. Entries: ${entries}` };
    }
    const assetList = selected.map((a) => a.name).join(', ');

    return {
      ok: true,
      backend,
      binDir: path.dirname(serverPath),
      serverPath,
      cliPath,
      source: 'download',
      tag,
      message: `Downloaded ${backend} assets (${assetList}) to ${destDir}`,
    };
  }

  downloadFile(url, destPath, label) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const updateProgress = (loaded, total) => {
        this.setProgress({ label, loaded, total });
      };

      const handleResponse = (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          this.downloadFile(response.headers.location, destPath, label).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        const total = parseInt(response.headers['content-length'] || '0', 10) || 0;
        let loaded = 0;
        response.on('data', (chunk) => {
          loaded += chunk.length;
          if (total) updateProgress(loaded, total);
        });
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            updateProgress(total || loaded, total || loaded);
            resolve();
          });
        });
      };

      https
        .get(url, { headers: { 'User-Agent': USER_AGENT } }, handleResponse)
        .on('error', (err) => {
          fs.rmSync(destPath, { force: true });
          reject(err);
        });
    });
  }

  extractZip(zipPath, destDir) {
    // Use extract-zip for reliable cross-platform unzip
    return extractZip(zipPath, { dir: destDir }).then(() => {
      const entries = fs.readdirSync(destDir);
      if (entries.length <= 0) {
        throw new Error('Extraction produced no files');
      }
    });
  }

  async verifyBackend(binDir, backend, cliPath) {
    if (backend === 'cpu') {
      return { ok: true, message: 'CPU backend ready' };
    }

    const cli = cliPath || (await this.findBinary(binDir, CLI_BIN));
    if (!cli) {
      return { ok: false, error: `Missing ${CLI_BIN} for verification` };
    }

    return new Promise((resolve) => {
      const child = spawn(cli, ['--list-devices'], { cwd: binDir });
      let output = '';
      child.stdout.on('data', (d) => (output += d.toString()));
      child.stderr.on('data', (d) => (output += d.toString()));
      child.on('close', (code) => {
        if (code !== 0) {
          resolve({ ok: false, error: `${CLI_BIN} exited with code ${code}` });
          return;
        }

        const normalized = output.toLowerCase();
        if (backend === 'cuda' && !normalized.includes('cuda')) {
          resolve({ ok: false, error: 'CUDA device not detected; falling back' });
          return;
        }
        if (backend === 'vulkan' && !normalized.includes('vulkan')) {
          resolve({ ok: false, error: 'Vulkan device not detected; falling back' });
          return;
        }
        if (backend === 'metal' && !normalized.includes('metal')) {
          resolve({ ok: false, error: 'Metal device not detected; falling back' });
          return;
        }

        resolve({ ok: true, message: `Verified ${backend} backend` });
      });
    });
  }

  async launchServer(serverPath, port, modelPath, mmprojPath) {
    if (!serverPath || !fs.existsSync(serverPath)) {
      return { ok: false, error: `llama-server binary missing at ${serverPath}` };
    }

    if (!modelPath) {
      return { ok: false, error: 'Model path is required to start the captioner' };
    }
    const modelIsRemote = /^https?:\/\//i.test(modelPath);
    if (!modelIsRemote && !fs.existsSync(modelPath)) {
      return { ok: false, error: `Model file not found: ${modelPath}` };
    }

    const mmprojIsRemote = mmprojPath ? /^https?:\/\//i.test(mmprojPath) : false;
    if (mmprojPath && !mmprojIsRemote && !fs.existsSync(mmprojPath)) {
      return { ok: false, error: `mmproj file not found: ${mmprojPath}` };
    }

    if (this.child) {
      await this.stop();
    }

    this.state = { ...this.state, logs: [] };
    const args = ['--host', '127.0.0.1', '--port', String(port), '--model', modelPath];
    if (mmprojPath) {
      args.push('--mmproj', mmprojPath);
    }
    const child = spawn(serverPath, args, {
      cwd: path.dirname(serverPath),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => this.appendLog(d));
    child.stderr.on('data', (d) => this.appendLog(d));

    this.child = child;
    return { ok: true, message: 'llama-server started' };
  }

  async findBinary(rootDir, binaryName) {
    if (!rootDir || !fs.existsSync(rootDir)) return null;
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase()) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = await this.findBinary(fullPath, binaryName);
        if (nested) return nested;
      }
    }
    return null;
  }

  findFreePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address();
        srv.close(() => resolve(port));
      });
      srv.on('error', (err) => {
        reject(err);
      });
    });
  }

  async downloadModel(modelUrl, mmprojUrl) {
    if (!modelUrl) {
      throw new Error('Model URL is required');
    }
    fs.mkdirSync(this.modelsRoot, { recursive: true });

    const downloadOne = async (url) => {
      const parsed = new URL(url);
      const name = path.basename(parsed.pathname);
      const dest = path.join(this.modelsRoot, name);
      if (fs.existsSync(dest)) {
        return dest;
      }
      this.setProgress({ label: `Downloading ${name}`, loaded: 0, total: 0 });
      await this.downloadFile(url, dest, `Downloading ${name}`);
      return dest;
    };

    const result = {};
    result.modelPath = await downloadOne(modelUrl);
    if (mmprojUrl) {
      result.mmprojPath = await downloadOne(mmprojUrl);
    }

    this.setProgress(null);
    this.state = {
      ...this.state,
      downloadedModel: result.modelPath,
      downloadedMmproj: result.mmprojPath || null,
      message: 'Model download complete',
    };
    return result;
  }
}

const execFileAsync = (cmd, args, options) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });

module.exports = { SidecarManager };
