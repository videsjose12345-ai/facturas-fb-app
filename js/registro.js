// Módulo Registro: facturas (CCF) y notas de crédito.
import { S, alCambiar, llamar, recargar } from './api.js';
import { htmlFactura, montarFactura } from './factura-form.js';
import { alertaError, campo, mostrarErrores, toast } from './ui.js';
import {
  COL, ESTATUS, SHEET_COLUMNS, $, dinero, esc, esNotaCredito, formatDateForSheet, guardarLocal, hoyIso,
  leerLocal, normalizarNumeroNota, normalizeSearchText, normalizeSheetDate, parseSheetNumber, sonidoExito,
} from './util.js';

const LAST_TIPO_KEY = 'facturas-fb:ultimo-tipo-compra';
const ESTADOS_CCF_NC = [ESTATUS.PROGRAMADA, ESTATUS.PROCESO_PAGO, ESTATUS.PENDIENTE, ESTATUS.ABONO];

export function montarRegistro(raiz) {
  raiz.innerHTML = `
    <h1 class="titulo">Registro de facturas</h1>
    <p class="sub">Compras a crédito y contado, guardadas directamente en la hoja DATOS FB.</p>
    <section class="kpis" data-kpis-dia></section>
    <div class="card doc-card">
      <h2>Tipo de documento <span style="color:var(--teal)">*</span></h2>
      <div class="seg" role="radiogroup" aria-label="Tipo de documento" data-doc>
        <button type="button" role="radio" data-v="CCF" aria-checked="true">CCF</button>
        <button type="button" role="radio" data-v="NC" aria-checked="false">Nota de Crédito</button>
      </div>
    </div>
    <form data-f-ccf class="pila reg-form" novalidate>
      <p class="aviso rojo" data-aviso hidden></p>
      ${htmlFactura('r-')}
      <div class="card pie-form">
        <div>
          <p class="nota" style="margin:0">Total estimado (lo calcula tu hoja)</p>
          <p class="total-prev" style="margin:0" data-total>—</p>
          <p class="nota" style="margin:0" data-estado-prev></p>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <button class="btn min" type="submit" data-guardar>Guardar factura</button>
          <span class="nota" data-atajo>Enter avanza · Ctrl+Enter guarda</span>
        </div>
      </div>
    </form>
    <div data-f-nc class="pila reg-nc" hidden></div>
    <section class="card reg-hoy" data-hoy></section>`;

  const fCcf = $('[data-f-ccf]', raiz);
  const form = montarFactura(fCcf, 'r-', { alEnfocarProveedor: () => { if (Date.now() - ultimoCat > 30000) { ultimoCat = Date.now(); recargar(); } } });
  let ultimoCat = Date.now();
  let guardando = false;

  // En pantallas grandes la sección "Programación y pago" va siempre abierta (todo a la vista)
  const det = fCcf.querySelector('details');
  const amplia = window.matchMedia('(min-width: 700px)');
  const abrir = () => { if (amplia.matches) det.open = true; };
  abrir(); amplia.addEventListener?.('change', abrir);

  // Tipo de compra recordado
  const ultimo = leerLocal(LAST_TIPO_KEY, 'CREDITO');
  form.reset(ultimo === 'CONTADO' ? 'CONTADO' : 'CREDITO');
  fCcf.querySelectorAll('[data-tipo] button').forEach((b) => b.addEventListener('click', () => { guardarLocal(LAST_TIPO_KEY, b.dataset.v); pintarTotal(); }));

  const pintarTotal = () => {
    const t = form.total();
    $('[data-total]', fCcf).textContent = t === null ? '—' : dinero(t);
    $('[data-estado-prev]', fCcf).textContent = form.tipo() === 'CREDITO' ? 'Quedará 3 - PENDIENTE (o 1 - PROGRAMADA con fecha)' : 'Quedará 5 - PAGADA';
  };
  fCcf.addEventListener('input', pintarTotal);
  pintarTotal();

  // Enter avanza al siguiente campo; Ctrl+Enter guarda.
  fCcf.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.tagName === 'BUTTON' || t.tagName === 'SUMMARY') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { fCcf.requestSubmit(); return; }
    const foc = [...fCcf.querySelectorAll('input:not([disabled]), summary, button[type="submit"]:not([disabled])')].filter((x) => x.offsetParent !== null);
    foc[foc.indexOf(t) + 1]?.focus();
  });

  fCcf.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;
    const v = form.leer();
    if (!form.validar(v)) return;
    guardando = true;
    const btn = $('[data-guardar]', fCcf);
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const r = await llamar('registrarFactura', { datos: v });
      sonidoExito();
      toast(`Factura ${v.ccf} registrada correctamente`);
      agregarHoy({ hora: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }), proveedor: v.proveedor?.nombreComercial ?? '', ccf: v.ccf, monto: v.monto, tipo: v.tipoCompra });
      if (r.factura) { S.facturas.push(r.factura); S.facturas.sort((a, b) => a.fila - b.fila); }
      form.reset(v.tipoCompra);
      pintarTotal();
      form.combo.focus();
      recargar();
    } catch (err) {
      await alertaError(err.message);
    } finally {
      guardando = false; btn.disabled = false; btn.textContent = 'Guardar factura';
    }
  });

  // ── Selector CCF / Nota de crédito ──
  const fNc = $('[data-f-nc]', raiz);
  let ncMontado = false;
  raiz.querySelectorAll('[data-doc] button').forEach((b) => b.addEventListener('click', () => {
    raiz.querySelectorAll('[data-doc] button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const esNc = b.dataset.v === 'NC';
    fCcf.hidden = esNc; fNc.hidden = !esNc;
    if (esNc && !ncMontado) { montarNota(fNc); ncMontado = true; }
    (esNc ? $('#nc-busqueda', fNc) : $('#r-proveedor', fCcf))?.focus();
  }));

  // ── Registradas hoy (en este equipo) + respaldo ──
  const claveHoy = () => `facturas-fb:historial:${hoyIso()}`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('facturas-fb:historial:') && k !== claveHoy()) localStorage.removeItem(k);
    }
  } catch { /* sin almacenamiento */ }
  const agregarHoy = (en) => { guardarLocal(claveHoy(), [en, ...leerLocal(claveHoy(), [])].slice(0, 200)); pintarHoy(); };
  function pintarHoy() {
    const ent = leerLocal(claveHoy(), []);
    $('[data-hoy]', raiz).innerHTML = `
      <div class="cab-card" style="margin-bottom:12px">
        <h2 style="margin:0">Registradas hoy en este equipo (${ent.length})</h2>
        <button class="btn sec" type="button" data-respaldo>Exportar respaldo</button>
      </div>
      ${ent.length === 0 ? '<p class="nota" style="margin:0">Aún no has registrado facturas hoy. Aparecerán aquí al guardarlas.</p>' : `
      <div class="tabla-w"><table class="t cards"><thead><tr><th>Hora</th><th>Proveedor</th><th>CCF</th><th class="der">Monto</th><th>Tipo</th></tr></thead><tbody>
      ${ent.map((x) => `<tr><td data-l="Hora" class="num tenue">${esc(x.hora)}</td><td data-l="Proveedor">${esc(x.proveedor)}</td><td data-l="CCF" class="tenue">${esc(x.ccf)}</td><td data-l="Monto" class="der num"><b>${dinero(Number(x.monto) || 0)}</b></td><td data-l="Tipo"><span class="badge ${x.tipo === 'CONTADO' ? 'c-lime' : 'c-teal'}">${x.tipo === 'CONTADO' ? 'Contado' : 'Crédito'}</span></td></tr>`).join('')}
      </tbody></table></div>`}`;
    $('[data-respaldo]', raiz).onclick = exportarRespaldo;
  }
  pintarHoy();

  // ── Resumen del día (de la hoja) ──
  function pintarKpis() {
    const hoy = normalizeSheetDate(formatDateForSheet(new Date()));
    const r = { cantidad: 0, total: 0, credito: 0, contado: 0 };
    for (const f of S.facturas) {
      if (normalizeSheetDate(f.valores[COL.FECHA_EMISION]) !== hoy) continue;
      const m = parseSheetNumber(f.valores[COL.MONTO]);
      if (!Number.isFinite(m)) continue;
      r.cantidad++; r.total += m;
      if (parseSheetNumber(f.valores[COL.CREDITO]) > 0) r.credito += m; else r.contado += m;
    }
    const ok = S.cargado;
    $('[data-kpis-dia]', raiz).innerHTML = [
      ['📄', 'c-teal', 'Facturas hoy', ok ? String(r.cantidad) : '—'],
      ['💰', 'c-lime', 'Compras hoy', ok ? dinero(r.total) : '—'],
      ['🏦', 'c-amber', 'Crédito', ok ? dinero(r.credito) : '—'],
      ['💵', 'c-sky', 'Contado', ok ? dinero(r.contado) : '—'],
    ].map(([i, c, t, v]) => `<div class="kpi"><span class="ic ${c}">${i}</span><div class="tx"><p class="k-t">${t}</p><p class="k-v">${v}</p></div></div>`).join('');
  }

  function avisoCatalogo() {
    const a = $('[data-aviso]', fCcf);
    const sin = S.cargado && S.proveedores.length === 0;
    a.hidden = !sin;
    a.textContent = sin ? 'No se pudo cargar el catálogo de proveedores desde Google Sheets. Verifica la conexión.' : '';
    $('[data-guardar]', fCcf).disabled = sin || guardando;
  }

  alCambiar(() => { pintarKpis(); avisoCatalogo(); });
  pintarKpis();
  setTimeout(() => form.combo.focus(), 50);
}

/** CSV del día (27 columnas, separador ;, UTF-8 con BOM para Excel). */
async function exportarRespaldo() {
  await recargar();
  const hoy = normalizeSheetDate(formatDateForSheet(new Date()));
  const filas = S.facturas.filter((f) => normalizeSheetDate(f.valores[COL.FECHA_EMISION]) === hoy);
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [SHEET_COLUMNS.map(celda).join(';'), ...filas.map((f) => f.valores.map(celda).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `respaldo-datos-fb-${formatDateForSheet(new Date()).replace(/\//g, '-')}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Respaldo descargado (${filas.length} fila${filas.length === 1 ? '' : 's'})`);
}

// ── Nota de crédito ──
function montarNota(raiz) {
  raiz.innerHTML = `
    <section class="card">
      <h2>CCF relacionado</h2>
      <div data-busca>
        ${campo({ id: 'nc-busqueda', label: 'Buscar CCF', req: true, ayuda: 'Por CCF, razón social, nombre comercial o código (solo estados 1–4)', control: '<input class="inp" id="nc-busqueda" placeholder="Escribe 2 o más caracteres…" autocomplete="off">' })}
        <div data-res style="margin-top:8px"></div>
      </div>
      <div data-sel hidden></div>
    </section>
    <form class="card" novalidate data-form-nc>
      <h2>Datos de la nota de crédito</h2>
      <div class="grid g2 form">
        ${campo({ id: 'nc-numero', label: 'Número de nota de crédito', req: true, ayuda: 'Solo el número; el prefijo NC- se agrega automáticamente', control: '<div class="pref"><span aria-hidden="true">NC-</span><input class="inp" id="nc-numero" placeholder="8888"></div>' })}
        ${campo({ id: 'nc-fecha', label: 'Fecha de emisión', req: true, control: `<input class="inp" id="nc-fecha" type="date" value="${hoyIso()}">` })}
        ${campo({ id: 'nc-dias', label: 'Días de crédito', ayuda: 'Entero, no negativo; misma columna que los CCF', control: '<input class="inp" id="nc-dias" type="number" step="1" min="0" inputmode="numeric" value="0">' })}
        ${campo({ id: 'nc-monto', label: 'Monto ($)', req: true, ayuda: 'Sin límite; se guardará con saldo negativo (ej. -$67.00)', control: '<input class="inp" id="nc-monto" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="0.00">' })}
        ${campo({ id: 'nc-comentarios', label: 'Comentarios', clase: 'span2', control: '<input class="inp" id="nc-comentarios" maxlength="400">' })}
      </div>
      <div class="pie-form" style="margin-top:16px">
        <p class="nota" style="margin:0;max-width:420px">Quedará en estado ${ESTATUS.PENDIENTE}, agrupada debajo de su CCF. El CCF no se modifica.</p>
        <button class="btn min" type="submit" data-guardar-nc disabled>Guardar nota</button>
      </div>
    </form>`;

  let sel = null, guardando = false;
  const busca = $('#nc-busqueda', raiz), res = $('[data-res]', raiz), cajaSel = $('[data-sel]', raiz);

  const resultados = () => {
    const q = normalizeSearchText(busca.value);
    if (q.length < 2) return [];
    return S.facturas.filter((f) => !esNotaCredito(f) && ESTADOS_CCF_NC.includes(f.valores[COL.ESTADO].trim())
      && normalizeSearchText(`${f.valores[COL.CCF]} ${f.valores[COL.RAZON_SOCIAL]} ${f.valores[COL.NOMBRE_COMERCIAL]} ${f.valores[COL.COD_PROV]}`).includes(q)).slice(0, 8);
  };
  const pintarRes = () => {
    if (!S.cargado) { res.innerHTML = '<p class="nota">Cargando…</p>'; return; }
    const r = resultados();
    res.innerHTML = busca.value.trim().length >= 2 && r.length === 0
      ? '<p class="nota">No se encontraron resultados.</p>'
      : r.map((f) => `<button type="button" class="res-btn" data-fila="${f.fila}"><b>CCF ${esc(f.valores[COL.CCF])}</b><span class="t"> · ${esc(f.valores[COL.NOMBRE_COMERCIAL] || f.valores[COL.RAZON_SOCIAL])} · saldo ${esc(f.valores[COL.SALDO])} · ${esc(f.valores[COL.ESTADO])}</span></button>`).join('');
  };
  busca.addEventListener('input', pintarRes);
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fila]'); if (!b) return;
    elegir(S.facturas.find((f) => f.fila === Number(b.dataset.fila)) || null);
  });

  function elegir(f) {
    sel = f;
    $('[data-busca]', raiz).hidden = !!f;
    cajaSel.hidden = !f;
    $('[data-guardar-nc]', raiz).disabled = !f || guardando;
    if (!f) { busca.value = ''; pintarRes(); busca.focus(); return; }
    const v = f.valores;
    cajaSel.innerHTML = `<div class="sel-box">
      <div class="cab-card" style="margin-bottom:8px"><b class="disp">CCF ${esc(v[COL.CCF])}</b><button type="button" class="btn ghost chico" data-cambiar>Cambiar</button></div>
      <dl class="dl">${[['Proveedor', v[COL.COD_PROV]], ['Razón social', v[COL.RAZON_SOCIAL]], ['Nombre comercial', v[COL.NOMBRE_COMERCIAL]], ['Fecha de emisión', v[COL.FECHA_EMISION]], ['Monto', v[COL.MONTO]], ['Saldo', v[COL.SALDO]], ['Estado', v[COL.ESTADO]]]
        .map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(String(b).trim() || '—')}</dd></div>`).join('')}</dl></div>`;
    $('[data-cambiar]', cajaSel).onclick = () => elegir(null);
    $('#nc-numero', raiz).focus();
  }

  $('[data-form-nc]', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;
    if (!sel) { await alertaError('Selecciona el CCF relacionado con el buscador.'); return; }
    const datos = {
      numeroNota: $('#nc-numero', raiz).value.trim(),
      fechaEmision: $('#nc-fecha', raiz).value,
      creditoDias: $('#nc-dias', raiz).value.trim() === '' ? 0 : Number($('#nc-dias', raiz).value),
      monto: Number($('#nc-monto', raiz).value),
      comentarios: $('#nc-comentarios', raiz).value.trim(),
      ccfRelacionado: sel.valores[COL.CCF].trim(),
      codProv: sel.valores[COL.COD_PROV].trim(),
    };
    const err = {};
    if (!normalizarNumeroNota(datos.numeroNota)) err['nc-numero'] = 'Ingresa el número de la nota de crédito';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaEmision)) err['nc-fecha'] = 'Ingresa la fecha de emisión';
    if (!Number.isInteger(datos.creditoDias) || datos.creditoDias < 0) err['nc-dias'] = 'Entero, no negativo';
    if (!(datos.monto > 0)) err['nc-monto'] = $('#nc-monto', raiz).value.trim() === '' ? 'Ingresa el monto' : 'El monto debe ser mayor que 0';
    if (!mostrarErrores(raiz, err)) return;

    guardando = true;
    const btn = $('[data-guardar-nc]', raiz); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await llamar('registrarNota', { datos });
      sonidoExito();
      toast(`Nota ${normalizarNumeroNota(datos.numeroNota)} registrada — ${ESTATUS.PENDIENTE}`);
      ['nc-numero', 'nc-monto', 'nc-comentarios'].forEach((id) => { $(`#${id}`, raiz).value = ''; });
      $('#nc-dias', raiz).value = '0';
      guardando = false;
      elegir(null);
      await recargar(); // las filas de abajo se corrieron: se relee toda la hoja
    } catch (err2) {
      await alertaError(err2.message);
    } finally {
      guardando = false; btn.textContent = 'Guardar nota'; btn.disabled = !sel;
    }
  });

  alCambiar(() => { if (!$('[data-busca]', raiz).hidden) pintarRes(); });
  pintarRes();
}
