import { AlertCircle, Loader2, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DictadoPendiente } from "@/lib/offline-queue";

export function ColaOfflineIndicator({
  isOnline,
  pendientes,
  sincronizando,
  onSincronizar,
  onDescartar,
}: {
  isOnline: boolean;
  pendientes: DictadoPendiente[];
  sincronizando: boolean;
  onSincronizar: () => void;
  onDescartar: (id: number) => void;
}) {
  if (isOnline && pendientes.length === 0) return null;

  const esperandoConexion = pendientes.filter((p) => p.intentos === 0);
  const conError = pendientes.filter((p) => p.intentos > 0);

  return (
    <div className="space-y-2">
      {(esperandoConexion.length > 0 || !isOnline) && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                {isOnline ? (
                  <RefreshCw className={sincronizando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                ) : (
                  <WifiOff className="h-4 w-4" />
                )}
                {isOnline
                  ? `Sincronizando ${esperandoConexion.length} dictado(s) pendiente(s)...`
                  : `Sin conexión — ${esperandoConexion.length} dictado(s) guardado(s) en este dispositivo`}
              </div>
              {isOnline && esperandoConexion.length > 0 && (
                <Button size="sm" variant="outline" onClick={onSincronizar} disabled={sincronizando}>
                  {sincronizando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Reintentar ahora
                </Button>
              )}
            </div>

            {esperandoConexion.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {esperandoConexion.map((p) => (
                  <li key={p.id} className="truncate">
                    &quot;{p.texto}&quot;
                  </li>
                ))}
              </ul>
            )}

            {!isOnline && (
              <p className="text-xs text-muted-foreground">
                Se enviarán automáticamente en cuanto vuelva la señal.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {conError.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4" />
                {conError.length} dictado(s) rechazado(s) por el servidor — necesitan revisión
              </div>
              <Button size="sm" variant="destructive" onClick={onSincronizar} disabled={sincronizando}>
                {sincronizando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Reintentar
              </Button>
            </div>
            <ul className="space-y-2 text-xs">
              {conError.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 text-destructive">
                  <div className="min-w-0">
                    <p className="truncate">&quot;{p.texto}&quot;</p>
                    <p className="truncate text-muted-foreground">{p.ultimoError}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (p.id !== undefined && window.confirm(`¿Descartar "${p.texto}"? Esta acción no se puede deshacer.`)) {
                        onDescartar(p.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
