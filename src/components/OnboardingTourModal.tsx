import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  DAYS_OF_WEEK,
  GAME_CATEGORIES,
  CategoryPreferenceLevel,
  DayOfWeekKey,
  GameRating,
  PrecisionMinutes,
  WeeklySchedule,
} from '../types/domain';
import { createDefaultWeeklySchedule } from '../lib/matchmakingEngine';
import { WeeklyBarsScheduleEditor } from './WeeklyBarsScheduleEditor';
import {
  X,
  Zap,
  Clock,
  Dices,
  Flame,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Gamepad2,
  Plus,
  Star,
  Heart,
  Meh,
  HeartCrack,
  Check,
  CalendarCheck,
  ChevronRight,
  HelpCircle,
  Users,
} from 'lucide-react';

const PRECISION_OPTIONS: PrecisionMinutes[] = [5, 15, 30, 60];

const RATING_LABELS: Record<GameRating, { label: string; desc: string; emoji: string }> = {
  1: { emoji: '🥱', label: 'Solo si me obligan', desc: '-15 pts de penalización en ruleta' },
  2: { emoji: '😐', label: 'Zafa', desc: 'Sin penalización ni bonus' },
  3: { emoji: '👍', label: 'Me copa', desc: 'Buen juego para el grupo' },
  4: { emoji: '🔥', label: 'Juegazo', desc: 'Prioridad alta en el cruce de gustos' },
  5: { emoji: '👑', label: 'Vicio Total', desc: '+5 pts de bonus de unanimidad' },
};

function getSafeInitialSchedule(userSchedule?: WeeklySchedule): WeeklySchedule {
  if (userSchedule && Object.keys(userSchedule).length >= 7) {
    return userSchedule;
  }
  if (typeof createDefaultWeeklySchedule === 'function') {
    try {
      return createDefaultWeeklySchedule();
    } catch {
      // fallback below
    }
  }
  return {
    mon: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    tue: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    wed: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    thu: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    fri: { enabled: true, availableFrom: '22:30', availableUntil: '02:00', precisionMinutes: 15 },
    sat: { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 },
    sun: { enabled: true, availableFrom: '21:30', availableUntil: '00:30', precisionMinutes: 15 },
  };
}

export const OnboardingTourModal: React.FC = () => {
  const {
    showOnboardingModal,
    setShowOnboardingModal,
    currentUser,
    updateWeeklySchedule,
    updateCategoryPreferences,
    games,
    preferences,
    updateGamePreference,
    addGame,
    completeOnboarding,
  } = useApp();

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 2 Draft: Weekly Schedule
  const [draftSchedule, setDraftSchedule] = useState<WeeklySchedule>(() =>
    getSafeInitialSchedule(currentUser.weeklySchedule)
  );

  // Step 3 Draft: Category Preferences
  const [draftCategoryPrefs, setDraftCategoryPrefs] = useState<Record<string, CategoryPreferenceLevel>>(() => {
    return currentUser.categoryPreferences || {};
  });

  // Step 4 Draft: Add Game form expansion & inputs
  const [showAddGameForm, setShowAddGameForm] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameCategory, setNewGameCategory] = useState(GAME_CATEGORIES[0]?.id || 'Shooter Táctico');
  const [newGameDesc, setNewGameDesc] = useState('');
  const [newGameMinPlayers, setNewGameMinPlayers] = useState(2);
  const [newGameMaxPlayers, setNewGameMaxPlayers] = useState(5);
  const [newGameCoverUrl, setNewGameCoverUrl] = useState('');
  const [gameFilterQuery, setGameFilterQuery] = useState('');
  const [gameCategoryFilter, setGameCategoryFilter] = useState('all');

  // Keep drafts synced if user changes or modal opens
  useEffect(() => {
    if (showOnboardingModal) {
      setDraftSchedule(getSafeInitialSchedule(currentUser.weeklySchedule));
      setDraftCategoryPrefs(currentUser.categoryPreferences || {});
      setCurrentStep(1);
    }
  }, [showOnboardingModal, currentUser]);

  if (!showOnboardingModal) {
    return null;
  }

  // Step 3 Category Preferences Handlers
  const handleCategoryLevel = (categoryId: string, level: CategoryPreferenceLevel) => {
    const updated = { ...draftCategoryPrefs, [categoryId]: level };
    setDraftCategoryPrefs(updated);
    updateCategoryPreferences(updated);
  };

  const handleSetAllCategories = (level: CategoryPreferenceLevel) => {
    const updated: Record<string, CategoryPreferenceLevel> = {};
    GAME_CATEGORIES.forEach((cat) => {
      updated[cat.id] = level;
    });
    setDraftCategoryPrefs(updated);
    updateCategoryPreferences(updated);
  };

  // Step 4 Handlers
  const handleAddNewGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    const created = addGame({
      name: newGameName.trim(),
      category: newGameCategory,
      description: newGameDesc.trim() || undefined,
      minPlayers: Math.max(1, newGameMinPlayers),
      maxPlayers: Math.max(newGameMinPlayers, newGameMaxPlayers),
      coverUrl:
        newGameCoverUrl.trim() ||
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
      tags: [newGameCategory],
      averageDurationMins: 90,
    });

    // Mark as played by current user with 4 stars if game returned
    if (created && created.id) {
      updateGamePreference(created.id, true, 4);
    }

    // Reset form
    setNewGameName('');
    setNewGameDesc('');
    setNewGameCoverUrl('');
    setShowAddGameForm(false);
  };

  // Filtered games catalog for Step 4
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(gameFilterQuery.toLowerCase()) ||
        g.category.toLowerCase().includes(gameFilterQuery.toLowerCase());
      const matchesCategory = gameCategoryFilter === 'all' || g.category === gameCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [games, gameFilterQuery, gameCategoryFilter]);

  // Step Navigation
  const handleNext = () => {
    if (currentStep === 2) {
      updateWeeklySchedule(draftSchedule);
    } else if (currentStep === 3) {
      updateCategoryPreferences(draftCategoryPrefs);
    }

    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleFinalFinish = () => {
    updateWeeklySchedule(draftSchedule);
    updateCategoryPreferences(draftCategoryPrefs);
    completeOnboarding();
    setShowOnboardingModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#131c31] border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-950/50 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-indigo-900/40 flex items-center justify-between shrink-0 bg-[#0d1424]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>Tour Inicial &amp; Configuración</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/30 text-indigo-300 font-semibold">
                  Paso {currentStep} de 4
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configurá tu perfil de {currentUser.displayName} para matchmaking automático
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowOnboardingModal(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            title="Cerrar tour"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar & Step Navigation Pills */}
        <div className="px-4 sm:px-6 pt-3 pb-2 bg-[#0e1627] border-b border-indigo-900/30 shrink-0">
          <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-1.5 transition-all duration-300 rounded-full"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { step: 1, label: '1. Cómo Funciona', icon: Zap },
              { step: 2, label: '2. Rutina Semanal', icon: CalendarCheck },
              { step: 3, label: '3. Categorías', icon: Heart },
              { step: 4, label: '4. Tus Juegos', icon: Gamepad2 },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentStep === item.step;
              const isPast = currentStep > item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => {
                    if (currentStep === 2) updateWeeklySchedule(draftSchedule);
                    if (currentStep === 3) updateCategoryPreferences(draftCategoryPrefs);
                    setCurrentStep(item.step as 1 | 2 | 3 | 4);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : isPast
                      ? 'bg-indigo-950/70 text-indigo-300 hover:bg-indigo-900/80'
                      : 'bg-slate-800/40 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 text-slate-200">
          {/* STEP 1: TOUR DE INSTRUCCIONES */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center max-w-xl mx-auto mb-4">
                <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-400">
                  Bienvenido al grupo
                </span>
                <h3 className="text-2xl font-black text-white mt-1">
                  Las 4 Reglas de Oro de Boludos Gaming
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Diseñado para jugar más, organizar en 5 segundos y erradicar el chamuyo con la puntualidad.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Rule 1 */}
                <div className="p-4 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-emerald-500/40 transition-all flex gap-3.5">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 h-fit">
                    <CalendarCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>1. Horarios Default Automáticos</span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      Configurás tu semana una sola vez (ej: Lun a Jue de 22:00 a 01:00) y el
                      sistema te anota solo todos los días que jugás sin preguntarte nada.
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      ⚡ Cero preguntas de &quot;¿sale ese hoy?&quot;
                    </span>
                  </div>
                </div>

                {/* Rule 2 */}
                <div className="p-4 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-amber-500/40 transition-all flex gap-3.5">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 h-fit">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>2. Botón &quot;🚫 Hoy No Juego&quot;</span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      Si un día te surge un plan, cenás afuera o llegás más tarde, tocás &quot;Hoy no
                      juego&quot; (o cambiás solo el horario de hoy). Te desanota al instante y te salvás
                      del Tribunal.
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-semibold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/30">
                      🛡️ Baja limpia sin penalización
                    </span>
                  </div>
                </div>

                {/* Rule 3 */}
                <div className="p-4 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-purple-500/40 transition-all flex gap-3.5">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0 h-fit">
                    <Dices className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>3. Sincronía 1–5★ y Ruleta</span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      La app cruza los juegos que tienen todos los presentes respetando el cupo mínimo
                      y máximo. La ruleta pondera los favoritos evitando juegos que alguien califique 1★.
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-semibold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-500/30">
                      🎲 Sub-lobbies si sobra gente
                    </span>
                  </div>
                </div>

                {/* Rule 4 */}
                <div className="p-4 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-rose-500/40 transition-all flex gap-3.5">
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0 h-fit">
                    <Flame className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>4. El Tribunal del Humo</span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                      Si prometés 22:00 ±15m y no hacés check-in antes de las 22:15, perdés Karma y
                      prioridad de cupo cuando haya más jugadores que slots disponibles en el juego.
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-semibold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-500/30">
                      ⚖️ Reloj Suizo vs Fantasma Supremo
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="text-xs text-indigo-200">
                    A continuación configuraremos tu rutina semanal, tus categorías favoritas y los
                    juegos que jugás. Te tomará 1 minuto.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: RUTINA SEMANAL DEFAULT (7 BARRAS INTERACTIVAS) */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-emerald-400" />
                  <span>Tu Rutina Semanal — Selector de 7 Barras</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pintá tus franjas horarias arrastrando sobre cada día. Hacé clic derecho sobre una franja para elegir la probabilidad (máx 95% en default).
                </p>
              </div>

              <WeeklyBarsScheduleEditor
                schedule={draftSchedule}
                onChange={setDraftSchedule}
                compact
              />
            </div>
          )}

          {/* STEP 3: CATEGORÍAS */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Heart className="w-5 h-5 text-rose-400" />
                    <span>Tus Preferencias por Categoría</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Definí tu afinidad con cada género para orientar la ruleta y las sugerencias grupales.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetAllCategories('like')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    💚 Todo me gusta
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllCategories('neutral')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    😐 Reset Neutral
                  </button>
                </div>
              </div>

              {/* Categories Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {GAME_CATEGORIES.map((cat) => {
                  const currentLevel = draftCategoryPrefs[cat.id] || 'neutral';

                  return (
                    <div
                      key={cat.id}
                      className="p-3.5 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-indigo-500/40 transition-all flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{cat.emoji}</span>
                          <span className="font-bold text-sm text-white">{cat.label}</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{cat.description}</p>
                      </div>

                      {/* 3 Interactive Buttons */}
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleCategoryLevel(cat.id, 'like')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            currentLevel === 'like'
                              ? 'bg-emerald-950 border border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40'
                              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Me gusta</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCategoryLevel(cat.id, 'neutral')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            currentLevel === 'neutral'
                              ? 'bg-slate-700 border border-slate-500 text-slate-100 shadow-md'
                              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Meh className="w-3.5 h-3.5 text-slate-300" />
                          <span>Me da igual</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCategoryLevel(cat.id, 'dislike')}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            currentLevel === 'dislike'
                              ? 'bg-rose-950 border border-rose-500 text-rose-300 shadow-md shadow-rose-950/40'
                              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <HeartCrack className="w-3.5 h-3.5 text-rose-400" />
                          <span>Disgusta</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: TUS JUEGOS & AGREGAR NUEVO */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-indigo-400" />
                    <span>¿Qué Juegos Jugás? Calificación 1–5★</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Marcá qué juegos tenés instalados y calificalos para el cruce algorítmico de la ruleta.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddGameForm(!showAddGameForm)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>{showAddGameForm ? 'Ocultar Formulario' : '➕ Agregar Juego Nuevo'}</span>
                </button>
              </div>

              {/* Inline Add Game Form */}
              {showAddGameForm && (
                <form
                  onSubmit={handleAddNewGame}
                  className="p-4 rounded-xl bg-[#090f1d] border border-indigo-500/30 space-y-3.5 animate-in slide-in-from-top-2"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-900/40">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Agregar un Juego al Catálogo del Grupo
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddGameForm(false)}
                      className="text-slate-500 hover:text-slate-300 text-xs"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">
                        Nombre del Juego *
                      </span>
                      <input
                        type="text"
                        value={newGameName}
                        onChange={(e) => setNewGameName(e.target.value)}
                        placeholder="Ej: Left 4 Dead 2, Helldivers 2..."
                        className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                        required
                      />
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">
                        Categoría *
                      </span>
                      <select
                        value={newGameCategory}
                        onChange={(e) => setNewGameCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                      >
                        {GAME_CATEGORIES.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.emoji} {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">
                        Límites de Jugadores (Mín - Máx) *
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={32}
                          value={newGameMinPlayers}
                          onChange={(e) => setNewGameMinPlayers(parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                          title="Mínimo"
                        />
                        <span className="text-slate-400 text-xs">a</span>
                        <input
                          type="number"
                          min={newGameMinPlayers}
                          max={64}
                          value={newGameMaxPlayers}
                          onChange={(e) => setNewGameMaxPlayers(parseInt(e.target.value) || 4)}
                          className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                          title="Máximo"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">
                        URL de Portada (Opcional)
                      </span>
                      <input
                        type="url"
                        value={newGameCoverUrl}
                        onChange={(e) => setNewGameCoverUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 block mb-1">
                      Descripción breve
                    </span>
                    <input
                      type="text"
                      value={newGameDesc}
                      onChange={(e) => setNewGameDesc(e.target.value)}
                      placeholder="Co-op caótico de 4 jugadores contra hordas..."
                      className="w-full px-3 py-2 rounded-lg bg-[#131c31] border border-indigo-500/20 text-white text-xs focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar y Agregar a mis Juegos</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Filter / Search Bar */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={gameFilterQuery}
                  onChange={(e) => setGameFilterQuery(e.target.value)}
                  placeholder="Buscar juego por nombre o categoría..."
                  className="w-full sm:flex-1 px-3 py-2 rounded-xl bg-[#0b1120] border border-indigo-500/20 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                />

                <select
                  value={gameCategoryFilter}
                  onChange={(e) => setGameCategoryFilter(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-[#0b1120] border border-indigo-500/20 text-slate-200 text-xs focus:outline-none focus:border-indigo-400"
                >
                  <option value="all">Todas las categorías</option>
                  {GAME_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Games Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredGames.map((game) => {
                  const pref = preferences.find(
                    (p) => p.userId === currentUser.id && p.gameId === game.id
                  );
                  const plays = pref ? pref.plays : false;
                  const currentRating = (pref ? pref.rating : 3) as GameRating;
                  const ratingInfo = RATING_LABELS[currentRating];

                  return (
                    <div
                      key={game.id}
                      className={`rounded-xl border transition-all overflow-hidden flex flex-col justify-between ${
                        plays
                          ? 'bg-[#0b1120] border-indigo-500/40 shadow-sm shadow-indigo-950/30'
                          : 'bg-[#070b14]/70 border-slate-800/80 opacity-70'
                      }`}
                    >
                      {/* Cover & Basic Info */}
                      <div className="relative h-24 w-full bg-slate-900 overflow-hidden">
                        <img
                          src={game.coverUrl}
                          alt={game.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1120] via-transparent to-black/40" />

                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-white border border-white/10">
                            {game.category}
                          </span>
                        </div>

                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 backdrop-blur-md text-slate-300 border border-white/10">
                          <Users className="w-3 h-3 text-indigo-400" />
                          <span>
                            {game.minPlayers}-{game.maxPlayers}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-white truncate">{game.name}</h4>
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {game.description || 'Juego cooperativo del grupo'}
                          </p>
                        </div>

                        {/* Toggle & Star Rating */}
                        <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-300">
                              {plays ? '✅ Lo juego' : '❌ No lo juego'}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                updateGamePreference(game.id, !plays, currentRating)
                              }
                              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                plays
                                  ? 'bg-emerald-950 border border-emerald-500/50 text-emerald-300'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {plays ? 'Habilitado' : 'Deshabilitado'}
                            </button>
                          </div>

                          {plays && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  {([1, 2, 3, 4, 5] as GameRating[]).map((starVal) => (
                                    <button
                                      key={starVal}
                                      type="button"
                                      onClick={() =>
                                        updateGamePreference(game.id, true, starVal)
                                      }
                                      className="p-0.5 hover:scale-125 transition-transform"
                                      title={RATING_LABELS[starVal].label}
                                    >
                                      <Star
                                        className={`w-4 h-4 ${
                                          starVal <= currentRating
                                            ? 'text-amber-400 fill-amber-400'
                                            : 'text-slate-600'
                                        }`}
                                      />
                                    </button>
                                  ))}
                                </div>
                                <span className="text-[11px] font-bold text-amber-300">
                                  {currentRating}★ {ratingInfo.emoji}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {ratingInfo.label}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-6 border-t border-indigo-900/40 bg-[#0d1424] flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowOnboardingModal(false)}
                className="text-xs text-slate-500 hover:text-slate-300 underline"
              >
                Omitir y configurar después
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalFinish}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 active:scale-95 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>🚀 Guardar Todo y Entrar al Lobby</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
