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

/**
 * Llama al Apps Script. Se envía como text/plain para que el navegador no
 * haga la consulta previa de CORS (Apps Script no la admite).
 */
export async function llamar(accion, datos = {}, clave = claveGuardada()) {
  const url = window.FFB_CONFIG?.API_URL;
  if (!url || /PEGA_AQUI/.test(url)) throw new Error('Falta configurar la URL del Apps Script en js/config.js.');
  let res;
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
  if (!cuerpo) throw new Error('Google Sheets no respondió correctamente. Intenta de nuevo.');
  if (cuerpo.auth === false) throw new ErrorAcceso(cuerpo.error || 'Clave incorrecta.');
  if (!cuerpo.ok) throw new Error(cuerpo.error || 'No se pudo completar la operación.');
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
