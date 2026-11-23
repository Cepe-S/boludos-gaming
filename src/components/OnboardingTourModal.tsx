import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  WeeklySchedule,
  DAYS_OF_WEEK,
  DayOfWeekKey,
  DayScheduleConfig,
} from '../types/domain';
import { buildUnifiedGameSelectorList } from '@/lib/tasteProfileEngine';
import { WeeklyBarsScheduleEditor } from './WeeklyBarsScheduleEditor';
import { GamesCatalogView } from './GamesCatalogView';
import {
  createInitialsAvatarDataUri,
  resizeImageFileToDataUrl,
} from '@/lib/imageUtils';
import {
  User,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Upload,
  Link2,
  RotateCcw,
  Calendar,
  MessageSquareQuote,
  Pencil,
  SkipForward,
} from 'lucide-react';

type TourStep = 1 | 2 | 3;

const TOUR_STEPS: Array<{
  step: TourStep;
  title: string;
  optional?: boolean;
}> = [
  {
    step: 1,
    title: 'Perfil',
  },
  {
    step: 2,
    title: 'Juegos',
  },
  {
    step: 3,
    title: 'Horarios',
    optional: true,
  },
];

function getSafeInitialSchedule(existing?: WeeklySchedule): WeeklySchedule {
  if (existing && Object.keys(existing).length === 7) {
    return JSON.parse(JSON.stringify(existing)) as WeeklySchedule;
  }

  const fallback: Partial<WeeklySchedule> = {};
  for (const d of DAYS_OF_WEEK) {
    const isWeekend = d.key === 'fri' || d.key === 'sat' || d.key === 'sun';
    const from = isWeekend ? '21:30' : '22:00';
    const until = isWeekend ? '01:00' : '00:00';
    const confidence = isWeekend ? 90 : 75;
    const dayCfg: DayScheduleConfig = {
      enabled: isWeekend || d.key === 'wed',
      availableFrom: from,
      availableUntil: until,
      precisionMinutes: 15,
      confidencePercentage: confidence,
      slots: [
        {
          id: `tour_${d.key}_1`,
          from,
          until,
          confidencePercentage: confidence,
          precisionMinutes: 15,
        },
      ],
    };
    fallback[d.key as DayOfWeekKey] = dayCfg;
  }
  return fallback as WeeklySchedule;
}

export interface OnboardingTourModalProps {
  currentStep?: TourStep;
  onStepChange?: (step: TourStep) => void;
}

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  currentStep: controlledStep,
  onStepChange,
}) => {
  const {
    currentUser,
    games,
    preferences,
    showOnboardingModal,
    setShowOnboardingModal,
    updateUserProfile,
    updateWeeklySchedule,
    completeOnboarding,
  } = useApp();

  const selectedGamesCount = useMemo(() => {
    return buildUnifiedGameSelectorList({
      player: currentUser,
      allPreferences: preferences,
      catalogGames: games,
    }).filter((g) => g.isPlayedOrRatedByUser).length;
  }, [currentUser, preferences, games]);

  const step2MinMet = selectedGamesCount >= 10;

  const [internalStep, setInternalStep] = useState<TourStep>(controlledStep ?? 1);
  const currentStep: TourStep = controlledStep ?? internalStep;
  const setCurrentStep = (step: TourStep) => {
    setInternalStep(step);
    onStepChange?.(step);
  };
  const [step2ProfileRevealed, setStep2ProfileRevealed] = useState<boolean>(false);

  // Step 1: General Account State
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [birthDate, setBirthDate] = useState(currentUser.birthDate ?? '');
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl);
  const [avatarUrlDraft, setAvatarUrlDraft] = useState(currentUser.avatarUrl);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);

  const initialDiscordAvatarRef = useRef<string>(currentUser.avatarUrl);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef<boolean>(false);
  const lastUserIdRef = useRef<string>(currentUser.id);

  // Step 3: Optional Weekly Schedule State
  const [schedule, setSchedule] = useState<WeeklySchedule>(() =>
    getSafeInitialSchedule(currentUser.weeklySchedule)
  );

  // Sync modal state only when opening or when the active user changes
  useEffect(() => {
    const justOpened = showOnboardingModal && !wasOpenRef.current;
    const userSwitchedWhileOpen =
      showOnboardingModal && lastUserIdRef.current !== currentUser.id;

    if (justOpened || userSwitchedWhileOpen) {
      if (controlledStep === undefined) {
        setInternalStep(1);
      }
      setStep2ProfileRevealed(false);
      setDisplayName(currentUser.displayName);
      setBirthDate(currentUser.birthDate ?? '');
      setBio(currentUser.bio ?? '');
      setAvatarUrl(currentUser.avatarUrl);
      setAvatarUrlDraft(currentUser.avatarUrl);
      setShowUrlInput(false);
      setAvatarError(null);
      setProfileError(null);
      initialDiscordAvatarRef.current = currentUser.avatarUrl;
      setSchedule(getSafeInitialSchedule(currentUser.weeklySchedule));
    }

    wasOpenRef.current = showOnboardingModal;
    lastUserIdRef.current = currentUser.id;
  }, [showOnboardingModal, currentUser]);

  // Scroll modal body to top on step change
  useEffect(() => {
    if (bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = 0;
    }
  }, [currentStep]);

  if (!showOnboardingModal) return null;

  const persistProfileChanges = (): boolean => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setProfileError('Ingresá tu apodo o nombre visible para continuar.');
      setCurrentStep(1);
      return false;
    }

    setProfileError(null);
    updateUserProfile(
      {
        displayName: trimmedName,
        discordUsername: currentUser.discordUsername,
        avatarUrl: avatarUrl.trim() || currentUser.avatarUrl,
        birthDate: birthDate.trim() || undefined,
        bio: bio.trim() || undefined,
      },
      currentUser.id
    );
    return true;
  };

  const handleStepSelect = (targetStep: TourStep) => {
    if (currentStep === 1 && targetStep > 1) {
      if (!persistProfileChanges()) return;
    }
    setCurrentStep(targetStep);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!persistProfileChanges()) return;
      setCurrentStep(2);
      return;
    }
    if (currentStep === 2) {
      if (!step2ProfileRevealed) {
        setStep2ProfileRevealed(true);
        bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrev = () => {
    if (currentStep === 2) setCurrentStep(1);
    else if (currentStep === 3) setCurrentStep(2);
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Elegí un archivo de imagen válido (JPG, PNG o WebP).');
      return;
    }

    setIsProcessingAvatar(true);
    setAvatarError(null);
    try {
      const resized = await resizeImageFileToDataUrl(file);
      setAvatarUrl(resized);
      setAvatarUrlDraft(resized);
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : 'No se pudo procesar la imagen.'
      );
    } finally {
      setIsProcessingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyUrl = () => {
    const trimmed = avatarUrlDraft.trim();
    if (!trimmed) {
      setAvatarError('Pegá una URL de imagen válida.');
      return;
    }
    setAvatarError(null);
    setAvatarUrl(trimmed);
    setShowUrlInput(false);
  };

  const handleRestoreInitialAvatar = () => {
    setAvatarError(null);
    setAvatarUrl(initialDiscordAvatarRef.current);
    setAvatarUrlDraft(initialDiscordAvatarRef.current);
  };

  const handleSkipScheduleAndFinish = () => {
    if (!persistProfileChanges()) return;
    completeOnboarding();
  };

  const handleSaveScheduleAndFinish = () => {
    if (!persistProfileChanges()) return;
    updateWeeklySchedule(schedule, currentUser.id);
    completeOnboarding();
  };

  const initials = (displayName || currentUser.displayName || 'BG')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const presetAvatars = [
    {
      label: 'Índigo',
      url: createInitialsAvatarDataUri(initials, '#6366f1', '#4f46e5'),
    },
    {
      label: 'Esmeralda',
      url: createInitialsAvatarDataUri(initials, '#10b981', '#059669'),
    },
    {
      label: 'Ámbar',
      url: createInitialsAvatarDataUri(initials, '#f59e0b', '#ea580c'),
    },
    {
      label: 'Fucsia',
      url: createInitialsAvatarDataUri(initials, '#ec4899', '#9333ea'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-5xl max-h-[94vh] bg-background/78 backdrop-blur-xl border border-white/12 ring-1 ring-inset ring-white/5 rounded-lg shadow-[0_28px_80px_-16px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-lol-modal-in">
        {/* Top Header & 3-Step Stepper */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-card/55 backdrop-blur-md border-b border-border/70 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shadow-none shrink-0">
                <Sparkles className="w-4 h-4 text-white" strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-extrabold text-white tracking-tight truncate">
                Boludos Gaming
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-border/70 shrink-0">
                {currentStep}/3
              </span>
            </div>

            <button
              type="button"
              onClick={() => completeOnboarding()}
              title="Cerrar"
              aria-label="Cerrar"
              className="p-2 rounded-md text-muted-foreground hover:text-white hover:bg-secondary/60 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* 3-Step Interactive Progress Bar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {TOUR_STEPS.map((item) => {
              const isActive = item.step === currentStep;
              const isCompleted = item.step < currentStep;

              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => handleStepSelect(item.step)}
                  className={`group flex items-center gap-2.5 p-2 sm:px-3 sm:py-2 rounded-md border text-left transition-all ${
                    isActive
                      ? 'bg-primary/15 border-primary/70 shadow-none'
                      : isCompleted
                      ? 'bg-success/10 border-success/35 hover:border-success/60'
                      : 'bg-secondary/45 border-border/70 hover:border-border'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 transition-colors ${
                      isActive
                        ? 'bg-primary text-white'
                        : isCompleted
                        ? 'bg-success text-background'
                        : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                    ) : (
                      item.step
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <span
                      className={`text-xs sm:text-sm font-bold truncate ${
                        isActive
                          ? 'text-white'
                          : isCompleted
                          ? 'text-success'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.optional && (
                      <span className="hidden md:inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground border border-border/70">
                        Opcional
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body */}
        <div
          ref={bodyScrollRef}
          style={{ overflowAnchor: 'none' }}
          className={`flex-1 overflow-y-auto scroller-thin space-y-5 ${
            currentStep === 2
              ? 'px-4 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0'
              : 'p-4 sm:p-5'
          }`}
        >
          {/* STEP 1: GENERAL ACCOUNT DATA */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-step-in">
              {profileError && (
                <div className="p-3 rounded-md bg-destructive/15 border border-destructive/40 text-xs text-destructive font-semibold">
                  {profileError}
                </div>
              )}

              {/* Profile Card Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Avatar Picker */}
                <div className="lg:col-span-5 bg-card/50 backdrop-blur-sm border border-border/70 rounded-md p-5 flex flex-col items-center text-center space-y-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingAvatar}
                    title="Subir foto"
                    aria-label="Subir foto"
                    className="relative group rounded-full focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
                  >
                    <img
                      src={avatarUrl}
                      alt={displayName || 'Avatar'}
                      onError={(e) => {
                        e.currentTarget.src = presetAvatars[0].url;
                      }}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-primary/50 shadow-sm bg-secondary/60 group-hover:opacity-85 transition-opacity"
                    />
                  </button>

                  <div>
                    <p className="text-sm font-bold text-white">
                      {displayName.trim() || currentUser.displayName}
                    </p>
                    {currentUser.discordUsername && (
                      <p className="text-xs text-muted-foreground">
                        @{currentUser.discordUsername}
                      </p>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadPhoto}
                    className="hidden"
                  />

                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingAvatar}
                      title="Subir foto"
                      aria-label="Subir foto"
                      className="p-2 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" strokeWidth={1.75} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUrlInput((prev) => !prev)}
                      title="Pegar URL"
                      aria-label="Pegar URL"
                      className="p-2 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground transition-colors"
                    >
                      <Link2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>

                    {avatarUrl !== initialDiscordAvatarRef.current && (
                      <button
                        type="button"
                        onClick={handleRestoreInitialAvatar}
                        title="Restaurar avatar"
                        aria-label="Restaurar avatar"
                        className="p-2 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-success transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>

                  {showUrlInput && (
                    <div className="w-full flex gap-2 pt-1">
                      <input
                        type="url"
                        value={avatarUrlDraft}
                        onChange={(e) => setAvatarUrlDraft(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 px-3 py-1.5 rounded-md bg-background/45 border border-border/70 text-xs text-white focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={handleApplyUrl}
                        title="Aplicar URL"
                        aria-label="Aplicar URL"
                        className="px-2.5 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white"
                      >
                        <Check className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}

                  {avatarError && (
                    <p className="text-[11px] text-destructive font-medium">
                      {avatarError}
                    </p>
                  )}

                  {/* Quick Initials Presets */}
                  <div className="w-full pt-3 border-t border-border/70 flex items-center justify-center gap-2.5">
                    {presetAvatars.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setAvatarUrl(preset.url);
                          setAvatarUrlDraft(preset.url);
                          setAvatarError(null);
                        }}
                        title={`Avatar ${preset.label}`}
                        aria-label={`Avatar ${preset.label}`}
                        className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-105 ${
                          avatarUrl === preset.url
                            ? 'border-success ring-2 ring-success'
                            : 'border-border/70'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Column: Account Form Fields */}
                <div className="lg:col-span-7 bg-card/50 backdrop-blur-sm border border-border/70 rounded-md p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                      Apodo *
                    </label>
                    <div className="relative">
                      <User
                        className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                        strokeWidth={1.75}
                      />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value);
                          if (profileError) setProfileError(null);
                        }}
                        maxLength={32}
                        className="w-full pl-9 pr-3 py-2 rounded-md bg-background/45 border border-border/70 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">
                      Nacimiento
                    </label>
                    <div className="relative">
                      <Calendar
                        className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        strokeWidth={1.75}
                      />
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full pl-9 pr-3 py-2 rounded-md bg-background/45 border border-border/70 text-sm text-white focus:outline-none focus:border-primary [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        <MessageSquareQuote
                          className="w-3.5 h-3.5 text-primary"
                          strokeWidth={1.75}
                        />
                        <span>Bio</span>
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        {bio.length}/160
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={160}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-background/45 border border-border/70 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: UNIFIED GAMES CATALOG, STEAM & GAMER PROFILE REVEAL */}
          {currentStep === 2 && (
            <div>
              <GamesCatalogView
                embeddedInTour
                profileRevealed={step2ProfileRevealed}
                onProfileRevealedChange={(rev) => {
                  if (rev && !step2MinMet) return;
                  setStep2ProfileRevealed(rev);
                  bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}

          {/* STEP 3: OPTIONAL WEEKLY SCHEDULE */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-step-in">
              <div className="flex items-center gap-2">
                <Clock
                  className="w-5 h-5 text-primary"
                  strokeWidth={1.75}
                />
                <h3 className="text-base font-bold text-white">Horarios</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/35">
                  Opcional
                </span>
              </div>

              <WeeklyBarsScheduleEditor
                schedule={schedule}
                onChange={setSchedule}
                compact
              />
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-border/70 bg-card/55 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3.5 py-2 rounded-md bg-secondary/60 hover:bg-accent/70 text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                <span>Anterior</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowOnboardingModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Omitir
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-md bg-primary hover:bg-primary/90 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-none transition-all cursor-pointer"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}

            {currentStep === 2 &&
              (step2ProfileRevealed ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setStep2ProfileRevealed(false);
                      bodyScrollRef.current?.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      });
                    }}
                    className="px-3.5 py-2 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Pencil
                      className="w-3.5 h-3.5 text-primary"
                      strokeWidth={1.75}
                    />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-4 py-2 rounded-md bg-primary hover:bg-primary/90 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-none transition-all cursor-pointer"
                  >
                    <span>Siguiente</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-3.5 py-2 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <SkipForward
                      className="w-4 h-4 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span>Omitir</span>
                  </button>
                  <button
                    type="button"
                    disabled={!step2MinMet}
                    title={!step2MinMet ? 'Mínimo 10 juegos' : 'Revelar perfil'}
                    onClick={() => {
                      if (!step2MinMet) return;
                      setStep2ProfileRevealed(true);
                      bodyScrollRef.current?.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      });
                    }}
                    className={`px-4 py-2 rounded-md text-xs font-extrabold flex items-center gap-1.5 shadow-none transition-all ${
                      step2MinMet
                        ? 'cursor-pointer bg-primary hover:bg-primary/90 active:scale-95 text-white border border-transparent'
                        : 'bg-muted text-slate-400 border border-border opacity-80 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                    <span>Revelar ({selectedGamesCount}/10)</span>
                  </button>
                </div>
              ))}

            {currentStep === 3 && (
              <>
                <button
                  type="button"
                  onClick={handleSkipScheduleAndFinish}
                  className="px-3.5 py-2 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <SkipForward
                    className="w-4 h-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <span>Omitir</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveScheduleAndFinish}
                  className="px-4 py-2 rounded-md bg-primary hover:bg-primary/90 active:scale-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-none transition-all"
                >
                  <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                  <span>Guardar</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
