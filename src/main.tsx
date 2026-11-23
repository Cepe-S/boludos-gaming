import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AppProvider } from './context/AppContext';
import { initTheme } from './lib/theme';
import { normalizeLegacyHashLocation } from './lib/routes';

initTheme();
normalizeLegacyHashLocation();

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
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-card border border-destructive/40 rounded-md p-6 space-y-4">
            <h2 className="text-base font-bold text-destructive">
              ⚠️ Ocurrió un error al renderizar la interfaz
            </h2>
            <p className="text-xs text-muted-foreground font-mono bg-background p-3 rounded-md border border-border break-words">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-semibold cursor-pointer"
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
                className="px-3 py-1.5 rounded-md bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold cursor-pointer"
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
      <HashRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </HashRouter>
    </RootErrorBoundary>
  </StrictMode>
);
