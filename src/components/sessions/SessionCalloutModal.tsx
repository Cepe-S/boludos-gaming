import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { GamingSession, PlayerProfile, SessionParticipant } from '@/types/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Megaphone } from 'lucide-react';

const calloutSchema = z.object({
  customMessage: z.string().trim().max(240, 'Máximo 240 caracteres.'),
});

type CalloutFormValues = z.infer<typeof calloutSchema>;

export interface SessionCalloutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSession: GamingSession;
  probableParticipants: SessionParticipant[];
  players: PlayerProfile[];
  onSendCallout: (customMessage?: string) => Promise<void>;
}

export const SessionCalloutModal: React.FC<SessionCalloutModalProps> = ({
  open,
  onOpenChange,
  activeSession,
  probableParticipants,
  players,
  onSendCallout,
}) => {
  const form = useForm<CalloutFormValues>({
    resolver: zodResolver(calloutSchema),
    defaultValues: {
      customMessage: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ customMessage: '' });
    }
  }, [open, form]);

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSendCallout(values.customMessage || undefined);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-warning/15 border border-warning/40 flex items-center justify-center text-warning shrink-0">
              <Megaphone className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <DialogTitle>Reclamar Confirmación</DialogTitle>
              <DialogDescription>{activeSession.title}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 rounded-md bg-background/45 border border-border/70 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground block">
                Probables ({probableParticipants.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {probableParticipants.map((part) => {
                  const p = playerMap.get(part.userId);
                  if (!p) return null;
                  return (
                    <Badge key={part.userId} variant="warning" className="text-[10px]">
                      {p.discordUsername ? `@${p.discordUsername}` : p.displayName} ({part.confidencePercentage ?? 75}%)
                    </Badge>
                  );
                })}
              </div>
            </div>

            <FormField
              control={form.control}
              name="customMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: ¡Dale manga de humos, confirmen si están a las 22:00!"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="amber"
                disabled={form.formState.isSubmitting || probableParticipants.length === 0}
              >
                <Megaphone className="w-4 h-4" strokeWidth={1.75} />
                <span>Enviar reclamo</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
