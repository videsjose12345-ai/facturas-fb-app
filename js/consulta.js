// Módulo Consulta de pagos (solo lectura sobre la hoja PAGOS).
import { S, alCambiar } from './api.js';
import { campo, modal } from './ui.js';
import { $, badgeEstado, dinero, esc, normalizeSearchText } from './util.js';

const MAX = 50;
function comoMonto(q) {
  const l = q.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(l)) return null;
  const n = Number(l);
  return n > 0 ? n : null;
}

export function montarConsulta(raiz) {
  raiz.innerHTML = `
    <h1 class="titulo">Consulta de pagos</h1>
    <p class="sub">Pagos registrados en la hoja PAGOS (solo lectura).</p>
    <section class="card">${campo({ id: 'cp-busqueda', label: 'Buscar pago', ayuda: 'Monto total (ej. 4850.25), n° de cheque, banco, fecha, razón social, nombre comercial, código o CCF', control: '<input class="inp" id="cp-busqueda" placeholder="Ej.: 4850.25, 001234, Agrícola, drogu…" type="search" autocomplete="off">' })}</section>
    <section class="card sinpad" style="margin-top:16px" data-tabla></section>`;

  const busca = $('#cp-busqueda', raiz);
  const nombreCom = (p) => S.proveedores.find((x) => x.codProv.trim() === p.codProv)?.nombreComercial ?? '';
  const lista = () => S.pagos.slice().reverse();

  function filtrados() {
    const q = busca.value.trim();
    if (!q) return lista();
    const m = comoMonto(q);
    if (m !== null) return lista().filter((p) => Math.abs(p.montoTotal - m) < 0.005);
    const nq = normalizeSearchText(q);
    return lista().filter((p) => normalizeSearchText([p.idPago, p.referencia, p.banco, p.fecha, p.proveedor, nombreCom(p), p.codProv, p.metodoPago, ...p.detalle.map((d) => d.ccf)].join(' ')).includes(nq));
  }

  function pintar() {
    const c = $('[data-tabla]', raiz);
    if (!S.cargado) { c.innerHTML = S.error ? `<p class="vacio" style="color:var(--rojo)">${esc(S.error)}</p>` : '<div class="cargando"><span class="spin"></span>Cargando…</div>'; return; }
    const f = filtrados(), vis = f.slice(0, MAX);
    if (!vis.length) { c.innerHTML = `<p class="vacio">${S.pagos.length === 0 ? 'Aún no hay pagos registrados en la hoja PAGOS.' : 'No se encontraron resultados.'}</p>`; return; }
    c.innerHTML = `<div class="tabla-w"><table class="t cards">
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Nombre comercial</th><th>Método</th><th>Banco</th><th>Cheque / Ref.</th><th class="der">Monto total</th><th class="der">Docs.</th><th></th></tr></thead>
      <tbody>${vis.map((p) => `<tr>
        <td data-l="Fecha" class="nw num">${esc(p.fecha)}</td>
        <td data-l="Proveedor" class="trunc" title="${esc(p.proveedor)}">${esc(p.proveedor)}</td>
        <td data-l="Nombre comercial" class="trunc tenue">${esc(nombreCom(p) || '—')}</td>
        <td data-l="Método" class="nw">${esc(p.metodoPago)}</td>
        <td data-l="Banco" class="nw tenue">${esc(p.banco || '—')}</td>
        <td data-l="Cheque / Ref." class="nw tenue">${esc(p.referencia || '—')}</td>
        <td data-l="Monto total" class="der nw num"><b>${dinero(p.montoTotal)}</b></td>
        <td data-l="Documentos" class="der num">${p.cantidadFacturas}</td>
        <td data-l=""><button class="btn sec chico" type="button" data-det="${p.fila}">Ver detalle</button></td>
      </tr>`).join('')}</tbody></table></div>
      <p class="nota" style="margin:0;padding:8px 16px;border-top:1px solid var(--linea)">${f.length} pago${f.length === 1 ? '' : 's'}${f.length > MAX ? ` · mostrando los primeros ${MAX}; afina la búsqueda` : ''}</p>`;
  }

  let ultimoAuto = '';
  busca.addEventListener('input', () => {
    pintar();
    const f = filtrados();
    if (comoMonto(busca.value) !== null && f.length === 1 && ultimoAuto !== busca.value) { ultimoAuto = busca.value; detalle(f[0]); }
  });
  $('[data-tabla]', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('[data-det]'); if (!b) return;
    detalle(S.pagos.find((p) => p.fila === Number(b.dataset.det)));
  });

  function detalle(p) {
    if (!p) return;
    const datos = [
      ['Proveedor (razón social)', p.proveedor], ['Nombre comercial', nombreCom(p)], ['Código proveedor', p.codProv],
      ['Método de pago', p.metodoPago], ['Banco', p.banco], ['N° de cheque / referencia', p.referencia],
      ['Fecha del pago', p.fecha], ['Monto total pagado', dinero(p.montoTotal)], ['Cantidad de documentos', String(p.cantidadFacturas)], ['Comentarios', p.comentarios],
    ];
    modal(`
      <div class="modal-cab"><div><h2>${esc(p.idPago)}</h2><p>Consulta de pago · solo lectura</p></div><button class="btn ghost" data-cerrar aria-label="Cerrar">✕</button></div>
      <dl class="det">${datos.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${String(b ?? '').trim() ? esc(b) : '—'}</dd></div>`).join('')}</dl>
      <h3 style="margin:20px 0 8px;font-size:14px;color:var(--texto2)">Documentos de este pago</h3>
      ${p.detalle.length === 0 ? '<p class="nota">Este pago no tiene detalle registrado (fue anterior a la Consulta de pagos).</p>' : `
      <table class="t"><thead><tr><th>CCF</th><th class="der">Monto pagado</th><th>Estado</th></tr></thead><tbody>
        ${p.detalle.map((d) => `<tr><td>${esc(d.ccf)}</td><td class="der num">${dinero(d.monto)}</td><td>${badgeEstado(d.estado)}</td></tr>`).join('')}
      </tbody></table>`}
      <div class="modal-pie"><button class="btn sec" data-cerrar>Cerrar</button></div>`);
  }

  alCambiar(pintar);
  pintar();
}
