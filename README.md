# Image Caption Editor

A desktop application to view and edit image captions. This is a hobby project built for fun (I got too triggered opening images and caption pairs manually) with help from AI tools.

## Features
-   **Local File Access**: Reads images and text files directly from your local file system.
-   **Folder Picker**: Built-in directory browser to easily select your image folder.
-   **Auto-Save**: Automatically saves your changes when you navigate to the next or previous image.
-   **Quick Jump**: Enter a pair number and jump directly to it without clicking Next hundreds of times.
-   **Cross-Platform Shortcuts**:
    -   **Save**: `Ctrl+S` or `Cmd+S`
    -   **Next**: `Ctrl+Right` or `Cmd+Right`
    -   **Previous**: `Ctrl+Left` or `Cmd+Left`
-   **Standalone Desktop App**: Runs as a native desktop application without requiring terminal commands.
-   **Optional Local Captioner (desktop only)**: Download-and-run a local llama.cpp sidecar, choose CPU/GPU backend, download models, send a test caption request (with image upload support), and caption the currently open image directly from the editor.
-   **Session Restore**: Remembers your last folder and image index so you can resume where you left off.

## Tech Stack

This project is built using modern web technologies wrapped in Electron:

-   **Framework**: [Next.js 15](https://nextjs.org/) (React) - For the UI and component architecture.
-   **Desktop Wrapper**: [Electron](https://www.electronjs.org/) - To package the web app as a native desktop executable.
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) - For rapid, modern styling.
-   **Build Tool**: [electron-builder](https://www.electron.build/) - For creating cross-platform installers (DMG, EXE).
-   **State Management**: React Hooks (`useState`, `useEffect`, `useCallback`).
-   **File System**: Node.js `fs` module (via Electron IPC) for direct local file access.

## For Non-Technical Users - Quick Start

**Download the pre-built application (once distributed):**
1.  Download the `.dmg` file (Mac), `.exe` file (Windows).
2.  Install/Run the application.
3.  Use the "Browse" button to select your image folder.
4.  Edit captions and they'll auto-save when you navigate.

## For Developers

### Development Mode
To run the app in development mode (with hot reload):

```bash
# First time setup
npm install

# Run development server
npm run electron:dev
```

This will start both the Next.js development server and launch the Electron window.

### Building Standalone Executable

#### Build for Windows (from Windows)
```bash
npm run dist:win
```
This uses Next.js `output: export` (configured in `next.config.js`) during `next build`, then packages the app from the generated `out/` folder - no separate `next export` step is needed.

#### Build for Both Mac and Windows (from Mac)
```bash
# Prerequisites (one-time setup for Windows builds on Mac)
brew install --cask wine-stable

# Build for both platforms
npm run dist -- --mac --win
```

#### Build for Current OS Only
```bash
npm run dist
```

> Note: macOS artifacts (`.dmg`, `.zip`) must be built on macOS. Windows cannot produce Mac binaries.

### Distribution Files

After building, you'll find these files in the `dist/` folder:

#### For Mac Users
-   **`Image Caption Editor-2.0.0-arm64.dmg`** - Mac installer (recommended)
    -   Double-click to install
    -   Installs to Applications folder
-   **`Image Caption Editor-2.0.0-arm64-mac.zip`** - Portable Mac app
    -   Extract and run directly
    -   No installation needed

#### For Windows Users
-   **`Image Caption Editor Setup 2.0.0.exe`** - Windows installer (recommended)
    -   Double-click to install
    -   Creates Start Menu shortcuts
-   **`Image Caption Editor 2.0.0.exe`** - Portable executable
    -   Run directly without installation
    -   Useful for USB drives or restricted environments

**Note:** `.blockmap` files in the `dist/` folder are for auto-updates and can be safely ignored/deleted for manual distribution.

### Web Mode (Optional)

You can still run this as a web app if needed:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

**Note**: In web mode, you'll need to keep the terminal running, and API routes will be used instead of Electron IPC. The local captioner/sidecar is desktop-only and not available in web mode.

## Usage
1.  Launch the application
2.  Click **Browse** to select the folder containing your images and text files
3.  Make sure each image has a matching text file with the same base name (e.g., `photo_001.jpg` + `photo_001.txt`). Supported image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`.
4.  View images and edit their captions
5.  Changes are saved automatically on navigation or manually via the Save button

### Auto-captioner (preview, desktop only)
-   Open the "Auto Captioning Sidecar" page in the desktop app.
-   Choose a backend (CPU or GPU; downloads are cached and reused even after shutdown).
-   Download a model preset or provide your own model/mmproj URLs.
-   Start the server and run a test caption (supports attaching an image; optional external base URL/API key/system prompt in Advanced settings).
-   Logs and progress are shown to help debug backend/model downloads and server startup.

Future plan: integrate the sidecar to iteratively caption images in the selected folder.

## Roadmap
- Whole-folder captioning job (bulk run through the local captioner sidecar).

## Project Structure
-   `electron/` - Electron main process and IPC handlers
-   `src/app/` - Next.js React frontend
-   `src/app/api/` - API routes (used in web mode only)
-   `out/` - Static export of Next.js app (generated during build)
-   `dist/` - Distributable applications (generated by electron-builder)
