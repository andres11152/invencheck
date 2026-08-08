/**
 * PrintActa — Acta Formal de Toma Física de Inventario (solo impresión)
 *
 * Este componente es invisible en pantalla (`hidden`) y solo se muestra
 * al imprimir (`print-only`). Renderiza el acta corporativa completa:
 * encabezado con logo InvenCheck, metadatos del inventario, tabla
 * compacta de ítems, resumen de alertas y sección de firmas.
 */

import type { EstadoInventario } from "@invencheck/shared";
import type { InventarioDetalle } from "@/lib/types";
import {
  formatCantidad,
  formatFecha,
  calcularMerma,
  formatNumero,
  TIPO_ALERTA_LABEL,
} from "@/lib/format";
import { InvenCheckLogo } from "@/components/invencheck-logo";

const ESTADO_LABEL: Record<EstadoInventario, string> = {
  BORRADOR: "Borrador",
  EN_AUDITORIA: "En auditoría",
  CONCILIADO: "Conciliado",
  ENVIADO_ERP: "Enviado a ERP",
};

export function PrintActa({
  inventario,
  operarioNombre,
}: {
  inventario: InventarioDetalle;
  operarioNombre?: string;
}) {
  const alertasActivas = inventario.alertas.filter((a) => !a.resuelto);
  const ahora = new Date().toLocaleString("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div hidden className="hidden print-only" style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "11px", color: "#111", lineHeight: "1.4" }}>
      {/* ═══════════════════════ ENCABEZADO CORPORATIVO ═══════════════════════ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #0067B1", paddingBottom: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Logo InvenCheck */}
          <InvenCheckLogo variant="color" size="lg" />
          <div>
            <p style={{ fontSize: "18px", fontWeight: "bold", color: "#0067B1", margin: 0 }}>
              INVENCHECK
            </p>
            <p style={{ fontSize: "9px", color: "#575756", margin: 0, letterSpacing: "0.5px" }}>
              Gestión de Inventario
            </p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "16px", fontWeight: "bold", color: "#0067B1", margin: 0 }}>
            ACTA DE TOMA FÍSICA DE INVENTARIO
          </p>
          <p style={{ fontSize: "9px", color: "#575756", margin: 0 }}>
            Documento generado por InvenCheck · {ahora}
          </p>
        </div>
      </div>

      {/* ═══════════════════════ METADATOS DEL INVENTARIO ═══════════════════════ */}
      <table style={{ width: "100%", marginBottom: "16px", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Bodega:</td>
            <td style={metaCell}>{inventario.almacen.nombre}</td>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Código:</td>
            <td style={metaCell}>{inventario.almacen.codigo}</td>
          </tr>
          <tr>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Unidad:</td>
            <td style={metaCell}>{inventario.almacen.unidad}</td>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Estado:</td>
            <td style={metaCell}>{ESTADO_LABEL[inventario.estado]}</td>
          </tr>
          <tr>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Fecha de corte:</td>
            <td style={metaCell}>{formatFecha(inventario.fechaCorte)}</td>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Operario:</td>
            <td style={metaCell}>{operarioNombre ?? "—"}</td>
          </tr>
          <tr>
            <td style={{ ...metaCell, fontWeight: "bold" }}>Total ítems:</td>
            <td colSpan={3} style={metaCell}>
              {inventario.items.length} (Alertas: {alertasActivas.length})
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══════════════════════ TABLA DE ÍTEMS CONTADOS ═══════════════════════ */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <thead>
          <tr>
            {["#", "SKU", "Artículo", "Categoría", "Contado", "Unidad", "Prom. Hist.", "Diferencia", "Observaciones"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inventario.items.map((item, idx) => {
            const merma = calcularMerma(item.conteoFisico, item.teorico);
            const itemAlertas = alertasActivas.filter(
              (a) => a.itemInventarioId === item.id,
            );

            return (
              <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9f9f9" }}>
                <td style={{ ...tdStyle, textAlign: "center", width: "30px" }}>{idx + 1}</td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "10px" }}>
                  {item.articulo.sku ?? "—"}
                </td>
                <td style={tdStyle}>{item.articulo.nombre}</td>
                <td style={{ ...tdStyle, fontSize: "10px" }}>{item.articulo.categoria}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold" }}>
                  {formatNumero(item.conteoFisico)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center", fontSize: "10px" }}>
                  {formatCantidad(item.conteoFisico, item.unidadUsada).split(" ").pop()}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#666" }}>
                  {formatNumero(item.teorico)}
                </td>
                <td style={{
                  ...tdStyle,
                  textAlign: "right",
                  fontWeight: "bold",
                  color: merma === 0 ? "#666" : merma < 0 ? "#dc2626" : "#16a34a",
                }}>
                  {merma > 0 ? "+" : ""}{formatNumero(merma)}
                </td>
                <td style={{ ...tdStyle, fontSize: "10px" }}>
                  {itemAlertas.map((a) => TIPO_ALERTA_LABEL[a.tipo]).join(", ") || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ═══════════════════════ RESUMEN DE ALERTAS ═══════════════════════ */}
      {alertasActivas.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: "bold", color: "#0067B1", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Alertas sin resolver ({alertasActivas.length})
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["#", "Artículo", "Tipo de alerta", "Mensaje"].map((h) => (
                  <th key={h} style={{ ...thStyle, backgroundColor: "#fef2f2", color: "#991b1b" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alertasActivas.map((alerta, idx) => {
                const item = inventario.items.find(
                  (i) => i.id === alerta.itemInventarioId,
                );
                return (
                  <tr key={alerta.id}>
                    <td style={{ ...tdStyle, textAlign: "center", width: "30px" }}>{idx + 1}</td>
                    <td style={tdStyle}>{item?.articulo.nombre ?? "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: "bold" }}>
                      {TIPO_ALERTA_LABEL[alerta.tipo]}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "10px" }}>{alerta.mensaje}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════ SECCIÓN DE FIRMAS ═══════════════════════ */}
      <div style={{ marginTop: "40px", display: "flex", justifyContent: "space-between", gap: "40px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #333", marginBottom: "6px", height: "40px" }} />
          <p style={{ fontSize: "11px", fontWeight: "bold", margin: "0 0 2px 0" }}>Firma del Operario</p>
          <p style={{ fontSize: "10px", color: "#666", margin: "0 0 2px 0" }}>
            Nombre: {operarioNombre ?? "________________________"}
          </p>
          <p style={{ fontSize: "10px", color: "#666", margin: 0 }}>CC: ________________________</p>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid #333", marginBottom: "6px", height: "40px" }} />
          <p style={{ fontSize: "11px", fontWeight: "bold", margin: "0 0 2px 0" }}>Firma del Auditor</p>
          <p style={{ fontSize: "10px", color: "#666", margin: "0 0 2px 0" }}>
            Nombre: ________________________
          </p>
          <p style={{ fontSize: "10px", color: "#666", margin: 0 }}>CC: ________________________</p>
        </div>
      </div>

      {/* ═══════════════════════ PIE DE PÁGINA ═══════════════════════ */}
      <div style={{ marginTop: "24px", borderTop: "1px solid #ddd", paddingTop: "8px", textAlign: "center" }}>
        <p style={{ fontSize: "8px", color: "#999", margin: 0 }}>
          InvenCheck · Gestión de Inventario ·
          ID Inventario: {inventario.id} · Generado: {ahora}
        </p>
      </div>
    </div>
  );
}

/* ── Estilos inline (necesarios para impresión fiable entre navegadores) ── */

const metaCell: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "11px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

const thStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "10px",
  fontWeight: "bold",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
  borderBottom: "2px solid #0067B1",
  backgroundColor: "#f0f7ff",
  color: "#0067B1",
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: "11px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};
