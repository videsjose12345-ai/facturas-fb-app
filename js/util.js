// Utilidades compartidas (mismas reglas de lib/format.ts de la app original)

export const ESTATUS = {
  PROGRAMADA: '1 - PROGRAMADA',
  PROCESO_PAGO: '2 - PROCESO DE PAGO',
  PENDIENTE: '3 - PENDIENTE',
  ABONO: '4 - ABONO',
  PAGADA: '5 - PAGADA',
  INACTIVA: '6 - INACTIVA',
  DISPONIBLE: '7 - DISPONIBLE',
  APLICADA: '8 - APLICADA',
};

export const COL = {
  COD_PROV: 0, RAZON_SOCIAL: 1, NOMBRE_COMERCIAL: 2, CREDITO: 3, FECHA_EMISION: 4,
  CCF: 6, MONTO: 7, ABONO: 8, NOTA_CREDITO: 9, DESCUENTO_PCT: 10, TOTAL: 12,
  SALDO: 13, FECHA_PROGRAMACION: 14, ESTADO: 16, COMENTARIOS: 17, CHEQUE: 18,
  FECHA_ENTREGA: 19, VENCIMIENTO: 21, BANCO: 26,
};

export const SHEET_COLUMNS = [
  'COD_PROV', 'RAZON SOCIAL', 'NOMBRE COMERCIAL', 'CREDITO', 'FECHA DE EMISIÓN', 'SEMANA EMISION',
  'CCF', 'MONTO', 'ABONO', 'NOTA DE CRÉDITO ($)', 'DESCUENTO (%)', 'DESCUENTO ($)', 'TOTAL', 'SALDO',
  'FECHA PROGRAMACION', 'SEMANA DE PROGRAMACION', 'ESTATUS', 'COMENTARIOS', 'N° CHEQUE',
  'FECHA DE ENTREGA DE CHEQUE', 'SEMANA ENTREGA', 'VENCIMIENTO', 'SEMANA VENCE', 'FALTA DIAS',
  'AÑO VENCE', 'AÑO EMISION', 'BANCO',
];

export const DIAS_CREDITO_SUGERIDOS = [15, 30, 45, 60, 90];
export const METODOS_PAGO = ['CHEQUE', 'TRANSFERENCIA', 'EFECTIVO'];
export const ETIQUETA_METODO = { CHEQUE: 'Cheque', TRANSFERENCIA: 'Transferencia', EFECTIVO: 'Efectivo' };
export const RX_MARCADOR_NC = /\[NC de ([^\]]+)\]/i;

/** Escapa texto para insertarlo en HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function roundMoney(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
export function roundPercent(v) { return Math.round((v + Number.EPSILON) * 10000) / 10000; }

/** "$1,250.50" → 1250.5 · "-$67.00" o "($67.00)" → -67 · "" → NaN */
export function parseSheetNumber(v) {
  const t = String(v ?? '');
  if (t.replace(/[^0-9]/g, '') === '') return NaN;
  let n = Number(t.replace(/[^0-9.-]/g, ''));
  if (/\(.*\)/.test(t) && n > 0) n = -n;
  return Number.isFinite(n) ? n : NaN;
}

export const dinero = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function formatDateForSheet(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function isoDateToSheetDate(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
export function normalizeSheetDate(v) {
  const p = String(v ?? '').trim().split('/');
  if (p.length !== 3) return String(v ?? '').trim();
  return p.map((x) => String(Number(x))).join('/');
}
export function sheetDateOrdinal(v) {
  const p = String(v ?? '').trim().split('/');
  if (p.length !== 3) return 0;
  const [dd, mm, yyyy] = p.map(Number);
  if (!dd || !mm || !yyyy) return 0;
  return yyyy * 10000 + mm * 100 + dd;
}
export function sheetDateToIso(v) {
  const p = String(v ?? '').trim().split('/');
  if (p.length !== 3) return '';
  const [dd, mm, yyyy] = p.map(Number);
  if (!dd || !mm || !yyyy) return '';
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
export function sheetDateToTime(v) {
  const p = String(v ?? '').trim().split('/');
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p.map(Number);
  if (!dd || !mm || !yyyy) return null;
  return Date.UTC(yyyy, mm - 1, dd);
}
export function isoDateOrdinal(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Number(iso.replace(/-/g, '')) : 0; }
export function normalizeSearchText(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function esNotaCredito(f) {
  const e = f.valores[COL.ESTADO].trim();
  return e === ESTATUS.DISPONIBLE || e === ESTATUS.APLICADA || RX_MARCADOR_NC.test(f.valores[COL.COMENTARIOS]);
}
export function ccfRelacionadoDe(c) { return String(c ?? '').match(RX_MARCADOR_NC)?.[1]?.trim() ?? null; }
export function normalizarNumeroNota(e) {
  const l = String(e ?? '').trim().replace(/^(?:NC[-\s]?)+/i, '').trim();
  return l ? `NC-${l}` : '';
}

/** Clase de color del badge de estado (1–8). */
export function claseEstado(estado) {
  const n = String(estado ?? '').trim().charAt(0);
  return /[1-8]/.test(n) && String(estado).includes(' - ') ? `e${n}` : 'e0';
}
export const badgeEstado = (e) => `<span class="badge ${claseEstado(e)}">${esc(String(e ?? '').trim() || '—')}</span>`;

/** Sonido corto de confirmación (Web Audio, sin archivos). */
export function sonidoExito() {
  try {
    const ctx = new AudioContext();
    const nota = (f, ini, dur) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + ini);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + ini + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ini + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + ini); o.stop(ctx.currentTime + ini + dur + 0.02);
    };
    nota(880, 0, 0.12); nota(1318.5, 0.1, 0.16);
    setTimeout(() => ctx.close(), 500);
  } catch { /* sin sonido */ }
}

export function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
export function leerLocal(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
