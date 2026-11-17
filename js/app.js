// Arranque: acceso con clave, navegación, actualización en vivo e instalación.
import { S, alCambiar, borrarClave, claveGuardada, guardarClave, llamar, recargar, ErrorAcceso } from './api.js';
import { montarRegistro } from './registro.js';
import { montarHistorial } from './historial.js';
import { montarDashboard } from './dashboard.js';
import { montarPagos } from './pagos.js';
import { montarConsulta } from './consulta.js';
import { modal } from './ui.js';
import { $, $$, esc } from './util.js';

const VISTAS = [
  { id: 'registro', e: 'Registro', ic: '📝', corto: 'Registro', montar: montarRegistro, angosto: true },
  { id: 'historial', e: 'Historial', ic: '📚', corto: 'Historial', montar: montarHistorial },
  { id: 'dashboard', e: 'Dashboard', ic: '📊', corto: 'Dashboard', montar: montarDashboard },
  { id: 'pagos', e: 'Gestión de Pagos', ic: '💰', corto: 'Pagos', montar: montarPagos },
  { id: 'consulta', e: 'Consulta de Pagos', ic: '🔎', corto: 'Consulta', montar: montarConsulta },
];
const REFRESCO_MS = Math.max(15, Number(window.FFB_CONFIG?.REFRESCO_SEG) || 30) * 1000;
const app = $('#app');

// ── Instalación (PWA) ──
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; pintarBotonInstalar(); });
window.addEventListener('appinstalled', () => { promptInstalar = null; pintarBotonInstalar(); });
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function pintarBotonInstalar() {
  const b = $('[data-instalar]');
  if (b) b.hidden = instalada() || (!promptInstalar && !esIOS());
}
async function instalar() {
  if (promptInstalar) { promptInstalar.prompt(); await promptInstalar.userChoice.catch(() => null); promptInstalar = null; pintarBotonInstalar(); return; }
  modal(`
    <div class="modal-cab"><div><h2>Instalar en iPhone / iPad</h2><p>Safari no muestra un botón de instalar.</p></div><button class="btn ghost" data-cerrar>✕</button></div>
    <ol style="margin:0;padding-left:20px;line-height:1.9">
      <li>Abre esta página en <b>Safari</b>.</li>
      <li>Toca el botón <b>Compartir</b> (cuadro con flecha hacia arriba).</li>
      <li>Elige <b>Agregar a pantalla de inicio</b> y toca <b>Agregar</b>.</li>
    </ol>
    <div class="modal-pie"><button class="btn" data-cerrar>Entendido</button></div>`, { chico: true });
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ── Acceso ──
function pantallaAcceso(msg = '') {
  app.innerHTML = `
    <div class="acceso"><div class="card">
      <img src="img/logo-icono.svg" alt="Farmacia Bolaños">
      <h1>FACTURAS FB</h1>
      <p>Registro de facturas y pagos · Farmacia Bolaños</p>
      <form data-login novalidate>
        <div class="campo"><label for="clave">Clave de acceso</label><input class="inp" id="clave" type="password" autocomplete="current-password" required autofocus></div>
        <label class="check"><input type="checkbox" id="recordar" checked> Recordar en este equipo</label>
        <p class="aviso rojo" data-msg ${msg ? '' : 'hidden'}>${esc(msg)}</p>
        <button class="btn" type="submit" style="width:100%">Entrar</button>
      </form>
    </div></div>`;
  const f = $('[data-login]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clave = $('#clave').value;
    const btn = $('button[type="submit"]', f), m = $('[data-msg]', f);
    if (!clave) { m.hidden = false; m.textContent = 'Escribe la clave.'; return; }
    btn.disabled = true; btn.textContent = 'Verificando…'; m.hidden = true;
    try {
      await llamar('ping', {}, clave);
      guardarClave(clave, $('#recordar').checked);
      iniciar();
    } catch (err) {
      m.hidden = false; m.textContent = err.message;
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });
  setTimeout(() => $('#clave')?.focus(), 50);
}

// ── Aplicación ──
let iniciada = false;
function iniciar() {
  iniciada = true;
  const fecha = new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  app.innerHTML = `
    <header class="top"><div class="top-in">
      <div class="barra">
        <img src="img/logo-oscuro.svg" alt="Farmacia Bolaños" width="105" height="36">
        <div class="barra-d">
          <span class="fecha">${esc(fecha)}</span>
          <span class="vivo carga" data-vivo title="Se actualiza sola desde Google Sheets"><i></i><span>En vivo</span></span>
          <button class="ico-btn lima" type="button" data-instalar hidden>⬇ Instalar</button>
          <span class="chip-app">FACTURAS FB</span>
          <button class="ico-btn" type="button" data-salir title="Cerrar sesión en este equipo">Salir</button>
        </div>
      </div>
      <nav class="tabs" aria-label="Secciones">${VISTAS.map((v) => `<a class="tab" href="#${v.id}" data-ir="${v.id}"><span aria-hidden="true">${v.ic}</span>${v.e}</a>`).join('')}</nav>
    </div></header>
    ${VISTAS.map((v) => `<main id="v-${v.id}" class="${v.angosto ? 'angosto' : ''}" hidden></main>`).join('')}
    <nav class="nav-movil" aria-label="Secciones">${VISTAS.map((v) => `<a href="#${v.id}" data-ir="${v.id}"><span aria-hidden="true">${v.ic}</span>${v.corto}</a>`).join('')}</nav>
    <div class="sin-red" data-sinred hidden>Sin conexión · se reintentará sola</div>`;

  $('[data-instalar]').onclick = instalar;
  $('[data-salir]').onclick = () => { borrarClave(); location.hash = ''; location.reload(); };
  pintarBotonInstalar();

  const montadas = new Set();
  function mostrar() {
    const id = (location.hash || '#registro').slice(1);
    const v = VISTAS.find((x) => x.id === id) || VISTAS[0];
    VISTAS.forEach((x) => { $(`#v-${x.id}`).hidden = x !== v; });
    $$('[data-ir]').forEach((a) => (a.dataset.ir === v.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (!montadas.has(v.id)) { v.montar($(`#v-${v.id}`)); montadas.add(v.id); }
    document.title = `${v.e} · FACTURAS FB`;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', mostrar);
  mostrar();

  alCambiar(() => {
    const el = $('[data-vivo]'); if (!el) return;
    el.classList.toggle('err', !!S.error);
    el.classList.remove('carga');
    el.title = S.error ? `No se pudo actualizar: ${S.error}` : `Actualizado ${S.leido?.toLocaleTimeString('es-SV') ?? ''} · cada ${REFRESCO_MS / 1000} s`;
    $('[data-sinred]').hidden = !S.error || navigator.onLine;
  });

  const refrescar = () => recargar().catch((e) => { if (e instanceof ErrorAcceso) { borrarClave(); pantallaAcceso(e.message); } });
  refrescar();
  setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-fondo')) refrescar(); }, REFRESCO_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescar(); });
  window.addEventListener('online', refrescar);
  window.addEventListener('offline', () => { $('[data-sinred]').hidden = false; });
}

if (claveGuardada()) iniciar(); else pantallaAcceso();
void iniciada;
