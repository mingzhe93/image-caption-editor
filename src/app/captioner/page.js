'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const defaultSystemPrompt =
  'Use this framework to describe images: Subject + Action + Style + Context\nSubject: The main focus (person, object, character)\nAction: What the subject is doing or their pose\nStyle: Artistic approach, medium, or aesthetic\nContext: Setting, lighting, time, mood, or atmospheric conditions';

const modelPresets = [
  {
    key: 'qwen-2b',
    name: 'Qwen3 Vision Caption 2B (default)',
    memory: 'CPU-friendly / 4GB+ RAM',
    note: 'Small, good captions; downloads directly from Hugging Face.',
    modelPath:
      'https://huggingface.co/prithivMLmods/Qwen3-VisionCaption-2B-GGUF/resolve/main/Qwen3-VisionCaption-2B.Q8_0.gguf?download=true',
    mmprojPath:
      'https://huggingface.co/prithivMLmods/Qwen3-VisionCaption-2B-GGUF/resolve/main/Qwen3-VisionCaption-2B.mmproj-q8_0.gguf?download=true',
  },
  {
    key: 'qwen3-vl-4b',
    name: 'Qwen3 VL 4B',
    memory: 'GPU 4–6GB VRAM recommended',
    note: 'Smaller vision-language model for mid-tier GPUs; downloads directly from Hugging Face.',
    modelPath:
      'https://huggingface.co/mradermacher/Qwen3-VL-4B-Instruct-abliterated-GGUF/resolve/main/Qwen3-VL-4B-Instruct-abliterated.Q4_K_M.gguf?download=true',
    mmprojPath:
      'https://huggingface.co/mradermacher/Qwen3-VL-4B-Instruct-abliterated-GGUF/resolve/main/Qwen3-VL-4B-Instruct-abliterated.mmproj-Q8_0.gguf?download=true',
  },
  {
    key: 'qwen3-vl-8b',
    name: 'Qwen3 VL 8B',
    memory: 'GPU 8–12GB VRAM recommended',
    note: 'Vision-language 8B; prefer GPU; downloads directly from Hugging Face.',
    modelPath:
      'https://huggingface.co/prithivMLmods/Qwen3-VL-8B-Abliterated-Caption-it-GGUF/resolve/main/Qwen3-VL-8B-Abliterated-Caption-it.i1-IQ4_XS.gguf?download=true',
    mmprojPath:
      'https://huggingface.co/prithivMLmods/Qwen3-VL-8B-Abliterated-Caption-it-GGUF/resolve/main/Qwen3-VL-8B-Abliterated-Caption-it.mmproj-Q8_0.gguf?download=true',
  },
];

const heuristicNotes = [
  'Windows: CUDA if nvidia-smi works, else Vulkan, else CPU.',
  'macOS: Metal on arm64, else CPU.',
  'Other platforms: CPU.',
];

const formatStatus = (status) => {
  if (!status) return 'Idle';
  if (status.running) return `Running (${status.backend})`;
  return status.status ? `Idle (${status.status})` : 'Idle';
};

export default function CaptionerPage() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(modelPresets[0].key);
  const [modelPath, setModelPath] = useState(modelPresets[0].modelPath);
  const [mmprojPath, setMmprojPath] = useState(modelPresets[0].mmprojPath);
  const [busy, setBusy] = useState(false);
  const [workingLabel, setWorkingLabel] = useState('');
  const [testPrompt, setTestPrompt] = useState('Describe the image.');
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);
  const [testImage, setTestImage] = useState(null);
  const [testImageError, setTestImageError] = useState('');
  const [advancedConfig, setAdvancedConfig] = useState({
    baseUrl: '',
    apiKey: '',
    modelName: '',
    systemPrompt: defaultSystemPrompt,
    maxTokens: 8192,
    cleanThinking: false,
  });
  const [showBackendInfo, setShowBackendInfo] = useState(false);

  const hasElectron = useMemo(
    () => typeof window !== 'undefined' && window.electronAPI && window.electronAPI.captioner,
    []
  );

  useEffect(() => {
    const preset = modelPresets.find((p) => p.key === selectedPreset);
    if (preset) {
      setModelPath(preset.modelPath);
      setMmprojPath(preset.mmprojPath);
    }
  }, [selectedPreset]);

  const applyResult = useCallback((result) => {
    if (!result) return;
    if (result.running !== undefined || result.status !== undefined || result.baseURL || result.progress) {
      setStatus((prev) => ({ ...(prev || {}), ...result }));
    }
    setMessage(result.message || result.error || (result.success === false ? 'Action failed' : ''));
    if (result.modelPath) setModelPath(result.modelPath);
    if (result.mmprojPath) setMmprojPath(result.mmprojPath);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!hasElectron) return;
    try {
      const result = await window.electronAPI.captioner.getStatus();
      applyResult(result);
    } catch (err) {
      setMessage(err?.message || 'Failed to read captioner status');
    }
  }, [applyResult, hasElectron]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!hasElectron) return undefined;
    const id = setInterval(() => {
      refreshStatus();
    }, 1000);
    return () => clearInterval(id);
  }, [hasElectron, refreshStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('captionerAdvanced');
      if (raw) {
        const parsed = JSON.parse(raw);
        setAdvancedConfig((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch (err) {
      console.error('Failed to load advanced config', err);
    }
  }, []);

  const ensurePresetSelected = () => !!selectedPreset && !!modelPath;

  const downloadPrompt = (label) => {
    return window.confirm(
      `${label} will download the official llama.cpp binaries from the ggml-org/llama.cpp releases page into your app data folder, then start the server with the selected model. Continue?`
    );
  };

  const guard = (fn) => async () => {
    if (!hasElectron) {
      setMessage('Captioner is only available in the desktop app.');
      return;
    }
    if (!ensurePresetSelected()) {
      setMessage('Select a model preset first.');
      return;
    }
    setBusy(true);
    setWorkingLabel('');
    try {
      const result = await fn();
      applyResult(result);
    } catch (err) {
      setMessage(err?.message || 'Action failed');
    } finally {
      setBusy(false);
      setWorkingLabel('');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const mime = file.type;
    if (!mime || !/^image\/(png|jpe?g)$/i.test(mime)) {
      setTestImage(null);
      setTestImageError('Only PNG or JPEG images are supported.');
      return;
    }
    try {
      const readDataUrl = () =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      const dataUrl = (await readDataUrl()) || '';
      const img = new Image();
      const ready = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = dataUrl;
      await ready;

      const maxSize = 1024;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      let outDataUrl = dataUrl;
      let outMime = mime;
      if (scale < 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        outMime = mime.includes('png') ? 'image/png' : 'image/jpeg';
        outDataUrl = canvas.toDataURL(outMime, 0.9);
      }

      const b64 = outDataUrl.split(',')[1];
      const approxSize = Math.round((b64.length * 3) / 4);
      setTestImage({
        name: file.name,
        size: approxSize,
        mime: outMime,
        b64,
        resized: scale < 1,
        dims: { width: img.width, height: img.height },
      });
      setTestImageError('');
    } catch (err) {
      setTestImage(null);
      setTestImageError(err?.message || 'Failed to process image');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const saveAdvancedConfig = (next) => {
    setAdvancedConfig(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('captionerAdvanced', JSON.stringify(next));
    }
  };

  const closeBackendInfo = () => setShowBackendInfo(false);

  const installCpu = guard(async () => {
    if (!downloadPrompt('Use CPU')) {
      setMessage('Download cancelled.');
      return null;
    }
    setWorkingLabel('Downloading llama.cpp CPU assets...');
    return window.electronAPI.captioner.installBackend('cpu');
  });

  const installGpu = guard(async () => {
    if (!downloadPrompt('Use GPU')) {
      setMessage('Download cancelled.');
      return null;
    }
    setWorkingLabel('Downloading llama.cpp GPU assets (CUDA/Metal/Vulkan)...');
    return window.electronAPI.captioner.installBackend();
  });

  const downloadModel = guard(async () => {
    setWorkingLabel('Downloading model assets...');
    const result = await window.electronAPI.captioner.downloadModel({
      modelUrl: modelPath,
      mmprojUrl: mmprojPath,
    });
    setModelPath(result?.modelPath || modelPath);
    setMmprojPath(result?.mmprojPath || mmprojPath);
    setWorkingLabel('');
    return { message: 'Model download complete', ...result };
  });

  const startServer = guard(async () => {
    setWorkingLabel('Starting llama-server...');
    return window.electronAPI.captioner.start({
      modelPath: status?.downloadedModel || modelPath || undefined,
      mmprojPath: status?.downloadedMmproj || mmprojPath || undefined,
      useExisting: true,
    });
  });

  const stop = guard(() => window.electronAPI.captioner.stop());

  const runTest = async () => {
    if (!status?.baseURL) {
      setTestResult('Start the server first.');
      return;
    }
    if (testImageError) {
      setTestResult(testImageError);
      return;
    }
    setTesting(true);
    setTestResult('Testing server...');
    try {
      const baseUrl = (advancedConfig.baseUrl || '').trim() || status?.baseURL;
      if (!baseUrl) {
        setTestResult('No base URL available.');
        return;
      }
      const headers = { 'Content-Type': 'application/json' };
      if (advancedConfig.apiKey) {
        headers.Authorization = `Bearer ${advancedConfig.apiKey}`;
      }

      const modelsRes = await fetch(`${baseUrl}/models`, { headers });
      const modelsJson = await modelsRes.json();
      const modelId =
        advancedConfig.modelName ||
        modelsJson?.data?.[0]?.id ||
        modelsJson?.[0]?.id ||
        modelsJson?.model ||
        'default';

      const userContent = [{ type: 'text', text: testPrompt }];
      if (testImage?.b64 && testImage?.mime) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${testImage.mime};base64,${testImage.b64}` } });
      }

      const completionRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: advancedConfig.systemPrompt || 'You are an image captioning assistant.' },
            { role: 'user', content: userContent },
          ],
          max_tokens: Number(advancedConfig.maxTokens) || 8192,
        }),
      });

      const completionJson = await completionRes.json();
      if (completionJson?.error) {
        setTestResult(`Error: ${completionJson.error.message || completionJson.error}`);
      } else {
        const content =
          completionJson?.choices?.[0]?.message?.content ||
          completionJson?.choices?.[0]?.text ||
          JSON.stringify(completionJson);
        setTestResult(content);
      }
    } catch (err) {
      setTestResult(err?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100 flex flex-col gap-6">
      <header className="flex flex-col gap-4 bg-gray-800 p-4 rounded-lg shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="../"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 transition-colors max-w-[220px]"
            >
              <span className="text-lg">←</span>
              <span className="font-semibold whitespace-nowrap">Back to editor</span>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Auto Captioning Sidecar</h1>
              <p className="text-sm text-gray-400">
                Download-and-run llama.cpp locally with OpenAI-compatible endpoint and automatic backend fallback.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full justify-items-center">
            <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
              <Link
                href="/captioner/advanced/"
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold border border-gray-600 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Advanced settings
              </Link>
              <button
                type="button"
                onClick={async () => {
                  if (!hasElectron) return;
                  await window.electronAPI.captioner.openCache();
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold border border-gray-600 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Open cache folder
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!hasElectron) return;
                  const ok = window.confirm('Delete all downloaded backends and models? This cannot be undone.');
                  if (!ok) return;
                  const res = await window.electronAPI.captioner.clearCache();
                  setMessage(res?.error ? `Clear failed: ${res.error}` : 'Downloads cleared.');
                  refreshStatus();
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold border border-gray-600 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Delete downloads
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Download backend:</span>
                <button
                  type="button"
                  className="h-6 w-6 rounded-full bg-gray-700 text-gray-200 text-xs flex items-center justify-center border border-gray-600"
                  // onMouseEnter={() => setShowBackendInfo(true)}
                  // onMouseLeave={() => setShowBackendInfo(false)}
                  onClick={() => setShowBackendInfo((v) => !v)}
                  title="Backend heuristic"
                >
                  ?
                </button>
              </div>
              {showBackendInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeBackendInfo} />
                  <div className="relative z-10 bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-gray-200 shadow-2xl max-w-sm w-[320px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-100">Backend heuristic</div>
                      <button
                        type="button"
                        onClick={closeBackendInfo}
                        className="h-6 w-6 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-200 border border-gray-600"
                      >
                        ×
                      </button>
                    </div>
                    <div className="space-y-1 text-gray-300">
                      <div>Windows: CUDA if nvidia-smi works, else Vulkan, else CPU.</div>
                      <div>macOS: Metal on arm64, else CPU.</div>
                      <div>Other platforms: CPU.</div>
                      <div className="text-gray-400 text-[11px]">
                        Windows CUDA needs both llama-*-bin-win-cuda-*.zip and cudart-llama-*-bin-win-cuda-*.zip.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={installCpu}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-900/30 disabled:opacity-60 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Use CPU
              </button>
              <button
                type="button"
                onClick={installGpu}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold shadow-lg shadow-indigo-900/30 disabled:opacity-60 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Use GPU
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
              <button
                type="button"
                onClick={downloadModel}
                disabled={busy || (!status?.binDir && !status?.backend)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold shadow-lg shadow-emerald-900/30 disabled:opacity-60 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Download model
              </button>
              <button
                type="button"
                onClick={startServer}
                disabled={
                  busy || !status?.binDir || !(status?.downloadedModel || modelPath)
                }
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold border border-gray-600 disabled:opacity-60 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Serve model
              </button>
              <button
                type="button"
                onClick={stop}
                disabled={busy || !status?.running}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-semibold border border-gray-600 disabled:opacity-60 w-full max-w-[220px] text-center whitespace-normal break-words"
              >
                Stop LLM server
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="text-sm text-gray-400">Status</div>
            <div className="text-lg font-semibold text-white">{formatStatus(status)}</div>
            {status?.baseURL && (
              <div className="text-xs text-gray-400 mt-1">
                Base URL: <span className="text-gray-200 font-mono">{status.baseURL}</span>
              </div>
            )}
            {status?.backend && (
              <div className="text-xs text-gray-500 mt-1">
                Backend: {status.backend} {status.source ? `(${status.source})` : ''}
              </div>
            )}
          </div>
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="text-sm text-gray-400">Progress</div>
            <div className="text-sm text-gray-300">
              {status?.progress
                ? `${status.progress.label}${
                    status.progress.total
                      ? ` (${Math.round((status.progress.loaded / status.progress.total) * 100)}%)`
                      : ''
                  }`
                : workingLabel || 'No active backend/model download'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Large backend or model downloads can take time; this keeps the page responsive while work continues.
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="text-sm text-gray-400">Messages</div>
            <div className="text-sm text-gray-200 mt-1 min-h-[40px]">
              {message || 'No recent updates'}
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-2">Model presets (select first)</h2>
          <div className="space-y-3">
            {modelPresets.map((preset) => (
              <label
                key={preset.key}
                className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer ${
                  selectedPreset === preset.key ? 'border-blue-500 bg-gray-900' : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="modelPreset"
                    className="accent-blue-500"
                    checked={selectedPreset === preset.key}
                    onChange={() => setSelectedPreset(preset.key)}
                  />
                  <span className="font-semibold text-gray-100">{preset.name}</span>
                </div>
                <div className="text-xs text-gray-400">{preset.memory}</div>
                <div className="text-xs text-gray-500">{preset.note}</div>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-2">Model overrides</h2>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-300">Model (.gguf)</div>
              <input
                type="text"
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <div className="text-sm text-gray-300">mmproj (for vision models)</div>
              <input
                type="text"
                value={mmprojPath}
                onChange={(e) => setMmprojPath(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="text-xs text-gray-500">
              Defaults point to Hugging Face URLs; llama-server can download them directly.
            </div>
          </div>
        </div>

      </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-2">Model readiness & test</h2>
          <p className="text-sm text-gray-400 mb-3">
            After starting the server, llama.cpp may download the model from Hugging Face. Once ready, send a quick test
            prompt to verify the API responds.
          </p>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-300">Test prompt</div>
              <textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                rows={3}
              />
            </div>
            <div>
              <div className="text-sm text-gray-300 mb-1">Attach image (drag & drop or click)</div>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="block border border-dashed border-gray-600 rounded-lg bg-gray-900 px-3 py-3 cursor-pointer hover:border-blue-500 transition-colors"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={onPick}
                />
                <div className="text-xs text-gray-400">
                  {testImage
                    ? `Attached: ${testImage.name} (${Math.round(testImage.size / 1024)} KB)${
                        testImage.resized ? ' (resized to max 1024px)' : ''
                      }`
                    : 'PNG or JPEG only. Will be resized to max 1024px and sent as base64.'}
                </div>
                {testImageError && <div className="text-xs text-red-400 mt-1">{testImageError}</div>}
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runTest}
                disabled={testing || !status?.running}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-900/30 disabled:opacity-60"
              >
                {testing ? 'Testing…' : 'Send test request'}
              </button>
              <div className="text-xs text-gray-500 self-center">
                Requires server running. Uses /models then /chat/completions.
              </div>
            </div>
            <div className="text-sm text-gray-200 min-h-[48px] bg-gray-900 rounded-lg border border-gray-700 p-2">
              {testResult || 'Awaiting test.'}
            </div>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-2">LLM server logs</h2>
          <div className="text-xs text-gray-500 mb-2">Recent output from llama.cpp (tail).</div>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-64 overflow-y-auto font-mono text-xs text-gray-200 space-y-1">
            {(status?.logs && status.logs.length > 0) ? (
              status.logs.slice(-100).map((line, idx) => (
                <div key={`${idx}-${line.slice(0,10)}`} className="whitespace-pre-wrap">{line}</div>
              ))
            ) : (
              <div className="text-gray-500">No logs yet. Start the server to see output.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
