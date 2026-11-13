import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DiscordEventType, DiscordButtonAction } from '../types/domain';
import {
  Bot,
  Send,
  Webhook,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  ExternalLink,
  Sparkles,
  Gamepad2,
  Clock,
  Scale,
  MessageSquare,
  Flame,
  Settings2,
  Hash,
  Share2,
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

  const [isBotDetailsOpen, setIsBotDetailsOpen] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Endpoint URL representation
  const edgeFunctionEndpoint =
    'https://<tu-proyecto-supabase>.supabase.co/functions/v1/discord-bot';

  const copyEndpointToClipboard = () => {
    navigator.clipboard.writeText(edgeFunctionEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 2500);
  };

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
        message: err instanceof Error ? err.message : 'Error al enviar mensaje de prueba.',
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
    setActionFeedback(`⚡ Botón de Discord ejecutado: "${button.label}" para ${currentUser.displayName}`);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // Convert decimal color to hex string
  const getHexColor = (colorNum?: number) => {
    if (!colorNum) return '#5865F2';
    return `#${colorNum.toString(16).padStart(6, '0')}`;
  };

  // Helper to replace <@discord_id> with styled player mentions
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

  // Event toggle list configuration
  const eventConfigList: { id: DiscordEventType; label: string; icon: string; desc: string }[] = [
    {
      id: 'session_created',
      label: 'Nueva Sesión Creada',
      icon: '🎮',
      desc: 'Avisa con embed del juego o ruleta y horarios.',
    },
    {
      id: 'player_joined',
      label: 'Jugador se Suma con Horario',
      icon: '🙋‍♂️',
      desc: 'Muestra quién entra con su margen ±min (ej. 22:00 ±15m).',
    },
    {
      id: 'roulette_winner',
      label: 'Ganador de Ruleta Ponderada',
      icon: '🎲',
      desc: 'Publica el juego elegido con mención al rol de Discord.',
    },
    {
      id: 'late_ping',
      label: 'Alerta de Tardanza / Reclamo',
      icon: '⏰',
      desc: 'Etiqueta al amigo que pasó su horario pactado.',
    },
    {
      id: 'sanction_issued',
      label: 'Sentencia del Tribunal del Humo',
      icon: '⚖️',
      desc: 'Escarmiento público con quita de Karma y nuevo título.',
    },
    {
      id: 'chat_broadcast',
      label: 'Reenvío de Chat Global',
      icon: '💬',
      desc: 'Espeja mensajes del chat web marcados para Discord.',
    },
    {
      id: 'checkin_update',
      label: 'Confirmación de Check-in en Vivo',
      icon: '✅',
      desc: 'Avisa cuando un jugador ya está online listo en el lobby.',
    },
  ];

  if (!inlineView && !isOpen) return null;

  const content = (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#171b31] via-[#1a2244] to-[#121629] border border-indigo-900/60 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#5865F2] flex items-center justify-center text-white shadow-lg shadow-[#5865F2]/30 flex-shrink-0">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Integración con Canal de Discord
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                100% Gratis
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Notificaciones enriquecidas con Rich Embeds, menciones reales <span className="text-indigo-400 font-mono">&lt;@discord_id&gt;</span> y botones interactivos.
            </p>
          </div>
        </div>

        {!inlineView && onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors self-start sm:self-center"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Action feedback toast */}
      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-indigo-500/20 border border-indigo-500/50 text-indigo-200 text-xs sm:text-sm font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs text-indigo-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Configuración Dual (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Master Enable Card */}
          <div className="p-4 rounded-2xl bg-[#131c31] border border-indigo-900/50 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Estado de la Integración
                </span>
                <span className="text-sm font-bold text-white">
                  {discordConfig.enabled ? '🟢 Integración Activa' : '⚪ Integración Pausada'}
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={discordConfig.enabled}
                  onChange={(e) => updateDiscordConfig({ enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5865F2]"></div>
              </label>
            </div>
          </div>

          {/* OPCIÓN 1: Direct Webhook */}
          <div className="p-5 rounded-2xl bg-[#131c31] border border-indigo-900/50 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Opción 1: Webhook Directo
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Setup: 30 seg
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Pegá acá la URL de webhook creada en Discord (<em>Canal &gt; Ajustes &gt; Integraciones &gt; Webhooks</em>). La app despacha directamente los embeds sin necesidad de desplegar backend.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Discord Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/1234567890/token..."
                  value={discordConfig.webhookUrl}
                  onChange={(e) => updateDiscordConfig({ webhookUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#090d16] border border-slate-700 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-[#5865F2]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Canal Destino
                  </label>
                  <div className="relative">
                    <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={discordConfig.channelName}
                      onChange={(e) => updateDiscordConfig({ channelName: e.target.value })}
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-[#090d16] border border-slate-700 text-xs text-white focus:outline-none focus:border-[#5865F2]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Rol a Mencionar
                  </label>
                  <input
                    type="text"
                    value={discordConfig.mentionRoleId}
                    onChange={(e) => updateDiscordConfig({ mentionRoleId: e.target.value })}
                    placeholder="@here o @Boludos"
                    className="w-full px-3 py-1.5 rounded-xl bg-[#090d16] border border-slate-700 text-xs text-white focus:outline-none focus:border-[#5865F2]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={discordConfig.useEveryoneMention}
                  onChange={(e) => updateDiscordConfig({ useEveryoneMention: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="text-xs text-slate-300">
                  Mencionar <strong>@everyone</strong> al anunciar el juego elegido en ruleta
                </span>
              </label>

              {/* Real Webhook test button */}
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTestingWebhook}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-bold shadow-md shadow-[#5865F2]/30 transition-all disabled:opacity-50"
              >
                {isTestingWebhook ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enviando mensaje a Discord...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>🚀 Enviar Mensaje de Prueba Real a Discord</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* OPCIÓN 2: Serverless Discord Bot (Edge Function) */}
          <div className="rounded-2xl bg-[#131c31] border border-indigo-900/50 overflow-hidden shadow-lg">
            <button
              type="button"
              onClick={() => setIsBotDetailsOpen(!isBotDetailsOpen)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Opción 2: Bot Serverless con Botones Interactivos
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Supabase Edge Function (`discord-bot`)
                  </span>
                </div>
              </div>
              {isBotDetailsOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isBotDetailsOpen && (
              <div className="p-4 pt-0 space-y-3.5 border-t border-slate-800 text-xs">
                <p className="text-slate-300 leading-relaxed text-[11px] mt-3">
                  Permite que tus amigos hagan click en botones de Discord (como <code>Sumarme ±15m</code> o <code>Check-in</code>) y la acción impacte en el sitio web al instante.
                </p>

                {/* Interactions URL to copy */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Interactions Endpoint URL (Pegar en Discord Developer Portal):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={edgeFunctionEndpoint}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-slate-700 text-[11px] text-slate-300 font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={copyEndpointToClipboard}
                      className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex-shrink-0"
                      title="Copiar URL"
                    >
                      {copiedEndpoint ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Application ID
                    </label>
                    <input
                      type="text"
                      value={discordConfig.applicationId || ''}
                      onChange={(e) => updateDiscordConfig({ applicationId: e.target.value })}
                      placeholder="123456789012345678"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Public Key (Firma Ed25519)
                    </label>
                    <input
                      type="text"
                      value={discordConfig.publicKey || ''}
                      onChange={(e) => updateDiscordConfig({ publicKey: e.target.value })}
                      placeholder="e3b0c44298fc1c149afbf4c8996fb924..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#090d16] border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Granular Event Toggles */}
          <div className="p-5 rounded-2xl bg-[#131c31] border border-indigo-900/50 space-y-3 shadow-lg">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings2 className="w-4 h-4 text-indigo-400" />
              <span>Eventos que Notifican al Canal</span>
            </h3>

            <div className="divide-y divide-slate-800/60">
              {eventConfigList.map((event) => {
                const isChecked = discordConfig.events[event.id] ?? true;
                return (
                  <div
                    key={event.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span>{event.icon}</span>
                        <span>{event.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {event.desc}
                      </span>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleDiscordEvent(event.id, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Espejo en Vivo del Canal de Discord (7 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col rounded-3xl bg-[#313338] border border-slate-700 shadow-2xl overflow-hidden min-h-[600px]">
          {/* Discord Channel Bar Header */}
          <div className="h-13 bg-[#2b2d31] border-b border-[#1f2023] px-4 py-3 flex items-center justify-between text-white flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Hash className="w-5 h-5 text-slate-400" />
              <div>
                <span className="font-bold text-sm text-white">
                  {discordConfig.channelName.replace('#', '') || 'boludos-gaming'}
                </span>
                <span className="text-[11px] text-slate-400 ml-2 hidden sm:inline">
                  Canal oficial de coordinación, ruletas y escarmiento
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1f22] text-slate-300 text-[11px] font-semibold border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>En Vivo ({discordLogs.length})</span>
              </span>
            </div>
          </div>

          {/* Discord Channel Feed Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-5 bg-[#313338]">
            {discordLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <Bot className="w-12 h-12 text-[#5865F2] mb-3 opacity-60" />
                <p className="font-bold text-white text-sm">
                  Canal de Discord esperando actividad
                </p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Creá una sesión, girá la ruleta o emití una sanción en el Tribunal para ver cómo se generan los embeds con menciones y botones interactivos.
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
                    <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-md">
                      <Bot className="w-6 h-6" />
                    </div>

                    {/* Message Body */}
                    <div className="flex-1 min-w-0">
                      {/* Message author line */}
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm hover:underline cursor-pointer">
                          Boludos Gaming Bot
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-[#5865F2] text-[10px] font-bold text-white uppercase tracking-wider">
                          BOT
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Hoy'}
                        </span>

                        {/* Delivery badge */}
                        <div className="ml-auto">
                          {log.deliveredToWebhook ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                              Webhook Real ✅
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/40">
                              Simulación Local 🖥️
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content with mentions */}
                      {log.content && (
                        <div className="text-slate-200 mt-1 text-xs sm:text-sm leading-relaxed">
                          {renderDiscordContentWithMentions(log.content)}
                        </div>
                      )}

                      {/* Rich Embed Card */}
                      {log.embed && (
                        <div
                          className="mt-2.5 rounded-lg bg-[#2b2d31] p-3.5 border-l-4 space-y-2.5 max-w-xl shadow-md"
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
                            <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                              {log.embed.description}
                            </p>
                          )}

                          {/* Embed Fields Grid */}
                          {log.embed.fields && log.embed.fields.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#3f4147]">
                              {log.embed.fields.map((field, fIdx) => (
                                <div key={fIdx} className="bg-[#1e1f22]/50 p-2 rounded-md">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    {field.name}
                                  </span>
                                  <span className="text-xs font-semibold text-white block mt-0.5">
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Footer */}
                          {log.embed.footer && (
                            <div className="pt-1 text-[10px] text-slate-400 flex items-center gap-1">
                              <span>🎮</span>
                              <span>{log.embed.footer.text}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Discord Buttons */}
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
                                title={`Simular click en Discord: ${btn.actionType}`}
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
          <div className="p-3 bg-[#313338] border-t border-[#232428] flex-shrink-0">
            <div className="px-3.5 py-2.5 rounded-lg bg-[#383a40] text-slate-400 text-xs flex items-center justify-between">
              <span>
                Mensaje a #{discordConfig.channelName.replace('#', '') || 'boludos-gaming'} (Solo lectura del Bot)
              </span>
              <Bot className="w-4 h-4 text-slate-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // If inline, return direct layout
  if (inlineView) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {content}
      </div>
    );
  }

  // Otherwise, return modal wrapper
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-[#090d16] border border-indigo-900/80 rounded-3xl p-4 sm:p-6 shadow-2xl">
        {content}
      </div>
    </div>
  );
};
