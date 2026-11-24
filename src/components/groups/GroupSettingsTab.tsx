import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GamingGroup } from '@/types/domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import { IdentityValues, identitySchema } from './groupViewHelpers';

export interface GroupSettingsTabProps {
  activeGroup: GamingGroup;
  isCreatorOrAdmin: boolean;
  groupSessionsCount: number;
  updateGroup: (
    groupId: string,
    patch: Partial<Omit<GamingGroup, 'id' | 'createdAt'>>
  ) => void;
  deleteGroup: (groupId: string) => void;
}

export const GroupSettingsTab: React.FC<GroupSettingsTabProps> = ({
  activeGroup,
  isCreatorOrAdmin,
  groupSessionsCount,
  updateGroup,
  deleteGroup,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);

  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      name: activeGroup.name,
      description: activeGroup.description || '',
      avatarUrl: activeGroup.avatarUrl || '',
    },
  });

  useEffect(() => {
    setConfirmDelete(false);
    setIdentitySaved(false);
  }, [activeGroup.id]);

  useEffect(() => {
    identityForm.reset({
      name: activeGroup.name,
      description: activeGroup.description || '',
      avatarUrl: activeGroup.avatarUrl || '',
    });
  }, [
    activeGroup.id,
    activeGroup.name,
    activeGroup.description,
    activeGroup.avatarUrl,
    identityForm,
  ]);

  const handleSaveIdentity = identityForm.handleSubmit((values) => {
    updateGroup(activeGroup.id, {
      name: values.name,
      description: values.description,
      avatarUrl: values.avatarUrl || undefined,
    });
    setIdentitySaved(true);
    window.setTimeout(() => setIdentitySaved(false), 3000);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Identidad</CardTitle>
          {!isCreatorOrAdmin && (
            <Badge variant="outline" className="text-[10px]">
              Solo lectura
            </Badge>
          )}
        </CardHeader>
        <CardContent className="p-4">
          <Form {...identityForm}>
            <form onSubmit={handleSaveIdentity} className="space-y-3">
              <FormField
                control={identityForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Grupo</FormLabel>
                    <FormControl>
                      <Input disabled={!isCreatorOrAdmin} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={identityForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input disabled={!isCreatorOrAdmin} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={identityForm.control}
                name="avatarUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar URL (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={!isCreatorOrAdmin}
                        placeholder="https://..."
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {identitySaved && (
                <p className="text-xs text-success">✓ Cambios guardados correctamente.</p>
              )}

              {isCreatorOrAdmin && (
                <div className="flex justify-end">
                  <Button type="submit">Guardar</Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {isCreatorOrAdmin && (
        <Card className="border-destructive/40 bg-destructive/15">
          <CardHeader className="pb-3 border-b border-destructive/25">
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" strokeWidth={1.75} />
              <span>Danger Zone</span>
            </CardTitle>
            <CardDescription>
              Eliminar este grupo borra permanentemente sus sesiones e historial.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              <strong className="text-foreground">{activeGroup.name}</strong> tiene{' '}
              {activeGroup.memberIds.length} miembro(s) y {groupSessionsCount} sesión(es).
            </div>

            {!confirmDelete ? (
              <Button
                size="xs"
                variant="destructive"
                className="w-7 px-0"
                onClick={() => setConfirmDelete(true)}
                title="Eliminar grupo"
                aria-label="Eliminar grupo"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => {
                    deleteGroup(activeGroup.id);
                    setConfirmDelete(false);
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Confirmar</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
