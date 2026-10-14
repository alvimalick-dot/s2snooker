'use client';

import { useEffect, useRef } from 'react';

export default function ModalShell({
  title,
  subtitle,
  onClose,
  busy,
  footer,
  children,
  width = 'max-w-md',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  busy?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`bg-surface-card w-full ${width} max-w-[calc(100vw-1rem)] flex flex-col max-h-[94dvh] sm:max-h-[88vh] shadow-xl rounded-t-3xl sm:rounded-3xl`}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0 -mr-1 -mt-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-2 sm:pb-3 min-h-0">
          {children}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {footer && (
          <div className="modal-footer shrink-0 border-t border-surface-border px-4 sm:px-6 py-3 sm:py-4 bg-surface-card rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
