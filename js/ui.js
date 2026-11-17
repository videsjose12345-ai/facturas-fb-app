// Componentes de interfaz: toasts, modales, confirmaciones y combobox.
import { esc, normalizeSearchText } from './util.js';

export function toast(msg, tipo = 'ok', ms = 2200) {
  let cont = document.querySelector('.toasts');
  if (!cont) { cont = document.createElement('div'); cont.className = 'toasts'; cont.setAttribute('aria-live', 'polite'); document.body.append(cont); }
  const t = document.createElement('div');
  t.className = `toast${tipo === 'err' ? ' err' : ''}`;
  t.innerHTML = `<span>${tipo === 'err' ? '⚠️' : '✅'}</span><span>${esc(msg)}</span>`;
  cont.append(t);
  setTimeout(() => t.remove(), ms);
}

/**
 * Abre un modal. `html` es el contenido; devuelve { el, cerrar }.
 * Cierra con Escape o clic fuera, salvo que `bloqueado()` diga lo contrario.
 */
export function modal(html, { chico = false, alCerrar, bloqueado } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal${chico ? ' chico' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const el = fondo.firstElementChild;
  const previo = document.activeElement;
  const cerrar = () => {
    if (!fondo.isConnected) return;
    fondo.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    alCerrar?.();
    previo?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !bloqueado?.()) cerrar(); };
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo && !bloqueado?.()) cerrar(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]') && !bloqueado?.()) cerrar(); });
  document.addEventListener('keydown', onKey);
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  (el.querySelector('[autofocus]') || el.querySelector('input,button,select'))?.focus();
  return { el, cerrar };
}

export function alertaError(mensaje, titulo = 'No se pudo guardar') {
  return new Promise((ok) => {
    const m = modal(`
      <div style="text-align:center">
        <div style="font-size:40px">⚠️</div>
        <h2 style="margin:6px 0 8px;font-size:18px">${esc(titulo)}</h2>
        <p style="margin:0;color:var(--texto2)">${esc(mensaje)}</p>
        <div style="margin-top:20px"><button class="btn min" data-cerrar autofocus>Entendido</button></div>
      </div>`, { chico: true, alCerrar: ok });
    return m;
  });
}

export function confirmar(titulo = '¿Desea guardar los cambios?', boton = 'Confirmar') {
  return new Promise((ok) => {
    let r = false;
    const m = modal(`
      <div style="text-align:center">
        <div style="font-size:40px">❓</div>
        <h2 style="margin:6px 0 18px;font-size:18px">${esc(titulo)}</h2>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn ghost" data-cerrar>Cancelar</button>
          <button class="btn" data-si autofocus>${esc(boton)}</button>
        </div>
      </div>`, { chico: true, alCerrar: () => ok(r) });
    m.el.querySelector('[data-si]').onclick = () => { r = true; m.cerrar(); };
  });
}

/** Campo con etiqueta, ayuda y error. */
export function campo({ id, label, req = false, ayuda = '', control, clase = '' }) {
  return `<div class="campo ${clase}" data-campo="${id}">
    <label for="${id}">${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>
    ${control}
    <span class="err" data-err="${id}" hidden></span>
    ${ayuda ? `<span class="ayuda">${esc(ayuda)}</span>` : ''}
  </div>`;
}

/** Muestra/limpia errores de validación en un formulario. errores: {id: msg}. */
export function mostrarErrores(raiz, errores) {
  raiz.querySelectorAll('[data-err]').forEach((s) => { s.hidden = true; s.textContent = ''; });
  raiz.querySelectorAll('.inp.mal').forEach((i) => i.classList.remove('mal'));
  let primero = null;
  for (const [id, msg] of Object.entries(errores)) {
    const s = raiz.querySelector(`[data-err="${id}"]`);
    if (s) { s.textContent = msg; s.hidden = false; }
    const i = raiz.querySelector(`#${CSS.escape(id)}`);
    if (i) { i.classList.add('mal'); primero ??= i; }
  }
  primero?.focus();
  return Object.keys(errores).length === 0;
}

/**
 * Buscador de proveedores (combobox): filtra desde 2 letras por código,
 * razón social y nombre comercial; ↑ ↓ Enter Escape.
 * Devuelve { get(), set(p), focus(), setLista(lista), setDisabled(b) }.
 */
export function comboProveedor(input, { lista = () => [], alElegir, alEnfocar } = {}) {
  const cont = input.parentElement;
  cont.classList.add('combo');
  const caja = document.createElement('div');
  caja.className = 'lista'; caja.hidden = true; caja.setAttribute('role', 'listbox');
  const quitar = document.createElement('button');
  quitar.type = 'button'; quitar.className = 'quitar'; quitar.textContent = '×'; quitar.hidden = true;
  quitar.setAttribute('aria-label', 'Quitar proveedor seleccionado');
  cont.append(quitar, caja);
  input.setAttribute('role', 'combobox'); input.setAttribute('autocomplete', 'off');

  let valor = null, res = [], act = 0;

  const pintar = () => {
    const q = normalizeSearchText(valor ? '' : input.value);
    if (valor || q.length < 2) { caja.hidden = true; return; }
    res = lista().filter((p) => normalizeSearchText(`${p.codProv} ${p.razonSocial} ${p.nombreComercial}`).includes(q)).slice(0, 8);
    act = Math.min(act, Math.max(res.length - 1, 0));
    caja.innerHTML = res.length
      ? res.map((p, i) => `<div class="op${i === act ? ' act' : ''}" data-i="${i}" role="option"><b>${esc(p.nombreComercial)}</b><small>${esc(p.codProv)} · ${esc(p.razonSocial)} · ${p.creditoDias} días de crédito</small></div>`).join('')
      : '<div class="nada">Sin coincidencias en el catálogo PROVEEDORES.</div>';
    caja.hidden = false;
  };
  const set = (p) => {
    valor = p;
    input.value = p ? `${p.nombreComercial} — ${p.codProv}` : '';
    quitar.hidden = !p;
    caja.hidden = true;
  };
  const elegir = (p) => { set(p); alElegir?.(p); };

  input.addEventListener('input', () => {
    if (valor) { const t = input.value; valor = null; quitar.hidden = true; alElegir?.(null); input.value = t; }
    act = 0; pintar();
  });
  input.addEventListener('focus', () => alEnfocar?.());
  input.addEventListener('blur', () => setTimeout(() => { caja.hidden = true; }, 150));
  input.addEventListener('keydown', (e) => {
    if (caja.hidden || !res.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(act + 1, res.length - 1); pintar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(act - 1, 0); pintar(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); elegir(res[act]); }
    else if (e.key === 'Escape') { caja.hidden = true; }
  });
  caja.addEventListener('mousedown', (e) => {
    const op = e.target.closest('.op'); if (!op) return;
    e.preventDefault(); elegir(res[Number(op.dataset.i)]);
  });
  quitar.addEventListener('click', () => { elegir(null); input.focus(); });

  return {
    get: () => valor,
    set,
    focus: () => input.focus(),
    setDisabled: (b) => { input.disabled = b; },
  };
}
