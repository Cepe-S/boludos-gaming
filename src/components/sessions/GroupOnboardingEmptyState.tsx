import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Link2, Plus, Settings, UserPlus, Users } from 'lucide-react';

const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Escribí un nombre de al menos 2 caracteres.')
    .max(50, 'Máximo 50 caracteres.'),
  description: z.string().trim().max(140, 'Máximo 140 caracteres.').optional(),
});

const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(3, 'Pegá un código o link de invitación válido.'),
});

export interface GroupOnboardingEmptyStateProps {
  onCreateGroup: (params: { name: string; description?: string }) => void;
  onJoinGroup: (inviteCode: string) => { ok: boolean; error?: string };
  onNavigateToGroups?: () => void;
}

export const GroupOnboardingEmptyState: React.FC<GroupOnboardingEmptyStateProps> = ({
  onCreateGroup,
  onJoinGroup,
  onNavigateToGroups,
}) => {
  const [joinServerError, setJoinServerError] = useState<string | null>(null);

  const createForm = useForm<z.infer<typeof createGroupSchema>>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: '', description: '' },
  });

  const joinForm = useForm<z.infer<typeof joinGroupSchema>>({
    resolver: zodResolver(joinGroupSchema),
    defaultValues: { inviteCode: '' },
  });

  const handleCreateSubmit = (values: z.infer<typeof createGroupSchema>) => {
    onCreateGroup({
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
    });
    createForm.reset();
  };

  const handleJoinSubmit = (values: z.infer<typeof joinGroupSchema>) => {
    const res = onJoinGroup(values.inviteCode.trim());
    if (!res.ok) {
      setJoinServerError(res.error || 'No se pudo unir al grupo.');
      return;
    }
    setJoinServerError(null);
    joinForm.reset();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-0.5">
              <CardTitle className="text-base sm:text-lg">
                Elegí o creá un Grupo
              </CardTitle>
              <CardDescription className="max-w-xl">
                Creá un grupo o unite con un código de invitación para organizar sesiones.
              </CardDescription>
            </div>
          </div>

          {onNavigateToGroups && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onNavigateToGroups}
              title="Gestor de grupos"
              aria-label="Gestor de grupos"
              className="shrink-0"
            >
              <Settings className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </Button>
          )}
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          {/* 1. Create Group Form */}
          <div className="p-4 rounded-md bg-background/45 border border-border space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/40 text-primary flex items-center justify-center">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <h4 className="text-xs font-semibold text-foreground">Crear Grupo</h4>
            </div>

            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-3">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Los Pibes del Viernes" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Coop y shooters nocturnos" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full">
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Crear grupo</span>
                </Button>
              </form>
            </Form>
          </div>

          {/* 2. Join Group Form */}
          <div className="p-4 rounded-md bg-background/45 border border-border flex flex-col justify-between space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-success/15 border border-success/40 text-success flex items-center justify-center">
                <UserPlus className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <h4 className="text-xs font-semibold text-foreground">Unirse con Código</h4>
            </div>

            <Form {...joinForm}>
              <form
                onSubmit={joinForm.handleSubmit(handleJoinSubmit)}
                className="flex-1 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <FormField
                    control={joinForm.control}
                    name="inviteCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código o link</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Link2
                              className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                              strokeWidth={1.75}
                            />
                            <Input
                              className="pl-8 font-mono"
                              placeholder="Ej: BG-CLUB1 o ?invite=BG-CLUB1"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                if (joinServerError) setJoinServerError(null);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {joinServerError && (
                    <p className="text-[11px] text-destructive font-medium">{joinServerError}</p>
                  )}
                </div>

                <Button type="submit" variant="emerald" className="w-full">
                  <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Unirse</span>
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
