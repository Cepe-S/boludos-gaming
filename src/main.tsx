import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppProvider } from './context/AppContext';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('RootErrorBoundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#131c31] border border-rose-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold text-rose-400">
              ⚠️ Ocurrió un error al renderizar la interfaz
            </h2>
            <p className="text-xs text-slate-300 font-mono bg-black/50 p-3 rounded-xl border border-slate-800 break-words">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                🔄 Recargar Página
              </button>
              <button
                onClick={() => {
                  Object.keys(localStorage).forEach((k) => {
                    if (k.startsWith('bg_')) localStorage.removeItem(k);
                  });
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                🧹 Limpiar Caché Local y Recargar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </RootErrorBoundary>
  </StrictMode>
);
