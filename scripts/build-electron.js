const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const apiPath = path.join(root, 'src', 'app', 'api');
const backupPath = path.join(root, 'api_temp_backup');

const run = (cmd, extraEnv = {}) => {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
};

const ensureCleanDir = (target) => {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
};

const backupApi = () => {
  if (!fs.existsSync(apiPath)) return;
  ensureCleanDir(backupPath);
  try {
    fs.renameSync(apiPath, backupPath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EXDEV') {
      fs.cpSync(apiPath, backupPath, { recursive: true });
      ensureCleanDir(apiPath);
    } else {
      throw err;
    }
  }
};

const restoreApi = () => {
  if (!fs.existsSync(backupPath)) return;
  ensureCleanDir(apiPath);
  try {
    fs.renameSync(backupPath, apiPath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EXDEV') {
      fs.cpSync(backupPath, apiPath, { recursive: true });
      ensureCleanDir(backupPath);
    } else {
      throw err;
    }
  }
};

try {
  // Clean previous artifacts
  for (const dir of ['.next', 'out']) {
    ensureCleanDir(path.join(root, dir));
  }
  ensureCleanDir(backupPath);

  // Temporarily remove API routes for static export
  backupApi();

  // Build static Next.js output for Electron (output: 'export' in next.config)
  run('npx next build', { BUILD_TARGET: 'electron' });

  // Restore API directory for dev/web usage
  restoreApi();

  // Forward any extra args to electron-builder (e.g., --win)
  const builderArgs = process.argv.slice(2).join(' ');
  run(`npx electron-builder ${builderArgs}`.trim());
} catch (error) {
  restoreApi();
  console.error(error);
  process.exit(1);
}
