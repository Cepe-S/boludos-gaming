import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Bell,
  X,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Send,
  Sparkles,
  Share2,
  PlusSquare,
  MoreVertical,
  Gamepad2,
  Clock,
  Ghost,
} from 'lucide-react';

export interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    pushAlerts,
    notificationPermission,
    requestPushPermission,
    sendTestPushNotification,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'feed' | 'install'>('feed');
  const [activeOs, setActiveOs] = useState<'android' | 'ios'>('android');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testNotificationResult, setTestNotificationResult] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    try {
      const result = await requestPushPermission();
      if (result === 'granted') {
        setTestNotificationResult('Permiso concedido.');
      } else if (result === 'denied') {
        setTestNotificationResult('Permiso denegado. Habilitalo desde la configuración del navegador.');
      }
      setTimeout(() => setTestNotificationResult(null), 6000);
    } catch {
      setTestNotificationResult('Error al solicitar permiso.');
      setTimeout(() => setTestNotificationResult(null), 4000);
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    setTestNotificationResult(null);
    try {
      await sendTestPushNotification();
      setTestNotificationResult('Notificación de prueba enviada.');
      setTimeout(() => setTestNotificationResult(null), 6000);
    } catch {
      setTestNotificationResult('Error al enviar notificación de prueba.');
      setTimeout(() => setTestNotificationResult(null), 4000);
    } finally {
      setIsSendingTest(false);
    }
  };

  const getAlertIcon = (tag: string) => {
    if (tag.includes('roulette') || tag.includes('winner')) {
      return <Sparkles className="w-4 h-4 text-success" strokeWidth={1.75} />;
    }
    if (tag.includes('late') || tag.includes('ping') || tag.includes('humo')) {
      return <Clock className="w-4 h-4 text-warning" strokeWidth={1.75} />;
    }
    if (tag.includes('sanction') || tag.includes('ghost')) {
      return <Ghost className="w-4 h-4 text-destructive" strokeWidth={1.75} />;
    }
    return <Gamepad2 className="w-4 h-4 text-primary" strokeWidth={1.75} />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-md">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background/78 backdrop-blur-xl border border-white/12 ring-1 ring-inset ring-white/5 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.85)] rounded-lg p-5 space-y-5 animate-lol-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center text-white shrink-0">
              <Bell className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              Notificaciones
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            className="p-2 rounded-md bg-secondary/60 hover:bg-accent/70 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Permission State Card */}
        <div className="rounded-md p-4 border bg-card border-border/70 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Estado
              </span>
              {notificationPermission === 'granted' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  Activo
                </span>
              ) : notificationPermission === 'denied' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-destructive/20 text-destructive border border-destructive/50">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  Bloqueado
                </span>
              ) : notificationPermission === 'unsupported' ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-secondary/60 text-muted-foreground">
                  No soportado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/40">
                  <Bell className="w-3.5 h-3.5 text-warning" />
                  Pendiente
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {notificationPermission !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  title="Activar notificaciones"
                  aria-label="Activar notificaciones"
                  className="px-3 py-1.5 rounded-md bg-success hover:bg-success text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Activar</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSendTestPush}
                disabled={isSendingTest}
                title="Probar notificación"
                aria-label="Probar notificación"
                className="p-2 rounded-md bg-primary hover:bg-primary/90 text-white transition-colors disabled:opacity-50"
              >
                {isSendingTest ? (
                  <span className="block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {testNotificationResult && (
            <div className="p-2.5 rounded-md bg-primary/15 border border-primary/40 text-xs font-semibold text-primary animate-in fade-in">
              {testNotificationResult}
            </div>
          )}
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-2 border-b border-border/70 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              activeTab === 'feed'
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Alertas ({pushAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('install')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              activeTab === 'install'
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Instalar App
          </button>
        </div>

        {/* TAB 1: Alert Feed */}
        {activeTab === 'feed' && (
          <div className="space-y-3">
            {pushAlerts.length === 0 ? (
              <div className="p-6 rounded-md bg-card/50 backdrop-blur-sm border border-border/70 text-center text-muted-foreground">
                <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" strokeWidth={1.75} />
                <p className="font-semibold text-white text-xs">Sin alertas</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {pushAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-md bg-card/50 backdrop-blur-sm border border-border/70 hover:border-primary/40 transition-colors flex items-start gap-3 text-xs"
                  >
                    <div className="p-2 rounded-md bg-background/45 border border-border/70 shrink-0 mt-0.5">
                      {getAlertIcon(alert.tag)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white text-xs sm:text-sm">
                          {alert.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {alert.createdAt
                            ? new Date(alert.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Reciente'}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {alert.body}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-secondary/60 text-primary font-mono">
                          {alert.tag}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {alert.targetUserIds.length} dest.
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PWA Installation */}
        {activeTab === 'install' && (
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 bg-background p-1 rounded-md border border-border/70">
              <button
                type="button"
                onClick={() => setActiveOs('android')}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  activeOs === 'android'
                    ? 'bg-success text-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setActiveOs('ios')}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                  activeOs === 'ios'
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                iOS (16.4+)
              </button>
            </div>

            {activeOs === 'android' && (
              <div className="p-4 rounded-md bg-card border border-success/30 space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-success/20 text-success border border-success/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    1
                  </span>
                  <span>
                    Menú Chrome/Brave (<MoreVertical className="w-3.5 h-3.5 inline text-muted-foreground" />)
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-success/20 text-success border border-success/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    2
                  </span>
                  <span>
                    <strong className="text-white">Instalar aplicación</strong> / Agregar a inicio
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-success/20 text-success border border-success/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    3
                  </span>
                  <span>Abrir desde inicio y permitir notificaciones</span>
                </div>
              </div>
            )}

            {activeOs === 'ios' && (
              <div className="p-4 rounded-md bg-card/50 backdrop-blur-sm border border-border/70 space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    1
                  </span>
                  <span>
                    Abrir en <strong className="text-white">Safari</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    2
                  </span>
                  <span>
                    Tocar <strong className="text-white">Compartir</strong> (<Share2 className="w-3.5 h-3.5 inline text-primary" />)
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    3
                  </span>
                  <span>
                    <strong className="text-white">Agregar a inicio</strong> (<PlusSquare className="w-3.5 h-3.5 inline text-primary" />)
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-[11px] shrink-0">
                    4
                  </span>
                  <span>Abrir desde inicio y activar notificaciones</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
