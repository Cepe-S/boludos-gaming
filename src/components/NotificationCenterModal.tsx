import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PushNotificationAlert } from '../types/domain';
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
  Check,
  Gamepad2,
  Clock,
  Ghost,
  Radio,
  ExternalLink,
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
    players,
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
        setTestNotificationResult('✅ ¡Permiso concedido! Ahora recibirás alertas en tu celular.');
      } else if (result === 'denied') {
        setTestNotificationResult('🚫 Permiso denegado. Podés habilitarlo desde el candado de la barra del navegador.');
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
      setTestNotificationResult('🚀 Notificación push enviada. Deberías verla en tu sistema / barra de notificaciones.');
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
      return <Sparkles className="w-4 h-4 text-emerald-400" />;
    }
    if (tag.includes('late') || tag.includes('ping') || tag.includes('humo')) {
      return <Clock className="w-4 h-4 text-amber-400" />;
    }
    if (tag.includes('sanction') || tag.includes('ghost')) {
      return <Ghost className="w-4 h-4 text-rose-400" />;
    }
    return <Gamepad2 className="w-4 h-4 text-indigo-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#090d16] border border-indigo-900/80 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-950/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Centro de Notificaciones & Web Push
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  PWA Mobile
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Alertas nativas en tu celular sin pagar Apple Developer ni Google Play.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Browser/Device Permission State Card */}
        <div className="rounded-2xl p-4 sm:p-5 border bg-[#131c31] border-indigo-900/50 shadow-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Estado de Notificaciones en este Dispositivo:
              </span>
              <div className="flex items-center gap-2">
                {notificationPermission === 'granted' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Permiso Concedido ✅
                  </span>
                ) : notificationPermission === 'denied' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/50">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Permiso Bloqueado 🚫
                  </span>
                ) : notificationPermission === 'unsupported' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300">
                    Navegador sin Soporte de Push
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <Bell className="w-3.5 h-3.5 text-amber-400" />
                    Permiso Pendiente 🔔
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {notificationPermission !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Activar Notificaciones</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSendTestPush}
                disabled={isSendingTest}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSendingTest ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Probar Notificación Ahora</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed pt-1">
            {notificationPermission === 'granted'
              ? 'Tu navegador y celular recibirán pings cuando se cree una sesión, cuando la ruleta determine el juego, o cuando alguien aplique una sanción por humo.'
              : 'Activá los avisos para enterarte al instante de partidas y reclamos aunque tengas la pantalla bloqueada.'}
          </p>

          {testNotificationResult && (
            <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-xs font-semibold text-indigo-200 animate-in fade-in">
              {testNotificationResult}
            </div>
          )}
        </div>

        {/* View Switcher: Live Alert Feed vs Installation Guide */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'feed'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Registro de Alertas ({pushAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('install')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'install'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📲 Cómo Instalar en Celular (PWA)
          </button>
        </div>

        {/* TAB 1: Alert Feed */}
        {activeTab === 'feed' && (
          <div className="space-y-3">
            {pushAlerts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#131c31] border border-slate-800 text-center text-slate-400">
                <Bell className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-60" />
                <p className="font-bold text-white text-sm">No hay alertas push registradas</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Tocá &ldquo;Probar Notificación Ahora&rdquo; o creá una nueva sesión para ver las alertas emitidas por el sistema.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {pushAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3.5 rounded-2xl bg-[#131c31] border border-indigo-950/60 hover:border-indigo-500/40 transition-colors flex items-start gap-3 text-xs"
                  >
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex-shrink-0 mt-0.5">
                      {getAlertIcon(alert.tag)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white text-xs sm:text-sm">
                          {alert.title}
                        </span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {alert.createdAt
                            ? new Date(alert.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Reciente'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        {alert.body}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">
                          tag: {alert.tag}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Para {alert.targetUserIds.length} jugadores
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PWA Installation Step-by-Step Guide */}
        {activeTab === 'install' && (
          <div className="space-y-4">
            {/* OS Switcher */}
            <div className="flex items-center gap-2 bg-[#090d16] p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveOs('android')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeOs === 'android'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🤖 Android (Chrome / Brave)
              </button>
              <button
                type="button"
                onClick={() => setActiveOs('ios')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeOs === 'ios'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🍏 iPhone iOS (Safari)
              </button>
            </div>

            {/* Android Instructions */}
            {activeOs === 'android' && (
              <div className="p-4 rounded-2xl bg-[#131c31] border border-emerald-500/30 space-y-3 text-xs">
                <h4 className="font-bold text-emerald-300 flex items-center gap-1.5 text-sm">
                  <span>🤖</span>
                  <span>Pasos para Instalar en Android:</span>
                </h4>

                <div className="space-y-2.5 text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <strong className="text-white">Abrir menú del navegador:</strong> Tocá los tres puntos verticales (<MoreVertical className="w-3.5 h-3.5 inline text-slate-400" />) arriba a la derecha en Chrome o Brave.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <strong className="text-white">Instalar la App:</strong> Tocá la opción <em>&ldquo;Instalar aplicación&rdquo;</em> o <em>&ldquo;Agregar a la pantalla principal&rdquo;</em>.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <strong className="text-white">Aceptar Permisos:</strong> Abrí la app desde el ícono en tu pantalla de inicio y tocá <em>&ldquo;Permitir Notificaciones&rdquo;</em>. ¡Listo! Recibirás avisos instantáneos con vibración háptica.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* iOS Instructions */}
            {activeOs === 'ios' && (
              <div className="p-4 rounded-2xl bg-[#131c31] border border-indigo-500/30 space-y-3 text-xs">
                <h4 className="font-bold text-indigo-300 flex items-center gap-1.5 text-sm">
                  <span>🍏</span>
                  <span>Pasos para Instalar en iPhone (iOS 16.4+):</span>
                </h4>

                <div className="space-y-2.5 text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <strong className="text-white">Abrir en Safari:</strong> En iOS es obligatorio usar <strong>Safari</strong> para habilitar las notificaciones push de pantalla de inicio.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <strong className="text-white">Botón Compartir:</strong> Tocá el ícono de compartir (<Share2 className="w-3.5 h-3.5 inline text-indigo-300" />) en la barra inferior de Safari.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <strong className="text-white">Agregar a Inicio:</strong> Deslizá hacia abajo y seleccioná <em>&ldquo;Agregar a pantalla de inicio&rdquo;</em> (<PlusSquare className="w-3.5 h-3.5 inline text-indigo-300" />).
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                      4
                    </span>
                    <div>
                      <strong className="text-white">Habilitar Alertas:</strong> Abrí la app desde el nuevo ícono y presioná <em>&ldquo;Activar Notificaciones&rdquo;</em>. iOS te consultará si querés permitir notificaciones como cualquier app nativa.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
