'use client';

import { useEffect, useRef } from 'react';

/**
 * ModalShell — the single, consistent modal wrapper used by every dialog
 * in the app (Start Session, Switch Table, Order, Menu Manager, Revenue
 * Report, End Shift, etc.).
 *
 * Design rationale:
 *  • Dark scrim (`bg-black/60`) with a click-to-dismiss backdrop so fat-
 *    finger tablet users don't have to hunt for a close button.
 *  • White card with `rounded-3xl` and generous padding — the same visual
 *    language as the table cards on the floor view.
 *  • Scrollable body capped at `max-h-[85vh]` so long menus never push
 *    the footer off-screen.
 *  • Sticky header with an ✕ close button (44px tap target) and an
 *    optional subtitle line.
 *  • Sticky footer bar for primary + cancel actions, separated from the
 *    scrollable body by a subtle border.
 */
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
  /** Footer content — typically a pair of Cancel / Confirm buttons. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Tailwind max-width class, e.g. 'max-w-md', 'max-w-lg'. */
  width?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={(e) => {
        // Dismiss on backdrop click (not on card click)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`bg-surface-card rounded-3xl w-full ${width} flex flex-col max-h-[95vh] sm:max-h-[90vh] shadow-xl`}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-4 sm:px-7 pt-4 sm:pt-6 pb-2 sm:pb-3 shrink-0">
          <div>
            <h2 className="text-2xl font-extrabold text-ink leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0 -mr-1 -mt-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-7 pb-3 sm:pb-4 min-h-0">
          {children}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {footer && (
          <div className="shrink-0 border-t border-surface-border px-4 sm:px-7 py-3 sm:py-4 bg-surface-card rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
