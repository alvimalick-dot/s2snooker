'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      // Credentials are validated server-side; the browser only gets an
      // HttpOnly session cookie back. Nothing sensitive lives in this bundle.
      await api.post('/api/auth/login', { loginId: loginId.trim(), password });
      onLogin();
    } catch (err: any) {
      setError(err.message ?? 'Invalid login ID or password');
      setBusy(false);
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-surface-dark p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-20 h-20 rounded-3xl bg-available items-center justify-center shadow-glow-green mb-4">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="white" />
              <circle cx="12" cy="12" r="5" fill="#16a34a" />
            </svg>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">Break & Game</div>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-widest mt-1">Staff Login</div>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="bg-surface-card rounded-3xl border-2 border-surface-border p-8 shadow-xl">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Login ID</label>
              <input
                ref={inputRef}
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Enter login ID"
                autoComplete="username"
                className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-4 text-lg font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-brass transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full rounded-xl bg-slate-800 border-2 border-surface-border px-4 py-4 text-lg font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-brass transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-occupied bg-occupied-bg border-2 border-occupied/20 rounded-xl px-4 py-3 text-sm font-semibold mb-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !loginId.trim() || !password}
            className="w-full py-4 rounded-xl bg-available text-white text-lg font-extrabold uppercase shadow-lg hover:bg-available/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Signing in…
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="text-center mt-6 text-xs text-slate-400/60 font-semibold">
          Table Management Dashboard
        </div>
      </div>
    </div>
  );
}
