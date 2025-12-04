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

const restoreApi = () => {
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, apiPath);
  }
};

try {
  // Clean previous artifacts
  for (const dir of ['.next', 'out']) {
    fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  }
  if (fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { recursive: true, force: true });
  }

  // Temporarily remove API routes for static export
  fs.renameSync(apiPath, backupPath);

  // Build static Next.js output for Electron
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
