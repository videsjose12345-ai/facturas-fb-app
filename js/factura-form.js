// Formulario de factura (CCF): se usa en Registro y en "Editar factura".
import { S } from './api.js';
import { campo, comboProveedor, mostrarErrores } from './ui.js';
import { DIAS_CREDITO_SUGERIDOS, hoyIso, roundMoney, roundPercent, $, esc } from './util.js';

const inp = (id, attrs = '') => `<input class="inp" id="${id}" ${attrs}>`;

/** HTML del formulario. `p` = prefijo de ids; `edicion` = modo editar. */
export function htmlFactura(p, { edicion = false, ccfFijo = '' } = {}) {
  return `
  <div class="card">
    ${edicion ? '' : '<h2>Datos de la factura</h2>'}
    <div class="grid g2 form">
      ${campo({ id: `${p}proveedor`, label: 'Proveedor', req: true, clase: 'span2', control: `<div>${inp(`${p}proveedor`, 'placeholder="Escribe código, razón social o nombre comercial…" type="text"')}</div>` })}
      <div class="campo span2"><span class="lbl">Tipo de compra <span class="req">*</span></span>
        <div class="seg" role="radiogroup" aria-label="Tipo de compra" data-tipo>
          <button type="button" role="radio" data-v="CREDITO" aria-checked="true">Crédito</button>
          <button type="button" role="radio" data-v="CONTADO" aria-checked="false">Contado</button>
        </div></div>
      ${campo({ id: `${p}fechaEmision`, label: 'Fecha de emisión', req: true, control: inp(`${p}fechaEmision`, `type="date" max="${hoyIso()}"`) })}
      ${edicion
        ? campo({ id: `${p}ccf`, label: 'CCF (no editable)', control: inp(`${p}ccf`, `disabled readonly value="${esc(ccfFijo)}"`) })
        : campo({ id: `${p}ccf`, label: 'CCF', req: true, control: inp(`${p}ccf`, 'placeholder="N° de comprobante" autocapitalize="characters"') })}
      ${campo({ id: `${p}monto`, label: 'Monto ($)', req: true, control: inp(`${p}monto`, 'type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"') })}
      ${campo({ id: `${p}creditoDias`, label: 'Días de crédito', req: true, clase: 'solo-credito', control: inp(`${p}creditoDias`, `type="number" step="1" min="1" max="365" inputmode="numeric" list="${p}dias-sug"`) + `<datalist id="${p}dias-sug">${DIAS_CREDITO_SUGERIDOS.map((d) => `<option value="${d}">`).join('')}</datalist>` })}
    </div>
  </div>
  <div class="card">
    <h2>Ajustes del monto (opcional)</h2>
    <div class="grid g3 form">
      ${campo({ id: `${p}notaCredito`, label: 'Nota de crédito ($)', control: inp(`${p}notaCredito`, 'type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"') })}
      ${campo({ id: `${p}descuentoPorcentaje`, label: 'Descuento (%)', control: inp(`${p}descuentoPorcentaje`, 'type="number" step="0.01" min="0" max="100" inputmode="decimal" placeholder="0"') })}
      ${campo({ id: `${p}descuentoDolares`, label: 'Descuento ($)', ayuda: 'A la hoja solo va el %; el $ lo calcula tu fórmula', control: inp(`${p}descuentoDolares`, 'type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"') })}
    </div>
  </div>
  <details class="card" ${edicion ? 'open' : ''}>
    <summary>Programación y pago (opcional)</summary>
    <div class="grid g2 form">
      ${campo({ id: `${p}fechaProgramacion`, label: 'Fecha de programación de pago', clase: 'solo-credito', ayuda: 'Si la llenas, la factura queda 1 - PROGRAMADA', control: inp(`${p}fechaProgramacion`, 'type="date"') })}
      ${campo({ id: `${p}numeroCheque`, label: 'N° de cheque', control: inp(`${p}numeroCheque`) })}
      ${campo({ id: `${p}fechaEntregaCheque`, label: 'Fecha de entrega de cheque', control: inp(`${p}fechaEntregaCheque`, 'type="date"') })}
      ${campo({ id: `${p}banco`, label: 'Banco', control: inp(`${p}banco`) })}
      ${campo({ id: `${p}comentarios`, label: 'Comentarios', clase: 'span2', control: inp(`${p}comentarios`, 'maxlength="500"') })}
    </div>
  </details>`;
}

/** Conecta el comportamiento del formulario. */
export function montarFactura(raiz, p, { alEnfocarProveedor } = {}) {
  const g = (k) => $(`#${p}${k}`, raiz);
  let tipo = 'CREDITO';

  const combo = comboProveedor(g('proveedor'), {
    lista: () => S.proveedores,
    alEnfocar: alEnfocarProveedor,
    alElegir: (prov) => { if (prov && tipo === 'CREDITO') g('creditoDias').value = prov.creditoDias || ''; },
  });

  const segBtns = [...raiz.querySelectorAll('[data-tipo] button')];
  const setTipo = (t, { conservarDias = false } = {}) => {
    tipo = t;
    segBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === t)));
    raiz.querySelectorAll('.solo-credito').forEach((c) => { c.hidden = t !== 'CREDITO'; });
    if (t === 'CONTADO') { g('creditoDias').value = ''; g('fechaProgramacion').value = ''; }
    else if (!conservarDias || !(Number(g('creditoDias').value) > 0)) {
      const prov = combo.get(); g('creditoDias').value = prov ? prov.creditoDias || '' : '';
    }
  };
  segBtns.forEach((b) => b.addEventListener('click', () => setTipo(b.dataset.v, { conservarDias: true })));

  // Descuento bidireccional: el último campo editado manda.
  const m = () => Number(g('monto').value);
  g('descuentoPorcentaje').addEventListener('input', () => {
    const pct = Number(g('descuentoPorcentaje').value);
    g('descuentoDolares').value = m() > 0 && pct > 0 ? roundMoney((m() * pct) / 100) : '';
  });
  g('descuentoDolares').addEventListener('input', () => {
    const usd = Number(g('descuentoDolares').value);
    g('descuentoPorcentaje').value = m() > 0 && usd > 0 ? roundPercent((usd / m()) * 100) : '';
  });
  g('monto').addEventListener('input', () => {
    const pct = Number(g('descuentoPorcentaje').value);
    if (pct > 0) g('descuentoDolares').value = m() > 0 ? roundMoney((m() * pct) / 100) : '';
  });

  const numOr = (v, d = 0) => (String(v).trim() === '' ? d : Number(v));

  function leer() {
    return {
      proveedor: combo.get(),
      tipoCompra: tipo,
      creditoDias: tipo === 'CONTADO' ? 0 : numOr(g('creditoDias').value, NaN),
      fechaEmision: g('fechaEmision').value,
      ccf: g('ccf').value.trim(),
      monto: numOr(g('monto').value, NaN),
      notaCredito: numOr(g('notaCredito').value),
      descuentoPorcentaje: numOr(g('descuentoPorcentaje').value),
      descuentoDolares: numOr(g('descuentoDolares').value),
      fechaProgramacion: tipo === 'CREDITO' ? g('fechaProgramacion').value : '',
      comentarios: g('comentarios').value.trim(),
      numeroCheque: g('numeroCheque').value.trim(),
      fechaEntregaCheque: g('fechaEntregaCheque').value,
      banco: g('banco').value.trim(),
    };
  }

  /** Mismas reglas del esquema Zod original. */
  function validar(v) {
    const e = {};
    if (!v.proveedor) e[`${p}proveedor`] = 'Selecciona un proveedor del catálogo';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fechaEmision)) e[`${p}fechaEmision`] = 'Ingresa la fecha de emisión';
    else if (v.fechaEmision > hoyIso()) e[`${p}fechaEmision`] = 'La fecha de emisión no puede ser futura';
    if (!v.ccf) e[`${p}ccf`] = 'Ingresa el número de CCF';
    else if (v.ccf.length > 50) e[`${p}ccf`] = 'Máximo 50 caracteres';
    if (!Number.isFinite(v.monto)) e[`${p}monto`] = 'Ingresa el monto';
    else if (v.monto <= 0) e[`${p}monto`] = 'El monto debe ser mayor que 0';
    if (v.tipoCompra === 'CREDITO') {
      if (!Number.isFinite(v.creditoDias) || !Number.isInteger(v.creditoDias)) e[`${p}creditoDias`] = 'Debe ser un número entero';
      else if (v.creditoDias < 1) e[`${p}creditoDias`] = 'Indica los días de crédito (15, 30, 45, 60, …)';
      else if (v.creditoDias > 365) e[`${p}creditoDias`] = 'Máximo 365 días';
    }
    if (!(v.notaCredito >= 0)) e[`${p}notaCredito`] = 'No puede ser negativo';
    if (!(v.descuentoPorcentaje >= 0)) e[`${p}descuentoPorcentaje`] = 'No puede ser negativo';
    else if (v.descuentoPorcentaje > 100) e[`${p}descuentoPorcentaje`] = 'Máximo 100%';
    if (!(v.descuentoDolares >= 0)) e[`${p}descuentoDolares`] = 'No puede ser negativo';
    return mostrarErrores(raiz, e);
  }

  function reset(t = tipo) {
    combo.set(null);
    ['ccf', 'monto', 'notaCredito', 'descuentoPorcentaje', 'descuentoDolares', 'fechaProgramacion', 'comentarios', 'numeroCheque', 'fechaEntregaCheque', 'banco', 'creditoDias']
      .forEach((k) => { const i = g(k); if (i && !i.disabled) i.value = ''; });
    g('fechaEmision').value = hoyIso();
    mostrarErrores(raiz, {});
    setTipo(t);
  }

  /** Total estimado: monto − nota de crédito − descuento ($). */
  function total() {
    const v = leer();
    if (!(v.monto > 0)) return null;
    return roundMoney(v.monto - (v.notaCredito || 0) - (v.descuentoDolares || 0));
  }

  return { combo, leer, validar, reset, setTipo, total, tipo: () => tipo, g };
}
