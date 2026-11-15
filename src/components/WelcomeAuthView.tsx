import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/context/AppContext';
import { isDiscordOAuthProviderEnabled } from '@/lib/supabaseClient';
import {
  createInitialsAvatarDataUri,
  resizeImageFileToDataUrl,
} from '@/lib/imageUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  AlertCircle,
  ArrowRight,
  Gamepad2,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';

function getInviteGroupInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'BG';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

const registerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Ingresá tu nombre o apodo (mínimo 2 caracteres).'),
});

type RegisterProfileValues = z.infer<typeof registerProfileSchema>;

export const WelcomeAuthView: React.FC = () => {
  const {
    players,
    createAndLoginProfile,
    loginWithDiscord,
    setShowOnboardingModal,
    pendingInviteCode,
    pendingInviteGroup,
  } = useApp();

  const [importedAvatarDataUrl, setImportedAvatarDataUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [inviteAvatarError, setInviteAvatarError] = useState(false);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [isCheckingOAuth, setIsCheckingOAuth] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<RegisterProfileValues>({
    resolver: zodResolver(registerProfileSchema),
    defaultValues: {
      displayName: '',
    },
  });

  const watchedDisplayName = form.watch('displayName') || '';
  const fallbackAvatar = createInitialsAvatarDataUri(
    watchedDisplayName || 'BG'
  );
  const activeAvatar = importedAvatarDataUrl || fallbackAvatar;

  const handleImportPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    setIsProcessingAvatar(true);
    try {
      const resized = await resizeImageFileToDataUrl(file);
      setImportedAvatarDataUrl(resized);
    } catch (err: unknown) {
      setAvatarError(
        err instanceof Error ? err.message : 'No se pudo importar la foto.'
      );
    } finally {
      setIsProcessingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDiscordOAuthClick = async () => {
    setOauthBanner(null);
    setIsCheckingOAuth(true);
    try {
      const oauthEnabled = await isDiscordOAuthProviderEnabled();
      if (!oauthEnabled) {
        setOauthBanner(
          'No se pudo conectar con Discord. Creá tu cuenta debajo.'
        );
        return;
      }
      await loginWithDiscord();
    } catch {
      setOauthBanner(
        'No se pudo conectar con Discord. Creá tu cuenta debajo.'
      );
    } finally {
      setIsCheckingOAuth(false);
    }
  };

  const handleFormSubmit = form.handleSubmit((values) => {
    const cleanName = values.displayName.trim();
    const existing = players.find(
      (p) => p.displayName.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (existing) {
      form.setError('displayName', {
        message: 'Ese apodo ya está en uso en el club.',
      });
      return;
    }

    createAndLoginProfile({
      displayName: cleanName,
      avatarUrl: activeAvatar,
    });
    setShowOnboardingModal(true);
  });

  return (
    <div className="relative min-h-screen text-foreground flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        {/* Top Hero Strip */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <Gamepad2 className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Boludos Gaming
            </h1>
          </div>
        </div>

        {/* Active Pending Group Invitation Banner */}
        {pendingInviteCode && (
          <Card className="border-success/45 bg-success/15">
            <CardContent className="p-3.5 flex items-center justify-between gap-3">
              {pendingInviteGroup ? (
                <div className="flex items-center gap-3">
                  {pendingInviteGroup.avatarUrl && !inviteAvatarError ? (
                    <img
                      src={pendingInviteGroup.avatarUrl}
                      alt={pendingInviteGroup.name}
                      onError={() => setInviteAvatarError(true)}
                      className="w-10 h-10 rounded-md object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-success/20 border border-success/40 flex items-center justify-center font-bold text-success shrink-0">
                      {getInviteGroupInitials(pendingInviteGroup.name)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="success" className="text-[10px]">
                        <Ticket className="w-3 h-3" strokeWidth={1.75} />
                        {pendingInviteCode}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {pendingInviteGroup.memberIds.length} miembros
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-foreground mt-0.5">
                      {pendingInviteGroup.name}
                    </h3>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-success">
                  <Ticket className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>
                    Invitación <strong className="font-mono">{pendingInviteCode}</strong>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Single Centered Auth & Registration Card */}
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Acceso</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* Discord OAuth CTA */}
            <Button
              type="button"
              className="w-full"
              onClick={handleDiscordOAuthClick}
              disabled={isCheckingOAuth}
            >
              <svg
                className="w-5 h-5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
              </svg>
              <span>
                {isCheckingOAuth ? 'Conectando...' : 'Loguearse con Discord'}
              </span>
            </Button>

            {oauthBanner && (
              <div className="p-3 rounded-md bg-warning/10 border border-warning/40 text-xs text-warning flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                <span>{oauthBanner}</span>
              </div>
            )}

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-border" />
              <span className="flex-shrink mx-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Registro manual
              </span>
              <div className="flex-grow border-t border-border" />
            </div>

            <Form {...form}>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="flex items-end gap-4">
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem className="flex-1 min-w-0">
                        <FormLabel>Apodo</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Icon-First Avatar Control */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingAvatar}
                      title="Importar foto"
                      aria-label="Importar foto"
                      className="relative group rounded-full shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <img
                        src={activeAvatar}
                        alt="Avatar"
                        className="w-16 h-16 rounded-full object-cover border border-border group-hover:opacity-80 transition-opacity"
                      />
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImportPhoto}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isProcessingAvatar}
                      onClick={() => fileInputRef.current?.click()}
                      title="Importar foto"
                      aria-label="Importar foto"
                      className="h-11 w-11 p-0"
                    >
                      <Upload className="w-5 h-5" strokeWidth={1.75} />
                    </Button>

                    {importedAvatarDataUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setImportedAvatarDataUrl(null);
                          setAvatarError(null);
                        }}
                        title="Quitar foto"
                        aria-label="Quitar foto"
                        className="h-11 w-11 p-0"
                      >
                        <Trash2 className="w-5 h-5 text-destructive" strokeWidth={1.75} />
                      </Button>
                    )}
                  </div>
                </div>

                {avatarError && (
                  <p className="text-[11px] text-destructive font-medium">
                    {avatarError}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
                  <span>Crear cuenta</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
