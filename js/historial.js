// Módulo Historial: tabla de DATOS FB con buscador, filtros, orden, ver y editar.
import { S, alCambiar, llamar, actualizarFilas, segundos } from './api.js';
import { htmlFactura, montarFactura } from './factura-form.js';
import { alertaError, campo, confirmar, modal, toast } from './ui.js';
import {
  COL, ESTATUS, SHEET_COLUMNS, $, badgeEstado, ccfRelacionadoDe, esNotaCredito, esc, isoDateOrdinal,
  normalizarNumeroNota, normalizeSearchText, parseSheetNumber, roundMoney, sheetDateOrdinal, sheetDateToIso,
} from './util.js';

const POR_PAGINA = 50;
const COLUMNAS = [
  { e: 'Proveedor', col: COL.NOMBRE_COMERCIAL, tipo: 'texto' },
  { e: 'Código', col: COL.COD_PROV, tipo: 'texto', cls: 'c-cod' },
  { e: 'CCF', col: COL.CCF, tipo: 'texto' },
  { e: 'Fecha emisión', col: COL.FECHA_EMISION, tipo: 'fecha', cls: 'c-emi' },
  { e: 'Monto', col: COL.MONTO, tipo: 'numero', cls: 'c-monto' },
  { e: 'Total', col: COL.TOTAL, tipo: 'numero', cls: 'c-total' },
  { e: 'Saldo', col: COL.SALDO, tipo: 'numero' },
  { e: 'Crédito', col: COL.CREDITO, tipo: 'numero', cls: 'c-cred' },
  { e: 'Vencimiento', col: COL.VENCIMIENTO, tipo: 'fecha' },
  { e: 'Estado', col: COL.ESTADO, tipo: 'texto' },
];

export function montarHistorial(raiz) {
  const fi = (id, label, attrs = '') => campo({ id, label, control: `<input class="inp" id="${id}" ${attrs}>` });
  raiz.innerHTML = `
    <h1 class="titulo">Historial</h1>
    <p class="sub">Todas las facturas y notas de crédito de DATOS FB.</p>
    <section class="card">
      ${campo({ id: 'h-busqueda', label: 'Buscador', ayuda: 'Escribe parte del nombre del proveedor, código o CCF', control: '<input class="inp" id="h-busqueda" placeholder="Ej.: drogu, P001, DTE-03…" type="search">' })}
      <details style="margin-top:12px" data-filtros>
        <summary class="check" style="font-weight:500">Más filtros</summary>
        <div class="grid g4" style="margin-top:12px">
          ${fi('h-proveedor', 'Proveedor', 'placeholder="Nombre o razón social"')}
          ${fi('h-codigo', 'Código proveedor')}
          ${fi('h-ccf', 'CCF')}
          ${fi('h-emi-desde', 'Emisión desde', 'type="date"')}
          ${fi('h-emi-hasta', 'Emisión hasta', 'type="date"')}
          ${fi('h-ven-desde', 'Vence desde', 'type="date"')}
          ${fi('h-ven-hasta', 'Vence hasta', 'type="date"')}
          ${fi('h-credito', 'Días de crédito', 'type="number" min="0" inputmode="numeric"')}
          ${campo({ id: 'h-estado', label: 'Estado', control: `<select class="inp" id="h-estado"><option value="">Todos</option>${Object.values(ESTATUS).map((e) => `<option>${e}</option>`).join('')}</select>` })}
          ${campo({ id: 'h-tipo', label: 'Compra', control: '<select class="inp" id="h-tipo"><option value="">Todas</option><option value="CREDITO">Crédito</option><option value="CONTADO">Contado</option></select>' })}
        </div>
        <div style="margin-top:12px"><button type="button" class="btn ghost chico" data-limpiar>Limpiar filtros</button></div>
      </details>
    </section>
    <section class="card sinpad" style="margin-top:16px" data-tabla></section>`;

  if (window.matchMedia('(min-width: 761px)').matches) $('[data-filtros]', raiz).open = true;

  let orden = null, pagina = 1;
  const v = (id) => $(`#${id}`, raiz).value;

  function filtrar() {
    const q = normalizeSearchText(v('h-busqueda')), prov = normalizeSearchText(v('h-proveedor'));
    const cod = normalizeSearchText(v('h-codigo')), ccf = normalizeSearchText(v('h-ccf'));
    const ed = isoDateOrdinal(v('h-emi-desde')), eh = isoDateOrdinal(v('h-emi-hasta'));
    const vd = isoDateOrdinal(v('h-ven-desde')), vh = isoDateOrdinal(v('h-ven-hasta'));
    const cred = v('h-credito').trim() === '' ? null : Number(v('h-credito'));
    const est = v('h-estado'), tipo = v('h-tipo');
    let r = S.facturas.filter((f) => {
      const x = f.valores;
      if (q && !normalizeSearchText(`${x[COL.COD_PROV]} ${x[COL.RAZON_SOCIAL]} ${x[COL.NOMBRE_COMERCIAL]} ${x[COL.CCF]}`).includes(q)) return false;
      if (prov && !normalizeSearchText(`${x[COL.RAZON_SOCIAL]} ${x[COL.NOMBRE_COMERCIAL]}`).includes(prov)) return false;
      if (cod && !normalizeSearchText(x[COL.COD_PROV]).includes(cod)) return false;
      if (ccf && !normalizeSearchText(x[COL.CCF]).includes(ccf)) return false;
      const em = sheetDateOrdinal(x[COL.FECHA_EMISION]);
      if (ed && em < ed) return false;
      if (eh && em > eh) return false;
      const ve = sheetDateOrdinal(x[COL.VENCIMIENTO]);
      if (vd && ve < vd) return false;
      if (vh && ve > vh) return false;
      const dias = parseSheetNumber(x[COL.CREDITO]);
      if (cred !== null && dias !== cred) return false;
      if (est && x[COL.ESTADO].trim() !== est) return false;
      if (tipo === 'CONTADO' && dias > 0) return false;
      if (tipo === 'CREDITO' && !(dias > 0)) return false;
      return true;
    });
    if (orden) {
      const { col, tipo: t, dir } = orden;
      r = [...r].sort((a, b) => {
        const va = a.valores[col], vb = b.valores[col];
        if (t === 'numero') return ((parseSheetNumber(va) || 0) - (parseSheetNumber(vb) || 0)) * dir;
        if (t === 'fecha') return (sheetDateOrdinal(va) - sheetDateOrdinal(vb)) * dir;
        return va.localeCompare(vb, 'es', { numeric: true }) * dir;
      });
    }
    return r;
  }

  function pintar() {
    const cont = $('[data-tabla]', raiz);
    if (!S.cargado) { cont.innerHTML = S.error ? `<p class="vacio" style="color:var(--rojo)">${esc(S.error)}</p>` : '<div class="cargando"><span class="spin"></span>Cargando…</div>'; return; }
    const lista = filtrar();
    const total = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    pagina = Math.min(pagina, total);
    const vis = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    if (!vis.length) { cont.innerHTML = '<p class="vacio">No se encontraron resultados.</p>'; return; }
    cont.innerHTML = `<div class="tabla-w"><table class="t cards">
      <thead><tr><th>Tipo</th>${COLUMNAS.map((c, i) => `<th class="${[c.tipo === 'numero' ? 'der' : '', c.cls || ''].join(' ').trim()}"><button class="ord" type="button" data-ord="${i}" title="Ordenar por ${c.e}">${c.e}${orden?.col === c.col ? (orden.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}<th>Acciones</th></tr></thead>
      <tbody>${vis.map((f) => {
        const x = f.valores, nc = esNotaCredito(f), rel = nc ? ccfRelacionadoDe(x[COL.COMENTARIOS]) : null;
        return `<tr>
          <td data-l="Tipo"><span class="tipo ${nc ? 'nc' : 'ccf'}">${nc ? 'NC' : 'CCF'}</span></td>
          <td data-l="Proveedor" class="trunc" title="${esc(x[COL.NOMBRE_COMERCIAL])}">${esc(x[COL.NOMBRE_COMERCIAL] || x[COL.RAZON_SOCIAL])}<span class="sub-c sub-cod">${esc(x[COL.COD_PROV])}</span></td>
          <td data-l="Código" class="nw tenue c-cod">${esc(x[COL.COD_PROV])}</td>
          <td data-l="CCF" class="nw">${esc(x[COL.CCF])}${rel ? `<span class="rel">→ CCF ${esc(rel)}</span>` : ''}<span class="sub-c sub-emi">${esc(x[COL.FECHA_EMISION])}</span></td>
          <td data-l="Fecha emisión" class="nw num c-emi">${esc(x[COL.FECHA_EMISION])}</td>
          <td data-l="Monto" class="der nw num c-monto">${esc(x[COL.MONTO])}</td>
          <td data-l="Total" class="der nw num c-total">${esc(x[COL.TOTAL])}</td>
          <td data-l="Saldo" class="der nw num">${esc(x[COL.SALDO])}<span class="sub-c sub-total">Total ${esc(x[COL.TOTAL])}</span></td>
          <td data-l="Crédito" class="der nw num c-cred">${esc(x[COL.CREDITO])}</td>
          <td data-l="Vencimiento" class="nw num">${esc(x[COL.VENCIMIENTO])}${String(x[COL.CREDITO]).trim() ? `<span class="sub-c sub-cred">${esc(x[COL.CREDITO])} días</span>` : ''}</td>
          <td data-l="Estado">${badgeEstado(x[COL.ESTADO])}</td>
          <td data-l=""><div class="acc"><button type="button" data-ver="${f.fila}" title="Ver toda la información">👁</button><button type="button" data-editar="${f.fila}" title="${nc ? 'Editar nota de crédito (número y días)' : 'Editar factura'}">✏️</button></div></td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="paginas"><span>${lista.length} registro${lista.length === 1 ? '' : 's'} · página ${pagina} de ${total}</span>
        <div><button class="btn sec chico" type="button" data-pag="-1" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button><button class="btn sec chico" type="button" data-pag="1" ${pagina >= total ? 'disabled' : ''}>Siguiente →</button></div></div>`;
  }

  raiz.addEventListener('input', (e) => { if (e.target.closest('.card') && !e.target.closest('[data-tabla]')) { pagina = 1; pintar(); } });
  raiz.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') { pagina = 1; pintar(); } });
  $('[data-limpiar]', raiz).onclick = () => { raiz.querySelectorAll('.card .inp').forEach((i) => { if (i.id !== 'h-busqueda') i.value = ''; }); pagina = 1; pintar(); };
  $('[data-tabla]', raiz).addEventListener('click', (e) => {
    const o = e.target.closest('[data-ord]');
    if (o) {
      const c = COLUMNAS[Number(o.dataset.ord)];
      orden = orden?.col === c.col ? (orden.dir === 1 ? { ...orden, dir: -1 } : null) : { col: c.col, tipo: c.tipo, dir: 1 };
      pagina = 1; pintar(); return;
    }
    const p = e.target.closest('[data-pag]');
    if (p) { pagina += Number(p.dataset.pag); pintar(); raiz.scrollIntoView({ behavior: 'smooth' }); return; }
    const ver = e.target.closest('[data-ver]');
    if (ver) { verFactura(S.facturas.find((f) => f.fila === Number(ver.dataset.ver))); return; }
    const ed = e.target.closest('[data-editar]');
    if (ed) {
      const f = S.facturas.find((x) => x.fila === Number(ed.dataset.editar));
      if (f) (esNotaCredito(f) ? editarNota : editarFactura)(f);
    }
  });

  alCambiar(pintar);
  pintar();
}

export function verFactura(f) {
  if (!f) return;
  modal(`
    <div class="modal-cab"><div><h2>Factura ${esc(f.valores[COL.CCF])}</h2><p>${esc(f.valores[COL.NOMBRE_COMERCIAL])} · fila ${f.fila} de DATOS FB</p></div><button class="btn ghost" data-cerrar aria-label="Cerrar">✕</button></div>
    <dl class="det">${SHEET_COLUMNS.map((c, i) => `<div><dt>${esc(c)}</dt><dd>${f.valores[i]?.trim() ? esc(f.valores[i]) : '—'}</dd></div>`).join('')}</dl>
    <div class="modal-pie"><button class="btn sec" data-cerrar>Cerrar</button></div>`);
}

function editarFactura(f) {
  const x = f.valores;
  let guardando = false;
  const m = modal(`
    <div class="modal-cab"><div><h2>Editar factura ${esc(x[COL.CCF])}</h2><p>Fila ${f.fila} de DATOS FB · el CCF no es editable</p></div><button class="btn ghost" data-cerrar aria-label="Cerrar">✕</button></div>
    <form novalidate class="pila" data-ed>${htmlFactura('e-', { edicion: true, ccfFijo: x[COL.CCF] })}
      <div class="modal-pie"><button type="button" class="btn ghost" data-cerrar>Cancelar</button><button type="submit" class="btn min" data-g>Guardar cambios</button></div>
    </form>`, { bloqueado: () => guardando });
  const raiz = $('[data-ed]', m.el);
  const form = montarFactura(raiz, 'e-');

  // Valores actuales de la fila
  const dias = parseSheetNumber(x[COL.CREDITO]);
  const diasOk = Number.isFinite(dias) && dias > 0 ? Math.round(dias) : 0;
  const monto = parseSheetNumber(x[COL.MONTO]);
  const nota = parseSheetNumber(x[COL.NOTA_CREDITO]);
  const pct = parseSheetNumber(x[COL.DESCUENTO_PCT]);
  const pctOk = Number.isFinite(pct) && pct > 0 ? pct : 0;
  const cod = x[COL.COD_PROV].trim();
  form.combo.set(S.proveedores.find((p) => p.codProv === cod) || { codProv: cod, razonSocial: x[COL.RAZON_SOCIAL].trim(), nombreComercial: x[COL.NOMBRE_COMERCIAL].trim(), creditoDias: diasOk });
  form.setTipo(diasOk > 0 ? 'CREDITO' : 'CONTADO');
  const g = form.g;
  g('creditoDias').value = diasOk || '';
  g('fechaEmision').value = sheetDateToIso(x[COL.FECHA_EMISION]);
  g('fechaEmision').removeAttribute('max');
  g('monto').value = Number.isFinite(monto) ? monto : '';
  g('notaCredito').value = Number.isFinite(nota) && nota > 0 ? nota : '';
  g('descuentoPorcentaje').value = pctOk || '';
  g('descuentoDolares').value = Number.isFinite(monto) && pctOk > 0 ? roundMoney((monto * pctOk) / 100) : '';
  g('fechaProgramacion').value = sheetDateToIso(x[COL.FECHA_PROGRAMACION]);
  g('comentarios').value = x[COL.COMENTARIOS].trim();
  g('numeroCheque').value = x[COL.CHEQUE].trim();
  g('fechaEntregaCheque').value = sheetDateToIso(x[COL.FECHA_ENTREGA]);
  g('banco').value = x[COL.BANCO].trim();
  if (!S.proveedores.length) form.combo.setDisabled(true);

  raiz.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;
    const val = form.leer();
    val.ccf = x[COL.CCF].trim();
    if (!form.validar(val)) return;
    if (!(await confirmar())) return;
    guardando = true;
    const btn = $('[data-g]', raiz); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const r = await llamar('editarFactura', { fila: f.fila, datos: val });
      toast(`Factura ${val.ccf} actualizada correctamente${segundos(r)}`);
      actualizarFilas([r.factura]);
      guardando = false; m.cerrar();
    } catch (err) {
      await alertaError(err.message);
    } finally {
      guardando = false; btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  });
}

function editarNota(f) {
  const x = f.valores;
  const rel = ccfRelacionadoDe(x[COL.COMENTARIOS]);
  const d = parseSheetNumber(x[COL.CREDITO]);
  let guardando = false;
  const m = modal(`
    <div class="modal-cab"><div><h2>Editar nota de crédito</h2><p>Fila ${f.fila}${rel ? ` · relacionada con CCF ${esc(rel)}` : ''}</p></div><button class="btn ghost" data-cerrar aria-label="Cerrar">✕</button></div>
    <div class="pila">
      ${campo({ id: 'en-numero', label: 'Número de nota de crédito', req: true, ayuda: 'Solo el número; el prefijo NC- es fijo', control: `<div class="pref"><span aria-hidden="true">NC-</span><input class="inp" id="en-numero" value="${esc(x[COL.CCF].trim().replace(/^(?:NC[-\s]?)+/i, ''))}" autofocus></div>` })}
      ${campo({ id: 'en-dias', label: 'Días de crédito', ayuda: 'Entero, no negativo', control: `<input class="inp" id="en-dias" type="number" step="1" min="0" inputmode="numeric" value="${Number.isFinite(d) && d >= 0 ? Math.round(d) : 0}">` })}
    </div>
    <div class="modal-pie"><button class="btn ghost" data-cerrar>Cancelar</button><button class="btn min" data-g>Guardar cambios</button></div>`, { chico: true, bloqueado: () => guardando });

  $('[data-g]', m.el).onclick = async () => {
    const numero = $('#en-numero', m.el).value;
    const dias = Number($('#en-dias', m.el).value);
    if (!normalizarNumeroNota(numero)) { await alertaError('Ingresa el número de la nota de crédito.'); return; }
    if (!Number.isInteger(dias) || dias < 0) { await alertaError('Los días de crédito deben ser un entero no negativo.'); return; }
    guardando = true;
    const btn = $('[data-g]', m.el); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const r = await llamar('editarNota', { datos: { fila: f.fila, numeroNota: numero, creditoDias: dias, numeroActual: x[COL.CCF].trim() } });
      toast(`Nota ${normalizarNumeroNota(numero)} actualizada correctamente`);
      actualizarFilas([r.factura]);
      guardando = false; m.cerrar();
    } catch (err) {
      await alertaError(err.message);
    } finally {
      guardando = false; btn.disabled = false; btn.textContent = 'Guardar cambios';
    }
  };
}
