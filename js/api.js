// Comunicación con el Apps Script de la hoja y estado compartido de la app.

const CLAVE_KEY = 'ffb:clave';

export const S = {
  facturas: [],
  proveedores: [],
  pagos: [],
  leido: null,
  cargado: false,
  error: null,
};

const oyentes = new Set();
/** Se llama cada vez que llegan datos nuevos de la hoja. */
export function alCambiar(fn) { oyentes.add(fn); }
export function avisar() { oyentes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

export function claveGuardada() {
  try { return sessionStorage.getItem(CLAVE_KEY) || localStorage.getItem(CLAVE_KEY) || ''; } catch { return ''; }
}
export function guardarClave(clave, recordar) {
  try {
    sessionStorage.setItem(CLAVE_KEY, clave);
    if (recordar) localStorage.setItem(CLAVE_KEY, clave); else localStorage.removeItem(CLAVE_KEY);
  } catch { /* sin almacenamiento */ }
}
export function borrarClave() {
  try { sessionStorage.removeItem(CLAVE_KEY); localStorage.removeItem(CLAVE_KEY); } catch { /* nada */ }
}

export class ErrorAcceso extends Error {}

/* 3.2.3 · Medición: cada llamada a Google anota cuánto tardó (total en este equipo y, en los guardados, los pasos
   que manda el Apps Script: espera, proveedor, duplicados, escribir, recalculo, leer). Se guardan las últimas 60
   en este navegador (ffb:tiempos) y se ven en la consola como [FFB tiempos]. */
const TIEMPOS_KEY = 'ffb:tiempos';
function anotarTiempo(accion, ms, cuerpo) {
  if (accion === 'ping') return;
  const reg = { fecha: new Date().toISOString(), accion, total: ms, ok: !!(cuerpo && cuerpo.ok), pasos: (cuerpo && cuerpo.tiempos) || null };
  try {
    const a = JSON.parse(localStorage.getItem(TIEMPOS_KEY) || '[]');
    a.push(reg);
    localStorage.setItem(TIEMPOS_KEY, JSON.stringify(a.slice(-60)));
  } catch { /* sin almacenamiento */ }
  console.info('[FFB tiempos]', reg);
}
/** Últimas mediciones guardadas en este navegador. */
export function tiemposGuardados() {
  try { return JSON.parse(localStorage.getItem(TIEMPOS_KEY) || '[]'); } catch { return []; }
}
/** "5.2 s" a partir de la respuesta de un guardado. */
export function segundos(r) { return r && r._ms ? ` · ${(r._ms / 1000).toFixed(1)} s` : ''; }

/**
 * Llama al Apps Script. Se envía como text/plain para que el navegador no
 * haga la consulta previa de CORS (Apps Script no la admite).
 */
export async function llamar(accion, datos = {}, clave = claveGuardada()) {
  const url = window.FFB_CONFIG?.API_URL;
  if (!url || /PEGA_AQUI/.test(url)) throw new Error('Falta configurar la URL del Apps Script en js/config.js.');
  let res;
  const t0 = performance.now();
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, clave, ...datos }),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Sin conexión con Google Sheets. Revisa el internet e intenta de nuevo.');
  }
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch { /* respuesta no JSON */ }
  const ms = Math.round(performance.now() - t0);
  anotarTiempo(accion, ms, cuerpo);
  if (cuerpo && typeof cuerpo === 'object') cuerpo._ms = ms;
  if (!cuerpo) throw new Error('Google Sheets no respondió correctamente. Intenta de nuevo.');
  if (cuerpo.auth === false) throw new ErrorAcceso(cuerpo.error || 'Clave incorrecta.');
  if (!cuerpo.ok) { const e = new Error(cuerpo.error || 'No se pudo completar la operación.'); e.datos = cuerpo; throw e; }
  return cuerpo;
}

let enCurso = null;
/** Lee proveedores, DATOS FB y PAGOS en una sola llamada. */
export function recargar() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const r = await llamar('todo');
      S.facturas = r.facturas || [];
      S.proveedores = r.proveedores || [];
      S.pagos = r.pagos || [];
      S.leido = new Date();
      S.cargado = true;
      S.error = null;
      avisar();
      return true;
    } catch (e) {
      S.error = e.message;
      if (e instanceof ErrorAcceso) throw e;
      avisar();
      return false;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Reemplaza filas ya releídas por el servidor (sin recargar todo). */
export function actualizarFilas(filas) {
  if (!Array.isArray(filas)) return;
  const porFila = new Map(filas.map((f) => [f.fila, f]));
  S.facturas = S.facturas.map((f) => porFila.get(f.fila) ?? f);
  avisar();
}
