// Módulo Gestión de pagos: un pago de UN proveedor para una o varias facturas (+ NC).
import { S, alCambiar, llamar, actualizarFilas, recargar, segundos } from './api.js';
import { alertaError, campo, modal, toast } from './ui.js';
import {
  COL, ESTATUS, ETIQUETA_METODO, METODOS_PAGO, $, badgeEstado, dinero, esNotaCredito, esc, hoyIso,
  isoDateToSheetDate, normalizeSearchText, parseSheetNumber, roundMoney,
} from './util.js';

const PAGABLES = [ESTATUS.PROGRAMADA, ESTATUS.PROCESO_PAGO, ESTATUS.PENDIENTE, ESTATUS.ABONO];

export function montarPagos(raiz) {
  raiz.innerHTML = `
    <h1 class="titulo">Gestión de pagos</h1>
    <p class="sub">Un pago por proveedor: cancela una o varias facturas y aplica sus notas de crédito.</p>
    <section class="card">
      ${campo({ id: 'pg-busqueda', label: 'Buscar proveedor o factura', ayuda: 'Razón social, nombre comercial, código de proveedor o CCF', control: '<input class="inp" id="pg-busqueda" placeholder="Ej.: drogu, P001, 12345…" type="search" autocomplete="off">' })}
      <div class="chips" data-chips></div>
    </section>
    <div data-prov></div>`;

  let provSel = null, mostrarPagadas = false, guardando = false;
  /** fila → { monto (texto), ccf } */
  let sel = {};
  const metodo = { v: 'CHEQUE' };

  const busca = $('#pg-busqueda', raiz);
  busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  busca.addEventListener('input', pintarChips);

  function grupos() {
    const q = normalizeSearchText(busca.value);
    const m = new Map();
    for (const f of S.facturas) {
      const cod = f.valores[COL.COD_PROV].trim(); if (!cod) continue;
      let g = m.get(cod);
      if (!g) { g = { cod, razon: f.valores[COL.RAZON_SOCIAL].trim(), nombre: f.valores[COL.NOMBRE_COMERCIAL].trim(), pagables: 0, coincide: false }; m.set(cod, g); }
      if (PAGABLES.includes(f.valores[COL.ESTADO].trim())) g.pagables++;
      if (q && !g.coincide) g.coincide = normalizeSearchText(`${cod} ${g.razon} ${g.nombre} ${f.valores[COL.CCF]}`).includes(q);
    }
    return [...m.values()].filter((g) => (q ? g.coincide : true)).sort((a, b) => b.pagables - a.pagables).slice(0, 12);
  }

  function pintarChips() {
    const c = $('[data-chips]', raiz);
    if (!S.cargado) { c.innerHTML = S.error ? `<p class="nota" style="color:var(--rojo)">${esc(S.error)}</p>` : '<p class="nota">Cargando…</p>'; return; }
    const gs = grupos();
    c.innerHTML = gs.length ? gs.map((g) => `<button type="button" class="chip" data-cod="${esc(g.cod)}" aria-pressed="${provSel === g.cod}"><b style="font-weight:500">${esc(g.nombre || g.razon)}</b><span class="t"> · ${esc(g.cod)} · ${g.pagables} por pagar</span></button>`).join('')
      : '<p class="nota">No se encontraron resultados.</p>';
  }
  $('[data-chips]', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('[data-cod]'); if (!b) return;
    provSel = b.dataset.cod; sel = {};
    pintarChips(); pintarProveedor();
    $('[data-prov]', raiz).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const facturasProv = () => S.facturas.filter((f) => {
    if (f.valores[COL.COD_PROV].trim() !== provSel) return false;
    const e = f.valores[COL.ESTADO].trim();
    return PAGABLES.includes(e) || e === ESTATUS.DISPONIBLE || (mostrarPagadas && e === ESTATUS.PAGADA);
  });
  const montoInicial = (f) => {
    const s = parseSheetNumber(f.valores[COL.SALDO]);
    if (!Number.isFinite(s)) return '';
    if (esNotaCredito(f)) return String(s);
    return s > 0 ? String(s) : '';
  };
  const seleccionadas = () => facturasProv().filter((f) => sel[f.fila] && sel[f.fila].ccf === f.valores[COL.CCF].trim());
  const totalSel = () => roundMoney(seleccionadas().reduce((s, f) => s + (Number(sel[f.fila].monto) || 0), 0));

  function pintarProveedor() {
    const cont = $('[data-prov]', raiz);
    if (!provSel) { cont.innerHTML = '<p class="card vacio" style="margin-top:16px">Busca y elige un proveedor para ver sus facturas por pagar.</p>'; return; }
    const una = S.facturas.find((f) => f.valores[COL.COD_PROV].trim() === provSel);
    if (!una) { provSel = null; pintarProveedor(); return; }
    // Conservar solo selecciones que siguen siendo el mismo documento
    for (const k of Object.keys(sel)) { const f = S.facturas.find((x) => x.fila === Number(k)); if (!f || f.valores[COL.CCF].trim() !== sel[k].ccf) delete sel[k]; }

    const lista = facturasProv();
    const pagables = lista.filter((f) => f.valores[COL.ESTADO].trim() !== ESTATUS.PAGADA);
    const todas = pagables.length > 0 && pagables.every((f) => sel[f.fila]);
    const datosPrevios = cont.querySelector('[data-datos]') ? leerDatos() : null;

    cont.innerHTML = `
      <section class="card sinpad" style="margin-top:16px">
        <div class="cab-card" style="padding:12px 16px;border-bottom:1px solid var(--linea)">
          <div><h2 style="margin:0;color:var(--texto)">${esc(una.valores[COL.NOMBRE_COMERCIAL] || una.valores[COL.RAZON_SOCIAL])}</h2><p class="nota" style="margin:0">${esc(una.valores[COL.RAZON_SOCIAL])} · ${esc(provSel)}</p></div>
          <label class="check"><input type="checkbox" data-pagadas ${mostrarPagadas ? 'checked' : ''}> Mostrar facturas pagadas</label>
        </div>
        ${lista.length === 0 ? '<p class="vacio">No se encontraron resultados.</p>' : `
        <div class="tabla-w"><table class="t cards">
          <thead><tr><th><input type="checkbox" aria-label="Seleccionar todas" data-todas ${todas ? 'checked' : ''}></th><th>CCF</th><th class="c-emi">Emisión</th><th class="der">Monto</th><th class="der c-abono">Abono</th><th class="der">Saldo</th><th>Estado</th><th>Vencimiento</th><th class="der">Monto a pagar</th></tr></thead>
          <tbody>${lista.map((f) => {
            const x = f.valores, e = x[COL.ESTADO].trim(), m = !!sel[f.fila], nc = esNotaCredito(f), pag = e === ESTATUS.PAGADA;
            return `<tr class="${m ? 'marcada' : ''}">
              <td data-l="Seleccionar"><input type="checkbox" data-sel="${f.fila}" aria-label="Seleccionar ${esc(x[COL.CCF])}" ${m ? 'checked' : ''} ${pag ? 'disabled' : ''}></td>
              <td data-l="CCF" class="nw">${nc ? '<span class="tipo nc" style="margin-right:6px">NC</span>' : ''}${esc(x[COL.CCF])}<span class="sub-c sub-emi">${esc(x[COL.FECHA_EMISION])}</span></td>
              <td data-l="Emisión" class="nw num c-emi">${esc(x[COL.FECHA_EMISION])}</td>
              <td data-l="Monto" class="der nw num">${esc(x[COL.MONTO])}</td>
              <td data-l="Abono" class="der nw num c-abono">${esc(x[COL.ABONO])}</td>
              <td data-l="Saldo" class="der nw num"><b>${esc(x[COL.SALDO])}</b>${String(x[COL.ABONO]).trim() ? `<span class="sub-c sub-abono">Abono ${esc(x[COL.ABONO])}</span>` : ''}</td>
              <td data-l="Estado">${badgeEstado(e)}</td>
              <td data-l="Vencimiento" class="nw num">${esc(x[COL.VENCIMIENTO])}</td>
              <td data-l="Monto a pagar" class="der">${m ? (nc ? `<b class="num" style="color:var(--violeta)">${esc(sel[f.fila].monto)}</b>` : `<input class="inp inp-monto num" type="number" step="0.01" min="0.01" inputmode="decimal" data-monto="${f.fila}" value="${esc(sel[f.fila].monto)}" aria-label="Monto a pagar de ${esc(x[COL.CCF])}">`) : '<span style="color:var(--apagado)">—</span>'}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`}
      </section>
      <section class="card" data-datos>
        <div class="cab-card" style="margin-bottom:12px"><h2 style="margin:0">Datos del pago</h2><span class="badge c-teal" style="font-size:13px;padding:6px 12px" data-resumen></span></div>
        <div class="grid g4">
          ${campo({ id: 'pg-metodo', label: 'Método de pago', req: true, control: `<select class="inp" id="pg-metodo">${METODOS_PAGO.map((m) => `<option value="${m}">${ETIQUETA_METODO[m]}</option>`).join('')}</select>` })}
          ${campo({ id: 'pg-fecha', label: 'Fecha del cheque', req: true, control: `<input class="inp" id="pg-fecha" type="date" value="${hoyIso()}">` })}
          ${campo({ id: 'pg-banco', label: 'Banco', req: true, clase: 'no-efectivo', control: '<input class="inp" id="pg-banco">' })}
          ${campo({ id: 'pg-ref', label: 'Número de cheque', req: true, clase: 'no-efectivo', control: '<input class="inp" id="pg-ref">' })}
          ${campo({ id: 'pg-com', label: 'Comentarios del pago', clase: 'span-all', control: '<input class="inp" id="pg-com" maxlength="400" placeholder="Se agregará a todas las facturas seleccionadas">' })}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:16px"><button type="button" class="btn lg" data-revisar>Revisar y confirmar pago</button><span class="nota">Enter avanza · Ctrl+Enter revisa</span></div>
      </section>`;

    const d = datosPrevios || { metodo: metodo.v, fecha: hoyIso(), banco: '', ref: '', com: '' };
    $('#pg-metodo', cont).value = d.metodo; $('#pg-fecha', cont).value = d.fecha;
    $('#pg-banco', cont).value = d.banco; $('#pg-ref', cont).value = d.ref; $('#pg-com', cont).value = d.com;
    ajustarMetodo(); pintarResumen();
  }

  function leerDatos() {
    const c = $('[data-prov]', raiz);
    return { metodo: $('#pg-metodo', c).value, fecha: $('#pg-fecha', c).value, banco: $('#pg-banco', c).value, ref: $('#pg-ref', c).value, com: $('#pg-com', c).value };
  }
  function ajustarMetodo() {
    const c = $('[data-prov]', raiz), m = $('#pg-metodo', c).value;
    metodo.v = m;
    c.querySelectorAll('.no-efectivo').forEach((x) => { x.hidden = m === 'EFECTIVO'; });
    $('label[for="pg-fecha"]', c).innerHTML = `${m === 'CHEQUE' ? 'Fecha del cheque' : m === 'TRANSFERENCIA' ? 'Fecha de transferencia' : 'Fecha del pago'} <span class="req">*</span>`;
    $('label[for="pg-ref"]', c).innerHTML = `${m === 'CHEQUE' ? 'Número de cheque' : 'Número de referencia'} <span class="req">*</span>`;
  }
  function pintarResumen() {
    const r = $('[data-resumen]', raiz); if (!r) return;
    const n = seleccionadas().length;
    r.textContent = `${n} documento${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'} · ${dinero(totalSel())}`;
    $('[data-revisar]', raiz).disabled = n === 0;
  }

  const prov = $('[data-prov]', raiz);
  prov.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-pagadas]')) { mostrarPagadas = t.checked; pintarProveedor(); return; }
    if (t.matches('#pg-metodo')) { ajustarMetodo(); return; }
    if (t.matches('[data-todas]')) {
      const pag = facturasProv().filter((f) => f.valores[COL.ESTADO].trim() !== ESTATUS.PAGADA);
      sel = {};
      if (t.checked) pag.forEach((f) => { sel[f.fila] = { monto: montoInicial(f), ccf: f.valores[COL.CCF].trim() }; });
      pintarProveedor(); return;
    }
    if (t.matches('[data-sel]')) {
      const f = S.facturas.find((x) => x.fila === Number(t.dataset.sel));
      if (!f) return;
      if (sel[f.fila]) delete sel[f.fila]; else sel[f.fila] = { monto: montoInicial(f), ccf: f.valores[COL.CCF].trim() };
      pintarProveedor();
    }
  });
  prov.addEventListener('input', (e) => {
    if (e.target.matches('[data-monto]')) { const k = e.target.dataset.monto; if (sel[k]) sel[k].monto = e.target.value; pintarResumen(); }
  });
  prov.addEventListener('click', (e) => { if (e.target.closest('[data-revisar]')) revisar(); });
  // Enter avanza: montos → método → fecha → banco → número → comentarios → "Revisar y confirmar pago".
  // En el botón, Enter abre la confirmación y otro Enter (en "Confirmar pago") guarda. Ctrl+Enter revisa desde cualquier campo.
  const CADENA = '[data-monto], #pg-metodo, #pg-fecha, #pg-banco, #pg-ref, #pg-com';
  prov.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (!t.matches?.(CADENA)) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { revisar(); return; }
    const foc = [...prov.querySelectorAll(`${CADENA}, [data-revisar]:not([disabled])`)].filter((x) => x.offsetParent !== null);
    foc[foc.indexOf(t) + 1]?.focus();
  });

  async function revisar() {
    const lista = seleccionadas();
    const d = leerDatos();
    if (!lista.length) return alertaError('Selecciona al menos una factura.');
    if (!lista.some((f) => !esNotaCredito(f))) return alertaError('El pago debe incluir al menos una factura (no solo notas de crédito).');
    for (const f of lista) {
      if (esNotaCredito(f)) continue;
      const m = Number(sel[f.fila].monto), s = parseSheetNumber(f.valores[COL.SALDO]);
      if (!Number.isFinite(m) || m <= 0) return alertaError(`Factura ${f.valores[COL.CCF]}: no se permiten montos negativos ni en cero.`);
      if (Number.isFinite(s) && m > s + 0.005) return alertaError(`Factura ${f.valores[COL.CCF]}: el monto pagado no puede ser mayor al saldo pendiente.`);
    }
    const total = totalSel();
    if (total <= 0) return alertaError('El total a pagar debe ser mayor que cero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return alertaError('Ingresa la fecha del pago.');
    if (d.metodo !== 'EFECTIVO' && !d.banco.trim()) return alertaError('Indica el banco.');
    if (d.metodo !== 'EFECTIVO' && !d.ref.trim()) return alertaError(d.metodo === 'CHEQUE' ? 'Indica el número de cheque.' : 'Indica el número de referencia.');

    const una = lista[0].valores;
    const filas = [
      ['Proveedor', una[COL.RAZON_SOCIAL] || una[COL.NOMBRE_COMERCIAL]],
      ['Cantidad de documentos', String(lista.length)],
      ['Monto total', dinero(total)],
      ['Método de pago', ETIQUETA_METODO[d.metodo]],
      ...(d.metodo === 'EFECTIVO' ? [] : [['Banco', d.banco], [d.metodo === 'CHEQUE' ? 'Número de cheque' : 'Número de referencia', d.ref]]),
      ['Fecha', isoDateToSheetDate(d.fecha)],
      ['Comentarios', d.com || '—'],
    ];
    const m = modal(`
      <h2 style="margin:0 0 16px;font-size:18px">Confirmar pago</h2>
      <dl class="det una">${filas.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
      <div class="modal-pie"><button class="btn ghost" data-cerrar>Cancelar</button><button class="btn min" data-ok autofocus>Confirmar pago</button></div>
      <p class="nota" style="text-align:right;margin:6px 0 0">Ctrl+Enter confirma · Esc cancela</p>`, { chico: true, bloqueado: () => guardando });
    const ok = $('[data-ok]', m.el);
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok.click(); });
    ok.onclick = async () => {
      if (guardando) return;
      guardando = true; ok.disabled = true; ok.textContent = 'Guardando…';
      try {
        const r = await llamar('registrarPago', { datos: {
          metodoPago: d.metodo, fechaPago: d.fecha,
          banco: d.metodo === 'EFECTIVO' ? '' : d.banco, referencia: d.metodo === 'EFECTIVO' ? '' : d.ref, comentarios: d.com,
          facturas: lista.map((f) => ({ fila: f.fila, ccf: f.valores[COL.CCF].trim(), montoAPagar: Number(sel[f.fila].monto), esNotaCredito: esNotaCredito(f) })),
        } });
        if (Array.isArray(r.pagos)) S.pagos = r.pagos;
        sel = {};
        const c = $('[data-prov]', raiz); $('#pg-com', c).value = ''; $('#pg-ref', c).value = '';
        actualizarFilas(r.facturas);
        guardando = false; m.cerrar();
        toast(`Pago registrado — ${r.facturas.length} documento(s) · ${dinero(r.montoTotal)}${segundos(r)}`);
        recargar();
      } catch (err) {
        guardando = false; m.cerrar();
        await alertaError(err.message);
      }
    };
  }

  alCambiar(() => { pintarChips(); if (provSel) pintarProveedorConservando(); });
  function pintarProveedorConservando() {
    // No repintar mientras se escribe un monto (evita perder el cursor)
    const a = document.activeElement;
    if (a && a.closest?.('[data-prov]') && a.matches('input:not([type="checkbox"]), select, [data-revisar]')) return;
    pintarProveedor();
  }
  pintarChips(); pintarProveedor();
}
