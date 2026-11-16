import { useEffect, useState } from 'react';
import type { WorkspaceView } from '../types/studio';
import { ADMIN_TOKEN_STORAGE_KEY } from '../utils/i18n';

interface TopBarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  onOpenExport: () => void;
}

function readStoredToken(): string {
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function writeStoredToken(token: string) {
  try {
    if (token) window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage restrictions
  }
}

export function TopBar({ activeView, onChangeView, onOpenExport }: TopBarProps) {
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    setAccessToken(readStoredToken());
  }, []);

  const navItems: Array<{ id: WorkspaceView; label: string }> = [
    { id: 'editor', label: '自动剪辑台' },
    { id: 'matrix', label: '三端成片对比' },
    { id: 'media', label: '媒体素材库' },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-zinc-800/90 bg-[#0E1015] px-5 flex items-center justify-between gap-8">
      <button
        type="button"
        onClick={() => onChangeView('editor')}
        className="text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0 font-display hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded"
      >
        ClipFlow
      </button>

      <nav className="flex items-center gap-7" aria-label="主工作区导航">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`relative py-4 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-sm ${
                isActive ? 'text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-rose-500" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          aria-label="访问令牌"
          placeholder="访问令牌"
          value={accessToken}
          onChange={(event) => {
            const next = event.target.value;
            setAccessToken(next);
            writeStoredToken(next.trim());
          }}
          className="w-32 rounded-lg border border-zinc-700 bg-[#11141B] px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500"
        />
        <button
          type="button"
          onClick={onOpenExport}
          className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          导出成片
        </button>
      </div>
    </header>
  );
}
