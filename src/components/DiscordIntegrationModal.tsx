import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DiscordEventType, DiscordButtonAction } from '../types/domain';
import {
  Bot,
  Send,
  Webhook,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Settings2,
  Hash,
} from 'lucide-react';

export interface DiscordIntegrationModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  inlineView?: boolean;
}

export const DiscordIntegrationModal: React.FC<DiscordIntegrationModalProps> = ({
  isOpen = true,
  onClose,
  inlineView = false,
}) => {
  const {
    discordConfig,
    discordLogs,
    updateDiscordConfig,
    toggleDiscordEvent,
    sendTestDiscordNotification,
    triggerDiscordButtonInteraction,
    players,
    currentUser,
  } = useApp();

  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleTestNotification = async () => {
    setIsTestingWebhook(true);
    setTestResult(null);
    try {
      const result = await sendTestDiscordNotification();
      setTestResult(result);
      setTimeout(() => setTestResult(null), 6000);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Error al enviar prueba.',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleButtonClick = (button: DiscordButtonAction) => {
    if (button.actionType === 'open_app') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    triggerDiscordButtonInteraction(button.actionType, button.sessionId || '', currentUser.discordId);
    setActionFeedback(`${button.label} → ${currentUser.displayName}`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const getHexColor = (colorNum?: number) => {
    if (!colorNum) return '#5865F2';
    return `#${colorNum.toString(16).padStart(6, '0')}`;
  };

  const renderDiscordContentWithMentions = (content: string) => {
    const parts = content.split(/(<@\d+>|@everyone|@here|<@&\w+>)/g);
    return parts.map((part, i) => {
      if (part.startsWith('<@') && part.endsWith('>')) {
        const id = part.replace(/[<@>]/g, '');
        const player = players.find((p) => p.discordId === id);
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#5865F2]/20 text-[#c9cdfb] font-semibold text-xs border border-[#5865F2]/40"
          >
            @{player ? player.displayName : id}
          </span>
        );
      }
      if (part === '@everyone' || part === '@here') {
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#5865F2]/30 text-white font-bold text-xs"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const eventConfigList: { id: DiscordEventType; label: string; icon: string }[] = [
    { id: 'session_created', label: 'Nueva sesión', icon: '🎮' },
    { id: 'player_joined', label: 'Jugador se suma', icon: '🙋‍♂️' },
    { id: 'roulette_winner', label: 'Ganador ruleta', icon: '🎲' },
    { id: 'late_ping', label: 'Alerta tardanza', icon: '⏰' },
    { id: 'sanction_issued', label: 'Sentencia Tribunal', icon: '⚖️' },
    { id: 'chat_broadcast', label: 'Reenvío chat', icon: '💬' },
    { id: 'checkin_update', label: 'Check-in en vivo', icon: '✅' },
    { id: 'session_callout', label: 'Llamado a sesión', icon: '📣' },
  ];

  if (!inlineView && !isOpen) return null;

  const content = (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-md bg-card/50 backdrop-blur-sm border border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#5865F2] flex items-center justify-center text-white shrink-0">
            <Bot className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Discord
            </h2>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                discordConfig.enabled
                  ? 'bg-success/15 text-success border-success/40'
                  : 'bg-secondary/60 text-muted-foreground border-border/70'
              }`}
            >
              {discordConfig.enabled ? 'Activo' : 'Pausado'}
            </span>
          </div>
        </div>

        {!inlineView && onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            className="p-2 rounded-md bg-secondary/60 hover:bg-accent/70 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="p-3 rounded-md bg-primary/20 border border-[#5865F2]/50 text-primary text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-warning" strokeWidth={1.75} />
            <span>{actionFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            title="Descartar"
            aria-label="Descartar aviso"
            className="p-1 text-primary hover:text-white"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: Configuración (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Master Enable Card */}
          <div className="p-4 rounded-md bg-card/50 backdrop-blur-sm border border-border/70">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Integración
              </span>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={discordConfig.enabled}
                  onChange={(e) => updateDiscordConfig({ enabled: e.target.checked })}
                  aria-label="Activar integración con Discord"
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-secondary/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5865F2]"></div>
              </label>
            </div>
          </div>

          {/* Direct Webhook */}
          <div className="p-4 rounded-md bg-card/50 backdrop-blur-sm border border-border/70 space-y-3.5">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Webhook Directo
                </h3>
              </div>
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTestingWebhook}
                title="Enviar mensaje de prueba a Discord"
                aria-label="Probar webhook"
                className="p-1.5 rounded-md bg-[#5865F2] hover:bg-[#4752c4] text-white transition-colors disabled:opacity-50"
              >
                {isTestingWebhook ? (
                  <span className="block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" strokeWidth={1.75} />
                )}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="URL del webhook"
                  value={discordConfig.webhookUrl}
                  onChange={(e) => updateDiscordConfig({ webhookUrl: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md bg-background/45 border border-border/70 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-[#5865F2]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                    Canal
                  </label>
                  <div className="relative">
                    <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={discordConfig.channelName}
                      onChange={(e) => updateDiscordConfig({ channelName: e.target.value })}
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-md bg-background/45 border border-border/70 text-xs text-white focus:outline-none focus:border-[#5865F2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                    Rol
                  </label>
                  <input
                    type="text"
                    value={discordConfig.mentionRoleId}
                    onChange={(e) => updateDiscordConfig({ mentionRoleId: e.target.value })}
                    placeholder="@here"
                    className="w-full px-3 py-1.5 rounded-md bg-background/45 border border-border/70 text-xs text-white focus:outline-none focus:border-[#5865F2]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={discordConfig.useEveryoneMention}
                  onChange={(e) => updateDiscordConfig({ useEveryoneMention: e.target.checked })}
                  className="w-4 h-4 rounded bg-secondary/60 border-border/70 text-primary focus:ring-0"
                />
                <span className="text-xs text-muted-foreground">
                  <strong>@everyone</strong> en ruleta
                </span>
              </label>

              {testResult && (
                <div
                  className={`p-2.5 rounded-md text-xs flex items-center gap-2 ${
                    testResult.ok
                      ? 'bg-success/20 text-success border border-success/40'
                      : 'bg-destructive/20 text-destructive border border-destructive/40'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Granular Event Toggles */}
          <div className="p-4 rounded-md bg-card/50 backdrop-blur-sm border border-border/70 space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-border/70 pb-2">
              <Settings2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Eventos</span>
            </h3>

            <div className="divide-y divide-[#232834]">
              {eventConfigList.map((event) => {
                const isChecked = discordConfig.events[event.id] ?? true;
                return (
                  <div
                    key={event.id}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 font-medium text-white">
                      <span>{event.icon}</span>
                      <span>{event.label}</span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleDiscordEvent(event.id, e.target.checked)}
                        aria-label={event.label}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-secondary/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-success"></div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Espejo en Vivo del Canal de Discord (7 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col rounded-lg bg-[#313338]/85 backdrop-blur-md border border-border/70 overflow-hidden min-h-[560px]">
          {/* Discord Channel Bar Header */}
          <div className="h-12 bg-[#2b2d31]/85 border-b border-[#1f2023] px-4 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
              <span className="font-bold text-sm text-white">
                {discordConfig.channelName.replace('#', '') || 'boludos-gaming'}
              </span>
            </div>

            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1e1f22] text-muted-foreground text-[11px] font-semibold border border-border/70">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>En Vivo ({discordLogs.length})</span>
            </span>
          </div>

          {/* Discord Channel Feed Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-5 bg-[#313338]/85 backdrop-blur-md">
            {discordLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <Bot className="w-10 h-10 text-primary mb-2 opacity-60" strokeWidth={1.75} />
                <p className="font-semibold text-white text-xs">
                  Sin actividad en el feed
                </p>
              </div>
            ) : (
              discordLogs.map((log) => {
                const hexColor = getHexColor(log.embed?.color);

                return (
                  <div
                    key={log.id}
                    className="group flex gap-3 text-sm animate-in fade-in slide-in-from-bottom-1 duration-200"
                  >
                    {/* Bot Avatar */}
                    <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md">
                      <Bot className="w-5 h-5" strokeWidth={1.75} />
                    </div>

                    {/* Message Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          Boludos Gaming Bot
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#5865F2] text-[10px] font-bold text-white uppercase tracking-wider">
                          BOT
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Hoy'}
                        </span>

                        <div className="ml-auto">
                          {log.deliveredToWebhook ? (
                            <span className="inline-flex items-center text-[10px] font-semibold text-success bg-success/15 px-2 py-0.5 rounded border border-success/40">
                              Webhook
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-semibold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/40">
                              Feed
                            </span>
                          )}
                        </div>
                      </div>

                      {log.content && (
                        <div className="text-foreground mt-1 text-xs sm:text-sm leading-relaxed">
                          {renderDiscordContentWithMentions(log.content)}
                        </div>
                      )}

                      {log.embed && (
                        <div
                          className="mt-2.5 rounded-lg bg-[#2b2d31]/85 p-3.5 border-l-4 space-y-2.5 max-w-xl shadow-md"
                          style={{ borderLeftColor: hexColor }}
                        >
                          {log.embed.title && (
                            <h4
                              className="font-bold text-sm sm:text-base text-white"
                              style={{ color: hexColor }}
                            >
                              {log.embed.title}
                            </h4>
                          )}

                          {log.embed.description && (
                            <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">
                              {log.embed.description}
                            </p>
                          )}

                          {log.embed.fields && log.embed.fields.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#3f4147]">
                              {log.embed.fields.map((field, fIdx) => (
                                <div key={fIdx} className="bg-[#1e1f22]/50 p-2 rounded-md">
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    {field.name}
                                  </span>
                                  <span className="text-xs font-semibold text-white block mt-0.5">
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {log.embed.footer && (
                            <div className="pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                              <span>🎮</span>
                              <span>{log.embed.footer.text}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {log.buttons && log.buttons.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {log.buttons.map((btn, bIdx) => {
                            let btnStyleClass = 'bg-[#4e5058] hover:bg-[#6d6f78] text-white';
                            if (btn.style === 'primary') {
                              btnStyleClass = 'bg-[#5865F2] hover:bg-[#4752c4] text-white';
                            } else if (btn.style === 'success') {
                              btnStyleClass = 'bg-[#248046] hover:bg-[#1a6334] text-white';
                            } else if (btn.style === 'danger') {
                              btnStyleClass = 'bg-[#da373c] hover:bg-[#a1282c] text-white';
                            }

                            return (
                              <button
                                key={bIdx}
                                type="button"
                                onClick={() => handleButtonClick(btn)}
                                className={`px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${btnStyleClass}`}
                                title={btn.label}
                              >
                                <span>{btn.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Fake Discord input footer */}
          <div className="p-3 bg-[#313338]/85 backdrop-blur-md border-t border-[#232428] shrink-0">
            <div className="px-3.5 py-2 rounded-lg bg-[#383a40] text-muted-foreground text-xs flex items-center justify-between">
              <span className="font-mono">
                #{discordConfig.channelName.replace('#', '') || 'boludos-gaming'} (solo lectura)
              </span>
              <Bot className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (inlineView) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-background/78 backdrop-blur-xl border border-white/12 ring-1 ring-inset ring-white/5 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.85)] rounded-lg p-4 sm:p-6">
        {content}
      </div>
    </div>
  );
};
