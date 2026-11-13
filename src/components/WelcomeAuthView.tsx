import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { isDiscordOAuthProviderEnabled } from '../lib/supabaseClient';
import {
  Gamepad2,
  Sparkles,
  UserPlus,
  Clock,
  Flame,
  Dices,
  ArrowRight,
  GraduationCap,
  CheckCircle2,
  Radio,
  Zap,
  Bot,
  Users,
  Check,
  AlertCircle,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150&auto=format&fit=crop&q=80',
];

export const WelcomeAuthView: React.FC = () => {
  const {
    players,
    loginAsProfile,
    createAndLoginProfile,
    loginWithDiscord,
    setShowOnboardingModal,
    isSupabaseConnected,
    discordConfig,
  } = useApp();

  // Registration Form State
  const [displayName, setDisplayName] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingOAuth, setIsCheckingOAuth] = useState(false);

  const activeAvatar = customAvatarUrl.trim() ? customAvatarUrl.trim() : selectedAvatar;

  const handleDiscordOAuthClick = async () => {
    setOauthBanner(null);
    setIsCheckingOAuth(true);
    try {
      const oauthEnabled = await isDiscordOAuthProviderEnabled();
      if (!oauthEnabled) {
        setOauthBanner(
          '⚠️ El proveedor OAuth2 de Discord aún no fue activado en el panel de Supabase (Authentication -> Providers -> Discord). Podés ingresar ahora mismo poniendo tu Usuario de Discord y Apodo acá abajo (se guarda directo en la base de datos de Supabase), o activar el Client ID/Secret de Discord en Supabase.'
        );
        return;
      }
      await loginWithDiscord();
    } catch (err: unknown) {
      setOauthBanner(
        err instanceof Error
          ? err.message
          : '⚠️ El proveedor OAuth2 de Discord aún no fue activado en el panel de Supabase (Authentication -> Providers -> Discord). Podés ingresar ahora mismo poniendo tu Usuario de Discord y Apodo acá abajo (se guarda directo en la base de datos de Supabase), o activar el Client ID/Secret de Discord en Supabase.'
      );
    } finally {
      setIsCheckingOAuth(false);
    }
  };

  const handleCreateOrLoginProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = displayName.trim();
    const cleanDiscord = discordUsername.trim().replace(/^@/, '');

    if (!cleanName) {
      setFormError('Por favor ingresá tu nombre o apodo para identificarte en el grupo.');
      return;
    }
    if (!cleanDiscord) {
      setFormError('Ingresá tu usuario de Discord (ej: santi.cepe) para sincronizar tu perfil.');
      return;
    }

    // Check if player already exists in group (case-insensitive)
    const existing = players.find(
      (p) => p.discordUsername.trim().toLowerCase().replace(/^@/, '') === cleanDiscord.toLowerCase()
    );

    if (existing) {
      loginAsProfile(existing.id);
      return;
    }

    try {
      setIsSubmitting(true);
      createAndLoginProfile({
        displayName: cleanName,
        discordUsername: cleanDiscord,
        discordId: discordId.trim() || undefined,
        avatarUrl: activeAvatar,
      });

      // Automatically launch the 4-step Onboarding Tour & Initial Setup
      setShowOnboardingModal(true);
    } catch (err: unknown) {
      console.error('Error al crear perfil:', err);
      setFormError('Ocurrió un error al crear tu perfil. Intentá nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectExistingPlayer = (playerId: string, openTour = false) => {
    loginAsProfile(playerId);
    if (openTour) {
      setShowOnboardingModal(true);
    }
  };

  const getKarmaBadgeClasses = (karma: number) => {
    if (karma >= 80) {
      return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 shadow-emerald-950/40';
    }
    if (karma >= 50) {
      return 'bg-amber-950/80 text-amber-400 border-amber-500/40 shadow-amber-950/40';
    }
    return 'bg-rose-950/80 text-rose-400 border-rose-500/40 shadow-rose-950/40';
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background Neon Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px]" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 w-full">
        {/* Top Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8 pb-4 border-b border-indigo-900/30 text-xs sm:text-sm">
          <div className="flex items-center gap-2 text-indigo-300 font-medium">
            <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>Boludos Gaming Platform v2.4</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#131c31] border border-indigo-500/20 text-slate-300">
              <Bot className="w-3.5 h-3.5 text-[#5865F2]" />
              <span>
                Bot Discord:{' '}
                <strong className="text-slate-100 font-semibold">
                  #{discordConfig?.channelName || 'boludos-gaming'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#131c31] border border-indigo-500/20">
              <Radio
                className={`w-3.5 h-3.5 ${
                  isSupabaseConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <span className="text-slate-300">
                {isSupabaseConnected ? 'Supabase Realtime Conectado 🟢' : 'Conectando con Supabase... 🟡'}
              </span>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 mb-4 group">
            <Gamepad2 className="w-12 h-12 text-indigo-400 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300" />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white mb-4">
            BOLUDOS{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              GAMING
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            La plataforma inteligente para el grupo de amigos: matchmaking sin fricción, ruleta
            automática ponderada y control de puntualidad con el Tribunal del Humo.
          </p>

          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-8 text-left">
            <div className="p-3.5 rounded-xl bg-[#131c31]/90 border border-indigo-500/20 hover:border-indigo-400/40 transition-all">
              <div className="flex items-center gap-2 font-bold text-sm text-indigo-300 mb-1">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Auto-Inscripción</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Anotate una vez en tu semana y el sistema te enrola solo todos los días sin preguntar.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#131c31]/90 border border-indigo-500/20 hover:border-indigo-400/40 transition-all">
              <div className="flex items-center gap-2 font-bold text-sm text-purple-300 mb-1">
                <Dices className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Ruleta 1–5★ Ponderada</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cruza los catálogos y límites de cupo para elegir el mejor juego con animación en vivo.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#131c31]/90 border border-indigo-500/20 hover:border-indigo-400/40 transition-all">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-300 mb-1">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Precisión ±15m y Baja</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Margen de horario exacto y botón instantáneo &quot;Hoy No Juego&quot; para salvarte.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#131c31]/90 border border-indigo-500/20 hover:border-indigo-400/40 transition-all">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-300 mb-1">
                <Flame className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Tribunal del Humo</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Score de Karma, títulos automáticos (Reloj Suizo vs Fantasma) y bot en vivo en Discord.
              </p>
            </div>
          </div>
        </div>

        {/* Main 2-Column Split: Auth / Registration vs Direct Player Access */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Column: Discord OAuth + Quick Register */}
          <div className="bg-[#131c31]/80 backdrop-blur-md rounded-2xl border border-indigo-500/20 p-6 sm:p-8 shadow-xl shadow-indigo-950/20">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-indigo-900/40">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Ingresar con tu Cuenta de Discord</h2>
                <p className="text-xs text-slate-400">
                  Entrá con tu usuario de Discord o creá tu perfil directo en Supabase
                </p>
              </div>
            </div>

            {/* Discord OAuth Action */}
            <div className="mb-6">
              <button
                type="button"
                onClick={handleDiscordOAuthClick}
                disabled={isCheckingOAuth}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-[#5865F2] hover:bg-[#4752c4] active:scale-[0.99] transition-all shadow-lg shadow-[#5865F2]/25 focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-2 focus:ring-offset-[#131c31] disabled:opacity-60 cursor-pointer"
              >
                <Bot className="w-5 h-5" />
                <span>🔗 Conectar con Discord OAuth2 Oficial</span>
              </button>

              {oauthBanner && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 text-xs leading-relaxed animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-amber-300">Aviso de Proveedor OAuth2</p>
                      <p className="text-amber-200/90 leading-normal">{oauthBanner}</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-center text-slate-400 mt-2">
                Conexión segura oficial. Sincroniza automáticamente tu avatar y tag de Discord.
              </p>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#131c31] px-3 text-slate-400 font-semibold tracking-wider">
                  ó ingresá directamente con tu usuario
                </span>
              </div>
            </div>

            {/* Quick Registration / Direct Profile Form */}
            <form onSubmit={handleCreateOrLoginProfile} className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-200 block mb-1">
                  Nombre o Apodo en el Grupo *
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej: Santi, Tincho, El Chino..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b1120] border border-indigo-500/20 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
                />
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-200 block mb-1">
                  Usuario de Discord (Tag) *
                </span>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm font-mono">
                    @
                  </span>
                  <input
                    type="text"
                    value={discordUsername}
                    onChange={(e) => setDiscordUsername(e.target.value)}
                    placeholder="santi.cepe o tincho_gamer"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#0b1120] border border-indigo-500/20 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-200">
                    Discord ID Numérico (Opcional)
                  </span>
                  <span className="text-[10px] text-indigo-400 font-medium">
                    Para menciones directas
                  </span>
                </div>
                <input
                  type="text"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  placeholder="Ej: 394829104829102938"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b1120] border border-indigo-500/20 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Permite al bot enviar menciones directas &lt;@id&gt; con botón de check-in en Discord.
                </p>
              </div>

              {/* Avatar Selector */}
              <div>
                <span className="text-xs font-semibold text-slate-200 block mb-2">
                  Elegí tu Avatar o pegá una URL
                </span>
                <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
                  {PRESET_AVATARS.map((avatar, idx) => {
                    const isSelected = activeAvatar === avatar;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedAvatar(avatar);
                          setCustomAvatarUrl('');
                        }}
                        className={`relative rounded-full p-0.5 transition-all shrink-0 ${
                          isSelected
                            ? 'ring-2 ring-indigo-400 scale-105 shadow-md shadow-indigo-500/30'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={avatar}
                          alt={`Avatar ${idx + 1}`}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute -bottom-0.5 -right-0.5 bg-indigo-500 text-white rounded-full p-0.5">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="url"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  placeholder="O pegá URL de imagen personalizada..."
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0b1120] border border-slate-700/60 text-slate-300 text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.99] shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>🚀 Entrar a Boludos Gaming</span>
              </button>
            </form>
          </div>

          {/* Right Column: Direct Profile Picker */}
          <div className="bg-[#131c31]/80 backdrop-blur-md rounded-2xl border border-indigo-500/20 p-6 sm:p-8 shadow-xl shadow-indigo-950/20">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-indigo-900/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Miembros Registrados en el Grupo</h2>
                  <p className="text-xs text-slate-400">
                    Acceso directo para miembros ya registrados en Supabase ({players.length} perfiles)
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 border border-indigo-500/30 text-indigo-300">
                {players.length} Registrados
              </span>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-700/60 bg-[#0b1120]/50 space-y-3">
                <Gamepad2 className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-200">
                  Todavía no hay miembros registrados en la base de datos.
                </p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  ¡Sé el primero en crear tu perfil a la izquierda para inaugurar el servidor!
                </p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
                {players.map((player) => {
                  const karmaClasses = getKarmaBadgeClasses(player.karmaScore);

                  return (
                    <div
                      key={player.id}
                      className="p-3.5 rounded-xl bg-[#0b1120]/70 border border-indigo-500/15 hover:border-indigo-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      {/* Avatar & Player Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <img
                            src={
                              player.avatarUrl ||
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
                            }
                            alt={player.displayName}
                            className="w-11 h-11 rounded-full object-cover border border-indigo-500/30 group-hover:scale-105 transition-transform"
                          />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0b1120]"
                            title="Online"
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white truncate">
                              {player.displayName}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${karmaClasses}`}
                            >
                              {player.karmaScore} Karma
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                            <span className="font-mono text-[11px] text-slate-400 truncate">
                              @{player.discordUsername}
                            </span>
                            <span>•</span>
                            <span className="text-[11px] text-indigo-300 font-medium truncate">
                              {player.activeTitle || '⌚ Reloj Suizo'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectExistingPlayer(player.id, true)}
                          title="Entrar y abrir el Tour de Instrucciones"
                          className="px-2.5 py-2 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Tour</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectExistingPlayer(player.id, false)}
                          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                        >
                          <span>Entrar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-indigo-900/30 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Sincronización multi-pestaña instantánea
              </span>
              <span className="text-[11px] text-slate-500">Datos sincronizados con Supabase Live</span>
            </div>
          </div>
        </div>

        {/* Argentine Gamer Cultural Touch Footer */}
        <div className="mt-12 text-center text-xs text-slate-500">
          <p>
            🎮 Hecho para que el grupo no pase 40 minutos en Discord decidiendo qué carajo jugar.
          </p>
        </div>
      </div>
    </div>
  );
};
