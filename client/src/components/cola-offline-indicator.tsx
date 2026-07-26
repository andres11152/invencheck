import { AlertCircle, Loader2, RefreshCw, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DictadoPendiente } from "@/lib/offline-queue";

export function ColaOfflineIndicator({
  isOnline,
  modoBodegaSimulado = false,
  toggleModoBodega,
  pendientes,
  sincronizando,
  onSincronizar,
  onDescartar,
}: {
  isOnline: boolean;
  modoBodegaSimulado?: boolean;
  toggleModoBodega?: () => void;
  pendientes: DictadoPendiente[];
  sincronizando: boolean;
  onSincronizar: () => void;
  onDescartar: (id: number) => void;
}) {
  if (isOnline && pendientes.length === 0 && !modoBodegaSimulado) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Resiliencia Bodega: En línea (IndexedDB Activo)
        </span>
        {toggleModoBodega && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            onClick={toggleModoBodega}
          >
            <WifiOff className="mr-1 h-3 w-3" />
            Simular Pérdida de Señal
          </Button>
        )}
      </div>
    );
  }

  const esperandoConexion = pendientes.filter((p) => p.intentos === 0);
  const conError = pendientes.filter((p) => p.intentos > 0);

  return (
    <div className="space-y-2">
      {(esperandoConexion.length > 0 || !isOnline || modoBodegaSimulado) && (
        <Card className="border-amber-500/40 bg-amber-500/10 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.2)]">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                {isOnline && !modoBodegaSimulado ? (
                  <RefreshCw className={sincronizando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                ) : (
                  <WifiOff className="h-4 w-4 animate-pulse" />
                )}
                {modoBodegaSimulado
                  ? `⚡ Modo Bodega Sótano (Simulado) — ${esperandoConexion.length} dictado(s) en IndexedDB`
                  : isOnline
                  ? `Sincronizando ${esperandoConexion.length} dictado(s) pendiente(s)...`
                  : `Sin conexión — ${esperandoConexion.length} dictado(s) guardado(s) localmente`}
              </div>
              <div className="flex items-center gap-1.5">
                {toggleModoBodega && modoBodegaSimulado && (
                  <Button size="sm" variant="secondary" className="h-7 text-xs bg-amber-500 text-black hover:bg-amber-400 font-medium" onClick={toggleModoBodega}>
                    Restablecer Conexión (Sync)
                  </Button>
                )}
                {isOnline && !modoBodegaSimulado && esperandoConexion.length > 0 && (
                  <Button size="sm" variant="outline" onClick={onSincronizar} disabled={sincronizando}>
                    {sincronizando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Reintentar
                  </Button>
                )}
              </div>
            </div>

            {esperandoConexion.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground border-t border-amber-500/20 pt-2">
                {esperandoConexion.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-amber-200">
                    <span className="truncate">&quot;{p.texto}&quot;</span>
                    <span className="shrink-0 text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded font-mono text-amber-300">
                      IndexedDB # {p.id ?? "local"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!isOnline && (
              <p className="text-xs text-amber-300/80">
                Los dictados se almacenan con tolerancia a fallos en IndexedDB y se sincronizan al restaurar la señal.
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
