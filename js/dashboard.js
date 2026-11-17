// Módulo Dashboard: KPIs, gráficos y tablas (mismos cálculos de la app original).
import { S, alCambiar } from './api.js';
import { COL, ESTATUS, $, dinero, esNotaCredito, esc, parseSheetNumber, sheetDateOrdinal, sheetDateToTime } from './util.js';

const RANGOS = [['7', '7 días'], ['30', '30 días'], ['90', '90 días'], ['todo', 'Todo']];
const COLOR_HEX = {
  [ESTATUS.PROGRAMADA]: '#F59E0B', [ESTATUS.PROCESO_PAGO]: '#8B5CF6', [ESTATUS.PENDIENTE]: '#3B82F6',
  [ESTATUS.ABONO]: '#0EA5E9', [ESTATUS.PAGADA]: '#16A34A', [ESTATUS.INACTIVA]: '#94A3B8',
  [ESTATUS.DISPONIBLE]: '#34D399', [ESTATUS.APLICADA]: '#64748B',
};
const num = (f, c) => { const n = parseSheetNumber(f.valores[c]); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const est = (f) => f.valores[COL.ESTADO].trim();
const nombre = (f) => f.valores[COL.NOMBRE_COMERCIAL].trim() || f.valores[COL.RAZON_SOCIAL].trim() || '(sin nombre)';
const ordD = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const noVence = (f) => [ESTATUS.PAGADA, ESTATUS.INACTIVA, ESTATUS.DISPONIBLE, ESTATUS.APLICADA].includes(est(f)) || esNotaCredito(f);
const kpi = (i, c, t, v, s = '') => `<div class="kpi"><span class="ic ${c}">${i}</span><div class="tx"><p class="k-t">${t}</p><p class="k-v">${v}</p>${s ? `<p class="k-s">${s}</p>` : ''}</div></div>`;

export function montarDashboard(raiz) {
  let rango = '30';
  raiz.innerHTML = `
    <h1 class="titulo">Dashboard</h1>
    <p class="sub">Resumen de DATOS FB en vivo.</p>
    <div data-cont></div>`;

  function pintar() {
    const cont = $('[data-cont]', raiz);
    if (!S.cargado) { cont.innerHTML = S.error ? `<p class="vacio" style="color:var(--rojo)">${esc(S.error)}</p>` : '<div class="cargando"><span class="spin"></span>Cargando…</div>'; return; }
    const fs = S.facturas;
    const hoy = new Date();
    const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const desde = (o) => { let c = 0, m = 0; for (const f of fs) { const x = sheetDateOrdinal(f.valores[COL.FECHA_EMISION]); if (x > 0 && x >= o) { c++; m += num(f, COL.MONTO); } } return { c, m: r2(m) }; };
    const per = [
      ['📅', 'c-teal', 'Hoy', desde(ordD(hoy))],
      ['🗓️', 'c-lime', 'Esta semana', desde(ordD(lunes))],
      ['📆', 'c-amber', 'Este mes', desde(hoy.getFullYear() * 10000 + (hoy.getMonth() + 1) * 100 + 1)],
      ['📈', 'c-sky', 'Este año', desde(hoy.getFullYear() * 10000 + 101)],
    ];

    const enRango = rango === 'todo' ? fs : (() => { const d = new Date(); d.setDate(d.getDate() - Number(rango)); const o = ordD(d); return fs.filter((f) => sheetDateOrdinal(f.valores[COL.FECHA_EMISION]) >= o); })();

    // KPIs
    const k = { total: enRango.length, monto: 0, pend: 0, prog: 0, pag: 0, proc: 0, abo: 0, venc: 0, mPend: 0, mPag: 0, mProg: 0 };
    for (const f of enRango) {
      const e = est(f), saldo = num(f, COL.SALDO);
      k.monto += num(f, COL.MONTO); k.mPend += saldo; k.mPag += num(f, COL.ABONO);
      if (e === ESTATUS.PENDIENTE) k.pend++;
      else if (e === ESTATUS.PROGRAMADA) { k.prog++; k.mProg += saldo; }
      else if (e === ESTATUS.PAGADA) k.pag++;
      else if (e === ESTATUS.PROCESO_PAGO) k.proc++;
      else if (e === ESTATUS.ABONO) k.abo++;
      if (!noVence(f)) { const t = sheetDateToTime(f.valores[COL.VENCIMIENTO]); if (t !== null && t < hoyUtc) k.venc++; }
    }

    // Gráficos
    const conteo = new Map();
    enRango.forEach((f) => conteo.set(nombre(f), (conteo.get(nombre(f)) || 0) + 1));
    const porProv = [...conteo].map(([e, v]) => ({ e, v })).sort((a, b) => b.v - a.v).slice(0, 10);
    const porEst = Object.values(ESTATUS).map((e) => ({ e, v: enRango.filter((f) => est(f) === e).length })).filter((d) => d.v > 0);
    const agrupa = (lista, clave, etiqueta) => {
      const m = new Map();
      for (const f of lista) { const o = sheetDateOrdinal(f.valores[COL.FECHA_EMISION]); if (!o) continue; const c = clave(o); const p = m.get(c); if (p) p.v += num(f, COL.MONTO); else m.set(c, { e: etiqueta(c, f), v: num(f, COL.MONTO) }); }
      return [...m].sort((a, b) => a[0] - b[0]).map(([, d]) => ({ e: d.e, v: r2(d.v) }));
    };
    const porDia = agrupa(enRango, (o) => o, (c, f) => f.valores[COL.FECHA_EMISION].trim().split('/').slice(0, 2).join('/')).slice(-90);
    const porMes = agrupa(rango === 'todo' ? fs : enRango, (o) => Math.floor(o / 100), (c) => `${String(c % 100).padStart(2, '0')}/${Math.floor(c / 100)}`).slice(-12);

    // Tablas
    const venc = fs.filter((f) => !noVence(f)).map((f) => ({ f, t: sheetDateToTime(f.valores[COL.VENCIMIENTO]) }))
      .filter((x) => x.t !== null && x.t >= hoyUtc)
      .map(({ f, t }) => ({ prov: nombre(f), ccf: f.valores[COL.CCF].trim(), fecha: f.valores[COL.VENCIMIENTO].trim(), saldo: r2(num(f, COL.SALDO)), dias: Math.round((t - hoyUtc) / 86400000) }))
      .sort((a, b) => a.dias - b.dias).slice(0, 10);
    const acum = new Map();
    enRango.forEach((f) => { const a = acum.get(nombre(f)) || { m: 0, c: 0 }; a.m += num(f, COL.MONTO); a.c++; acum.set(nombre(f), a); });
    const top = [...acum].map(([p, a]) => ({ p, m: r2(a.m), c: a.c, pr: r2(a.m / a.c) })).sort((a, b) => b.m - a.m).slice(0, 10);

    cont.innerHTML = `
      <div class="kpis">${per.map(([i, c, t, r]) => kpi(i, c, t, dinero(r.m), `${r.c} factura${r.c === 1 ? '' : 's'}`)).join('')}</div>
      <div class="rangos" style="margin:20px 0 16px"><span class="nota" style="font-size:13px">Últimos:</span>${RANGOS.map(([c, e]) => `<button type="button" data-rango="${c}" aria-pressed="${rango === c}">${e}</button>`).join('')}</div>
      <div class="kpis">
        ${kpi('📄', 'c-teal', 'Total de facturas', k.total)}${kpi('💰', 'c-lime', 'Monto total', dinero(r2(k.monto)))}
        ${kpi('⏳', 'c-sky', 'Pendientes', k.pend)}${kpi('📅', 'c-amber', 'Programadas', k.prog)}
        ${kpi('✅', 'c-green', 'Pagadas', k.pag)}${kpi('⚠️', 'c-red', 'Vencidas', k.venc)}
        ${kpi('🔄', 'c-dark', 'Proceso de pago', k.proc)}${kpi('💳', 'c-dark', 'Abonos', k.abo)}
        ${kpi('🏦', 'c-sky', 'Total pendiente', dinero(r2(k.mPend)))}${kpi('💵', 'c-green', 'Total pagado', dinero(r2(k.mPag)))}
        ${kpi('🗓️', 'c-amber', 'Monto programado', dinero(r2(k.mProg)))}
      </div>
      ${fs.length === 0 ? '<p class="card vacio" style="margin-top:16px">No se encontraron resultados.</p>' : `
      <div class="graf-grid" style="margin-top:16px">
        <section class="card"><h2>Facturas por proveedor (Top 10)</h2>${porProv.length ? barras(porProv) : sinDatos()}</section>
        <section class="card"><h2>Facturas por estado</h2>${porEst.length ? pie(porEst) : sinDatos()}</section>
        <section class="card"><h2>Compras por día</h2>${porDia.length ? linea(porDia) : sinDatos()}</section>
        <section class="card"><h2>Compras por mes</h2>${porMes.length ? columnas(porMes) : sinDatos()}</section>
        <section class="card"><h2>Próximos vencimientos</h2>${venc.length ? `<div class="tabla-w"><table class="t cards"><thead><tr><th>Proveedor</th><th>CCF</th><th>Fecha</th><th class="der">Saldo</th><th class="der">Días restantes</th></tr></thead><tbody>
          ${venc.map((v) => `<tr><td data-l="Proveedor" class="trunc" title="${esc(v.prov)}">${esc(v.prov)}</td><td data-l="CCF" class="nw tenue">${esc(v.ccf)}</td><td data-l="Fecha" class="nw num">${esc(v.fecha)}</td><td data-l="Saldo" class="der nw num">${dinero(v.saldo)}</td><td data-l="Días restantes" class="der"><span class="badge ${v.dias <= 3 ? 'c-red' : v.dias <= 7 ? 'c-amber' : 'c-teal'}">${v.dias} día${v.dias === 1 ? '' : 's'}</span></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="nota">No hay vencimientos próximos.</p>'}</section>
        <section class="card"><h2>Top proveedores</h2>${top.length ? `<div class="tabla-w"><table class="t cards"><thead><tr><th>Proveedor</th><th class="der">Monto comprado</th><th class="der">Facturas</th><th class="der">Promedio</th></tr></thead><tbody>
          ${top.map((p) => `<tr><td data-l="Proveedor" class="trunc" title="${esc(p.p)}">${esc(p.p)}</td><td data-l="Monto comprado" class="der nw num">${dinero(p.m)}</td><td data-l="Facturas" class="der num">${p.c}</td><td data-l="Promedio" class="der nw num">${dinero(p.pr)}</td></tr>`).join('')}
          </tbody></table></div>` : sinDatos()}</section>
      </div>`}`;
  }

  raiz.addEventListener('click', (e) => { const b = e.target.closest('[data-rango]'); if (b) { rango = b.dataset.rango; pintar(); } });
  alCambiar(pintar);
  pintar();
}

const sinDatos = () => '<p class="nota">Sin datos en el rango.</p>';

function barras(d) {
  const max = Math.max(...d.map((x) => x.v), 1);
  return `<div class="barras">${d.map((x) => `<div class="fila"><span class="eti" title="${esc(x.e)}">${esc(x.e)}</span><div class="pista"><div class="rel" style="width:${Math.max((x.v / max) * 100, 4)}%">${x.v}</div></div></div>`).join('')}</div>`;
}

function pie(d) {
  const total = d.reduce((s, x) => s + x.v, 0);
  let a = -Math.PI / 2;
  const col = (x) => COLOR_HEX[x.e] || '#94A3B8';
  const partes = d.length === 1 ? `<circle cx="50" cy="50" r="42" fill="${col(d[0])}"/>` : d.map((x) => {
    const ang = (x.v / total) * Math.PI * 2, a0 = a, a1 = a + ang; a = a1;
    const p = (t) => `${50 + 42 * Math.cos(t)},${50 + 42 * Math.sin(t)}`;
    return `<path d="M50,50 L${p(a0)} A42,42 0 ${ang > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${col(x)}" stroke="#1E293B" stroke-width="1"/>`;
  }).join('');
  return `<div class="pie"><svg viewBox="0 0 100 100" role="img" aria-label="Facturas por estado">${partes}</svg><ul>${d.map((x) => `<li><i style="background:${col(x)}"></i>${esc(x.e)}: <b>${x.v}</b> (${Math.round((x.v / total) * 100)}%)</li>`).join('')}</ul></div>`;
}

function linea(d) {
  const W = 600, H = 180, M = 8, max = Math.max(...d.map((x) => x.v), 1);
  const paso = d.length > 1 ? (W - 2 * M) / (d.length - 1) : 0;
  const X = (i) => M + i * paso, Y = (v) => H - M - (v / max) * (H - 2 * M);
  const pts = d.map((x, i) => `${X(i)},${Y(x.v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="Compras por día">
    <polygon points="${M},${H - M} ${pts} ${X(d.length - 1)},${H - M}" fill="#2E9FC7" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="#2E9FC7" stroke-width="2"/>
    ${d.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.v)}" r="2.5" fill="#2E9FC7"><title>${esc(x.e)}: ${dinero(x.v)}</title></circle>`).join('')}
  </svg><div class="linea-ejes"><span>${esc(d[0].e)}</span>${d.length > 2 ? `<span>${esc(d[Math.floor(d.length / 2)].e)}</span>` : ''}<span>${esc(d[d.length - 1].e)}</span></div>`;
}

function columnas(d) {
  const max = Math.max(...d.map((x) => x.v), 1);
  return `<div class="cols">${d.map((x) => `<div class="c" title="${esc(x.e)}: ${dinero(x.v)}"><span class="num">${x.v >= 1000 ? `$${Math.round(x.v / 100) / 10}k` : `$${Math.round(x.v)}`}</span><div class="b" style="height:${Math.max((x.v / max) * 78, 2)}%"></div><span>${esc(x.e)}</span></div>`).join('')}</div>`;
}
