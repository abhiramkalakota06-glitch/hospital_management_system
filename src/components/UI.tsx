import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Search,
  X,
} from 'lucide-react';

// =========================================================================
// BRAND MARK
// =========================================================================

export const CarePlusLogo: React.FC<{ size?: number; inverted?: boolean }> = ({ size = 32, inverted = false }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
    <rect width="36" height="36" rx="9" fill={inverted ? '#FFFFFF' : '#0284C7'} />
    <path
      d="M15 8.5C15 7.94772 15.4477 7.5 16 7.5H20C20.5523 7.5 21 7.94772 21 8.5V15H27.5C28.0523 15 28.5 15.4477 28.5 16V20C28.5 20.5523 28.0523 21 27.5 21H21V27.5C21 28.0523 20.5523 28.5 20 28.5H16C15.4477 28.5 15 28.0523 15 27.5V21H8.5C7.94772 21 7.5 20.5523 7.5 20V16C7.5 15.4477 7.94772 15 8.5 15H15V8.5Z"
      fill={inverted ? '#0284C7' : '#FFFFFF'}
    />
    <circle cx="26.5" cy="9.5" r="2.5" fill="#0D9488" />
  </svg>
);

// =========================================================================
// TOAST SYSTEM
// =========================================================================

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

const ToastContext = createContext<{
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
} | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-md bg-white ${
              t.type === 'error'
                ? 'border-red-200 text-red-900'
                : t.type === 'info'
                ? 'border-sky-200 text-slate-900'
                : 'border-teal-200 text-slate-900'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : t.type === 'info' ? (
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// =========================================================================
// STAT CARD & SECTION HEADER
// =========================================================================

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  helper?: string;
  tone?: 'default' | 'blue' | 'teal' | 'amber' | 'red';
  onClick?: () => void;
}> = ({ label, value, helper, tone = 'default', onClick }) => {
  const valueTone =
    tone === 'blue'
      ? 'text-sky-700'
      : tone === 'teal'
      ? 'text-teal-700'
      : tone === 'amber'
      ? 'text-amber-700'
      : tone === 'red'
      ? 'text-red-700'
      : 'text-slate-900';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white border border-slate-200 rounded-xl p-5 transition-colors ${
        onClick ? 'hover:border-sky-300 hover:bg-slate-50/50 cursor-pointer' : ''
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${valueTone}`}>{value}</p>
      {helper && <p className="mt-1.5 text-xs text-slate-500">{helper}</p>}
    </Tag>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>}
  </div>
);

// =========================================================================
// SEMANTIC STATUS INDICATOR (Text + Icon, never hue-only, zero pill clutter)
// =========================================================================

export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  let tone = 'text-slate-700';
  let Icon = Info;

  if (['active', 'approved', 'paid', 'completed', 'published', 'dispensed', 'available', 'normal', 'settled', 'cleared', 'administered', 'improving', 'stable'].some((k) => s.includes(k))) {
    tone = 'text-emerald-700';
    Icon = CheckCircle2;
  } else if (['pending', 'waiting', 'scheduled', 'processing', 'under review', 'partial', 'requested', 'called', 'in consultation', 'checked-in', 'verified', 'sample collected', 'urgent', 'needs attention'].some((k) => s.includes(k))) {
    tone = 'text-amber-700';
    Icon = Clock;
  } else if (['cancelled', 'rejected', 'expired', 'failed', 'critical', 'stat', 'inactive', 'absent', 'missed', 'high', 'occupied', 'maintenance', 'skipped', 'refunded'].some((k) => s.includes(k))) {
    tone = 'text-red-700';
    Icon = AlertCircle;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${tone}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{status}</span>
    </span>
  );
};

// =========================================================================
// DATA TABLE (Search, Sort, Pagination, Empty & Loading States)
// =========================================================================

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchPlaceholder = 'Filter records...',
  searchFilter,
  pageSize = 8,
  loading = false,
  emptyTitle = 'No matching records',
  emptyAction,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  pageSize?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q && searchFilter ? data.filter((r) => searchFilter(r, q)) : data;
    if (sortCol) {
      const col = columns.find((c) => c.key === sortCol);
      if (col?.sortValue) {
        rows = [...rows].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (av < bv) return sortDir === 'asc' ? -1 : 1;
          if (av > bv) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }
    return rows;
  }, [data, query, searchFilter, sortCol, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    if (sortCol === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {searchFilter && (
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
            />
          </div>
          <span className="text-xs text-slate-500 tabular-nums shrink-0">{filtered.length} record(s)</span>
        </div>
      )}

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
          <p className="mt-1 text-xs text-slate-500">Adjust your filters or add a new record to populate this view.</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${
                      c.sortValue ? 'cursor-pointer select-none hover:text-slate-900' : ''
                    }`}
                    onClick={() => c.sortValue && toggleSort(c.key)}
                  >
                    {c.header}
                    {sortCol === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pageRows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-slate-50/80 transition-colors">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 text-slate-700 ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > pageSize && (
        <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/40 text-xs text-slate-600">
          <span className="tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// MODAL & CONFIRM DIALOG
// =========================================================================

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ open, onClose, title, children, maxWidth = 'max-w-xl' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]">
      <div className={`bg-white border border-slate-200 rounded-xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col`}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}> = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) => (
  <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
    <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
    <div className="mt-6 flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          onConfirm();
          onClose();
        }}
        className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
          danger ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'
        }`}
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
