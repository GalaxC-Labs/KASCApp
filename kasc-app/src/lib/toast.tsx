import { createContext, useCallback, useContext, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<{
  push: (message: string, kind?: ToastKind) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed z-[100] space-y-2 w-full max-w-sm
        top-3 left-3 right-3 mx-auto
        sm:top-auto sm:bottom-4 sm:right-4 sm:left-auto sm:mx-0 safe-bottom">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => setToasts((x) => x.filter((i) => i.id !== t.id))}
            className={
              'px-4 py-2 rounded-lg shadow-lg text-sm text-white cursor-pointer animate-in ' +
              (t.kind === 'success'
                ? 'bg-emerald-600'
                : t.kind === 'error'
                ? 'bg-red-600'
                : 'bg-slate-800')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}