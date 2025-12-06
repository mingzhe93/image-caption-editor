'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { defaultSystemPrompt } from '../defaultPrompt';

export default function AdvancedSettings() {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [cleanThinking, setCleanThinking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('captionerAdvanced');
      if (raw) {
        const parsed = JSON.parse(raw);
        setBaseUrl(parsed.baseUrl || '');
        setApiKey(parsed.apiKey || '');
        setModelName(parsed.modelName || '');
        setSystemPrompt(parsed.systemPrompt || defaultSystemPrompt);
        setMaxTokens(parsed.maxTokens || 8192);
        setCleanThinking(!!parsed.cleanThinking);
      }
    } catch (err) {
      console.error('Failed to load advanced config', err);
    }
  }, []);

  const save = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      baseUrl,
      apiKey,
      modelName,
      systemPrompt,
      maxTokens: Number(maxTokens) || 8192,
      cleanThinking,
    };
    window.localStorage.setItem('captionerAdvanced', JSON.stringify(payload));
    setMessage('Saved. The captioner page will use these settings for testing.');
    setTimeout(() => setMessage(''), 2000);
  };

  const resetDefaults = () => {
    setBaseUrl('');
    setApiKey('');
    setModelName('');
    setSystemPrompt(defaultSystemPrompt);
    setMaxTokens(8192);
    setCleanThinking(false);
    setMessage('Reset to defaults.');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'captionerAdvanced',
        JSON.stringify({
          baseUrl: '',
          apiKey: '',
          modelName: '',
          systemPrompt: defaultSystemPrompt,
          maxTokens: 8192,
          cleanThinking: false,
        })
      );
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100 flex flex-col gap-6">
      <header className="bg-gray-800 p-4 rounded-lg flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <Link
            href="/captioner/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 transition-colors"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            <span className="font-semibold">Back to captioner</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Advanced settings</h1>
            <p className="text-sm text-gray-400">
              Connect to external endpoints (Ollama, LM Studio, OpenRouter, OpenAI, Claude, Gemini) or override the
              local llama.cpp server settings used for testing.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetDefaults}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600"
          >
            Reset defaults
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-900/30"
          >
            Save
          </button>
        </div>
      </header>

      {message && (
        <div className="bg-emerald-900/60 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-lg">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-3">
          <div>
            <div className="text-sm text-gray-300">Base URL</div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="e.g. http://127.0.0.1:11434/v1 or leave blank to use local llama.cpp"
              className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Optional. If blank, the captioner page will use the local llama.cpp sidecar base URL.
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-300">API key</div>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Optional; not required for Ollama / LM Studio"
              className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <div className="text-sm text-gray-300">Model name</div>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Required for Ollama / LM Studio / external providers"
              className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="clean-thinking"
              type="checkbox"
              checked={cleanThinking}
              onChange={(e) => setCleanThinking(e.target.checked)}
              className="accent-blue-500"
            />
            <label htmlFor="clean-thinking" className="text-sm text-gray-300">
              Clean thinking traces (&lt;think&gt;...&lt;/think&gt;)
            </label>
          </div>
          <div>
            <div className="text-sm text-gray-300">Max tokens</div>
            <input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="text-xs text-gray-500 mt-1">
              Defaults to 8192; thinking models often need 8k-16k to avoid truncation (higher VRAM/RAM).
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-3">
          <div className="text-sm text-gray-300">System prompt</div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <div className="text-xs text-gray-500">
            This system prompt is used for the test request on the captioner page. Leave blank to use the default
            describing-images prompt.
          </div>
        </div>
      </section>
    </main>
  );
}
