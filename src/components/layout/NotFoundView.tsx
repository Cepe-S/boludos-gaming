import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { Compass, Gamepad2 } from 'lucide-react';

export const NotFoundView: React.FC = () => {
  const location = useLocation();

  return (
    <Card className="max-w-md mx-auto mt-10">
      <CardContent className="p-8 text-center space-y-4">
        <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary mx-auto">
          <Compass className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-foreground">Ruta no encontrada</h2>
          <p className="text-xs font-mono text-muted-foreground break-all">
            {location.pathname}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to={ROUTES.SESSIONS}>
            <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />
            <span>Ir a Sesiones</span>
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
