/**
 * FACTURAS FB — Apps Script (backend de la app instalable de GitHub Pages).
 *
 * Es un proyecto de Apps Script APARTE (script.google.com → Nuevo proyecto),
 * así no se toca el script que la hoja ya tiene. Se publica como
 * "Aplicación web". La página de GitHub Pages solo tiene la URL de esta
 * aplicación web; sin la CLAVE_APP no lee ni escribe nada.
 *
 * Propiedades del script:
 *   SHEET_ID  → ID de la hoja (el texto largo de su URL)
 *   CLAVE_APP → clave de acceso de la app
 *
 * Reglas (las mismas de la app original de Next.js):
 *  - DATOS FB: solo se escriben las 16 columnas escribibles
 *    (A–E, G–K, O, Q, R–T, AA). Las 11 columnas con ARRAYFORMULA
 *    (F, L, M, N, P, U, V, W, X, Y, Z) NUNCA se tocan.
 *  - No se elimina ninguna fila. Solo se agregan filas o se actualizan.
 *  - PROVEEDORES: solo lectura.
 *  - PAGOS: una fila por pago; si la pestaña no existe se crea sola.
 *  - Fechas DD/MM/YYYY y números puros: la hoja los interpreta igual que
 *    si se escribieran a mano (configuración regional de la hoja).
 *
 */

var VERSION = '3.2.0';

var TAB = {
  datos: 'DATOS FB',
  proveedores: 'PROVEEDORES',
  pagos: 'PAGOS'
};

var ESTATUS = {
  PROGRAMADA: '1 - PROGRAMADA',
  PROCESO_PAGO: '2 - PROCESO DE PAGO',
  PENDIENTE: '3 - PENDIENTE',
  ABONO: '4 - ABONO',
  PAGADA: '5 - PAGADA',
  INACTIVA: '6 - INACTIVA',
  DISPONIBLE: '7 - DISPONIBLE',
  APLICADA: '8 - APLICADA'
};

/** Índices de columna (base 0) en DATOS FB. */
var COL = {
  COD_PROV: 0, RAZON_SOCIAL: 1, NOMBRE_COMERCIAL: 2, CREDITO: 3, FECHA_EMISION: 4,
  CCF: 6, MONTO: 7, ABONO: 8, NOTA_CREDITO: 9, DESCUENTO_PCT: 10, TOTAL: 12,
  SALDO: 13, FECHA_PROGRAMACION: 14, ESTADO: 16, COMENTARIOS: 17, CHEQUE: 18,
  FECHA_ENTREGA: 19, VENCIMIENTO: 21, BANCO: 26
};

var PAGOS_COLUMNS = [
  'ID PAGO', 'FECHA', 'PROVEEDOR', 'CODIGO PROVEEDOR', 'METODO DE PAGO', 'BANCO',
  'N° CHEQUE / REFERENCIA', 'CANTIDAD DE FACTURAS', 'MONTO TOTAL PAGADO',
  'COMENTARIOS', 'DETALLE FACTURAS'
];

var METODOS_PAGO = ['CHEQUE', 'TRANSFERENCIA', 'EFECTIVO'];
var TOLERANCIA = 0.005;
var RX_MARCADOR_NC = /\[NC de ([^\]]+)\]/i;

// ───────────────────────────── Entrada HTTP ─────────────────────────────

/** GET: solo confirma que la aplicación web responde (no devuelve datos). */
function doGet() {
  return json_({ ok: true, app: 'FACTURAS FB', version: VERSION });
}

/**
 * POST con cuerpo JSON (Content-Type text/plain para evitar CORS):
 * { accion, clave, ...datos }
 */
function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Solicitud inválida.' });
  }

  var acceso = verificarClave_(req.clave);
  if (acceso !== true) return json_({ ok: false, auth: false, error: acceso });

  try {
    switch (req.accion) {
      case 'ping': return json_({ ok: true, version: VERSION });
      case 'todo': return json_(accionTodo_());
      case 'registrarFactura': return json_(conBloqueo_(function () { return registrarFactura_(req.datos); }));
      case 'editarFactura': return json_(conBloqueo_(function () { return editarFactura_(req.fila, req.datos); }));
      case 'aplicarNota': return json_(conBloqueo_(function () { return aplicarNota_(req.datos); }));
      case 'editarNota': return json_(conBloqueo_(function () { return editarNota_(req.datos); }));
      case 'registrarPago': return json_(conBloqueo_(function () { return registrarPago_(req.datos); }));
      default: return json_({ ok: false, error: 'Acción desconocida.' });
    }
  } catch (err) {
    if (err && err.validacion) return json_({ ok: false, error: err.message });
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'No se pudo completar en Google Sheets: ' + (err && err.message ? err.message : err) });
  }
}

/** Error de datos del usuario (se muestra tal cual, sin "No se pudo completar…"). */
function errorDatos_(msg) {
  var e = new Error(msg);
  e.validacion = true;
  return e;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── Seguridad ─────────────────────────────

/**
 * Compara con la propiedad CLAVE_APP. Tras 10 intentos fallidos en
 * 10 minutos bloquea el acceso 10 minutos (evita adivinar la clave).
 */
function verificarClave_(clave) {
  var esperada = PropertiesService.getScriptProperties().getProperty('CLAVE_APP');
  if (!esperada) return 'Falta configurar CLAVE_APP en las propiedades del script.';

  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 10) return 'Demasiados intentos. Espera 10 minutos.';

  if (typeof clave === 'string' && iguales_(clave, esperada)) return true;

  cache.put('fallos', String(fallos + 1), 600);
  Utilities.sleep(700);
  return 'Clave incorrecta.';
}

/** Comparación en tiempo constante. */
function iguales_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Una sola escritura a la vez (dos equipos guardando al mismo tiempo). */
function conBloqueo_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'La hoja está ocupada; intenta de nuevo en unos segundos.' };
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────────── Lectura ─────────────────────────────

function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  var h = libro_().getSheetByName(nombre);
  if (!h) throw new Error('No se encontró la pestaña ' + nombre + '.');
  return h;
}

/** Fila de 27 celdas de texto (A → AA). */
function pad27_(fila) {
  var r = [];
  for (var i = 0; i < 27; i++) r.push(String(fila && fila[i] != null ? fila[i] : ''));
  return r;
}

/** Todas las filas de DATOS FB con su número real de fila (valores formateados). */
function todasLasFacturas_() {
  var h = hoja_(TAB.datos);
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  var valores = h.getRange(2, 1, ultima - 1, 27).getDisplayValues();
  var r = [];
  for (var i = 0; i < valores.length; i++) {
    var v = pad27_(valores[i]);
    if (v[COL.COD_PROV].trim() !== '' || v[COL.CCF].trim() !== '') r.push({ fila: i + 2, valores: v });
  }
  return r;
}

function leerFila_(fila) {
  var v = hoja_(TAB.datos).getRange(fila, 1, 1, 27).getDisplayValues()[0];
  return { fila: fila, valores: pad27_(v) };
}

function getProveedores_() {
  var h = hoja_(TAB.proveedores);
  var ultima = h.getLastRow();
  if (ultima < 2) return [];
  return h.getRange(2, 1, ultima - 1, 4).getDisplayValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        codProv: String(r[0]).trim(),
        razonSocial: String(r[1] || '').trim(),
        nombreComercial: String(r[2] || '').trim(),
        creditoDias: parseInt(String(r[3] || '0').replace(/[^0-9-]/g, ''), 10) || 0
      };
    });
}

function todosLosPagos_() {
  var h = libro_().getSheetByName(TAB.pagos);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 11).getDisplayValues()
    .map(function (f, i) {
      var c = function (j) { return String(f[j] == null ? '' : f[j]).trim(); };
      var cant = num_(c(7)), monto = num_(c(8));
      return {
        fila: i + 2, idPago: c(0), fecha: c(1), proveedor: c(2), codProv: c(3),
        metodoPago: c(4), banco: c(5), referencia: c(6),
        cantidadFacturas: isFinite(cant) ? cant : 0,
        montoTotal: isFinite(monto) ? monto : 0,
        comentarios: c(9), detalle: parsearDetalle_(c(10))
      };
    })
    .filter(function (p) { return p.idPago !== ''; });
}

function accionTodo_() {
  return {
    ok: true,
    version: VERSION,
    proveedores: getProveedores_(),
    facturas: todasLasFacturas_(),
    pagos: todosLosPagos_(),
    leido: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss')
  };
}

// ───────────────────────────── Utilidades ─────────────────────────────

/** "$1,250.50" → 1250.5 · "-$67.00" o "($67.00)" → -67 · "" → NaN */
function num_(v) {
  var t = String(v == null ? '' : v);
  if (t.replace(/[^0-9]/g, '') === '') return NaN;
  var n = Number(t.replace(/[^0-9.-]/g, ''));
  if (/\(.*\)/.test(t) && n > 0) n = -n;
  return isFinite(n) ? n : NaN;
}
function round2_(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round4_(v) { return Math.round((v + Number.EPSILON) * 10000) / 10000; }
function norm_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

function esIso_(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
/** YYYY-MM-DD → DD/MM/YYYY */
function isoAHoja_(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
/** 04/07/2026 = 4/7/2026 */
function normFecha_(v) {
  var p = String(v == null ? '' : v).trim().split('/');
  if (p.length !== 3) return String(v == null ? '' : v).trim();
  return p.map(function (x) { return String(Number(x)); }).join('/');
}
function hoyHoja_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'); }
function hoyIso_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

/**
 * N° de cheque o referencia: si es un número con ceros a la izquierda
 * (ej. 00123) se guarda como texto para no perder los ceros.
 */
function referencia_(v, nombre) {
  var t = texto_(v, nombre);
  return /^0\d+$/.test(t) ? "'" + t : t;
}

/** Texto opcional: recorta y limita a 500 caracteres; "" si viene vacío. */
function texto_(v, nombre) {
  var t = v == null ? '' : String(v).trim();
  if (t.length > 500) throw errorDatos_(nombre + ': máximo 500 caracteres.');
  // Evita que un texto que empieza con "=" se convierta en fórmula.
  if (/^[=+]/.test(t)) t = "'" + t;
  return t;
}

function esNotaCredito_(f) {
  var estado = f.valores[COL.ESTADO].trim();
  return estado === ESTATUS.DISPONIBLE || estado === ESTATUS.APLICADA || RX_MARCADOR_NC.test(f.valores[COL.COMENTARIOS]);
}
function ccfRelacionadoDe_(comentarios) {
  var m = String(comentarios || '').match(RX_MARCADOR_NC);
  return m ? m[1].trim() : null;
}
function normalizarNumeroNota_(entrada) {
  var limpio = String(entrada || '').trim().replace(/^(?:NC[-\s]?)+/i, '').trim();
  return limpio ? 'NC-' + limpio : '';
}

function serializarDetalle_(detalle) {
  return detalle.map(function (d) { return d.ccf + '|' + d.monto + '|' + d.estado; }).join('; ');
}
function parsearDetalle_(texto) {
  return String(texto || '').split(';')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; })
    .map(function (s) {
      var p = s.split('|').map(function (x) { return x.trim(); });
      return { ccf: p[0] || '', monto: Number(p[1]) || 0, estado: p[2] || '' };
    })
    .filter(function (d) { return d.ccf !== ''; });
}

// ───────────────────────────── Escritura DATOS FB ─────────────────────────────

/**
 * Escribe SOLO las columnas escribibles de una fila (rangos disjuntos
 * A–E, G–K, O, Q, R–T, AA). `r` es el registro ya armado.
 */
function escribirFila_(h, fila, r) {
  h.getRange(fila, 1, 1, 5).setValues([[r.codProv, r.razonSocial, r.nombreComercial, r.creditoDias, r.fechaEmision]]);
  h.getRange(fila, 7, 1, 5).setValues([[r.ccf, r.monto, r.abono, r.notaCredito, r.descuentoPorcentaje]]);
  h.getRange(fila, 15).setValue(r.fechaProgramacion || '');
  h.getRange(fila, 17).setValue(r.estatus);
  h.getRange(fila, 18, 1, 3).setValues([[r.comentarios || '', r.numeroCheque || '', r.fechaEntregaCheque || '']]);
  h.getRange(fila, 27).setValue(r.banco || '');
}

/** Última fila con COD_PROV o CCF (las fórmulas no cuentan). */
function ultimaFilaConDatos_(h) {
  var ultima = h.getLastRow();
  if (ultima < 2) return 1;
  var a = h.getRange(2, 1, ultima - 1, 1).getDisplayValues();
  var g = h.getRange(2, 7, ultima - 1, 1).getDisplayValues();
  for (var i = a.length - 1; i >= 0; i--) {
    if (String(a[i][0]).trim() !== '' || String(g[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

/** Valida los datos del formulario (mismas reglas del esquema original). */
function validarFactura_(d) {
  if (!d || typeof d !== 'object') throw errorDatos_('Datos de factura inválidos.');
  var errores = [];
  if (!d.proveedor || !d.proveedor.codProv) errores.push('Selecciona un proveedor del catálogo.');
  if (d.tipoCompra !== 'CREDITO' && d.tipoCompra !== 'CONTADO') errores.push('Elige Crédito o Contado.');
  var dias = Number(d.creditoDias);
  if (d.tipoCompra === 'CREDITO' && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) errores.push('Indica los días de crédito (1 a 365).');
  if (!esIso_(d.fechaEmision)) errores.push('Ingresa la fecha de emisión.');
  else if (d.fechaEmision > hoyIso_()) errores.push('La fecha de emisión no puede ser futura.');
  var ccf = String(d.ccf || '').trim();
  if (!ccf) errores.push('Ingresa el número de CCF.');
  if (ccf.length > 50) errores.push('CCF: máximo 50 caracteres.');
  var monto = Number(d.monto);
  if (!(isFinite(monto) && monto > 0)) errores.push('El monto debe ser mayor que 0.');
  var nc = Number(d.notaCredito || 0), pct = Number(d.descuentoPorcentaje || 0), usd = Number(d.descuentoDolares || 0);
  if (!(isFinite(nc) && nc >= 0)) errores.push('Nota de crédito: no puede ser negativa.');
  if (!(isFinite(pct) && pct >= 0 && pct <= 100)) errores.push('Descuento (%): entre 0 y 100.');
  if (!(isFinite(usd) && usd >= 0)) errores.push('Descuento ($): no puede ser negativo.');
  ['fechaProgramacion', 'fechaEntregaCheque'].forEach(function (k) {
    if (d[k] && !esIso_(d[k])) errores.push('Fecha inválida.');
  });
  if (errores.length) throw errorDatos_(errores[0]);
}

/** Datos validados → registro de la hoja (lógica de buildFacturaRegistro). */
function construirRegistro_(d, proveedor) {
  var esContado = d.tipoCompra === 'CONTADO';
  var monto = round2_(Number(d.monto));
  var pctIn = Number(d.descuentoPorcentaje || 0), usdIn = Number(d.descuentoDolares || 0);
  var pctHumano = pctIn > 0 ? round4_(pctIn) : usdIn > 0 ? round4_((usdIn / monto) * 100) : 0;
  var fechaProg = d.fechaProgramacion ? isoAHoja_(d.fechaProgramacion) : '';
  return {
    codProv: proveedor.codProv,
    razonSocial: proveedor.razonSocial,
    nombreComercial: proveedor.nombreComercial,
    creditoDias: esContado ? 0 : Number(d.creditoDias),
    fechaEmision: isoAHoja_(d.fechaEmision),
    ccf: texto_(d.ccf, 'CCF'),
    monto: monto,
    abono: esContado ? monto : 0,
    notaCredito: round2_(Number(d.notaCredito || 0)),
    descuentoPorcentaje: Math.round((pctHumano / 100) * 1000000) / 1000000,
    fechaProgramacion: esContado ? '' : fechaProg,
    estatus: esContado ? ESTATUS.PAGADA : fechaProg ? ESTATUS.PROGRAMADA : ESTATUS.PENDIENTE,
    comentarios: texto_(d.comentarios, 'Comentarios'),
    numeroCheque: referencia_(d.numeroCheque, 'N° de cheque'),
    fechaEntregaCheque: d.fechaEntregaCheque ? isoAHoja_(d.fechaEntregaCheque) : '',
    banco: texto_(d.banco, 'Banco')
  };
}

/** Anti-duplicados: COD_PROV + CCF (el CCF no es único entre proveedores). */
function verificarDuplicado_(codProv, ccf, fechaHoja, monto, ignorarFila) {
  var facturas = todasLasFacturas_();
  var mismo = false;
  for (var i = 0; i < facturas.length; i++) {
    var f = facturas[i];
    if (ignorarFila && f.fila === ignorarFila) continue;
    if (norm_(f.valores[COL.COD_PROV]) === norm_(codProv) && norm_(f.valores[COL.CCF]) === norm_(ccf)) {
      mismo = true;
      var m = num_(f.valores[COL.MONTO]);
      if (normFecha_(f.valores[COL.FECHA_EMISION]) === normFecha_(fechaHoja) && isFinite(m) && Math.abs(m - monto) < TOLERANCIA) {
        return 'FACTURA_COMPLETA';
      }
    }
  }
  return mismo ? 'CCF_PROVEEDOR' : null;
}

function proveedorVigente_(codProv) {
  var cat = getProveedores_();
  for (var i = 0; i < cat.length; i++) if (cat[i].codProv === codProv) return cat[i];
  return null;
}

function registrarFactura_(d) {
  validarFactura_(d);
  var prov = proveedorVigente_(d.proveedor.codProv);
  if (!prov) return { ok: false, error: 'El proveedor ' + d.proveedor.codProv + ' ya no existe en el catálogo PROVEEDORES. Operación cancelada.' };

  var reg = construirRegistro_(d, prov);
  var dup = verificarDuplicado_(prov.codProv, String(d.ccf).trim(), reg.fechaEmision, reg.monto, null);
  if (dup === 'FACTURA_COMPLETA') return { ok: false, error: 'Esta factura ya fue registrada anteriormente.' };
  if (dup === 'CCF_PROVEEDOR') return { ok: false, error: 'El CCF ' + String(d.ccf).trim() + ' ya está registrado para este proveedor (con otro monto o fecha). Verifica antes de guardar.' };

  var h = hoja_(TAB.datos);
  var ultima = ultimaFilaConDatos_(h);
  h.insertRowAfter(ultima); // hereda el formato de la fila de arriba (desplegable de ESTATUS)
  var fila = ultima + 1;
  escribirFila_(h, fila, reg);
  SpreadsheetApp.flush();
  return { ok: true, fila: fila, factura: leerFila_(fila) };
}

function editarFactura_(fila, d) {
  fila = Number(fila);
  if (!Number.isInteger(fila) || fila < 2) return { ok: false, error: 'Número de fila inválido.' };
  validarFactura_(d);
  var actual = leerFila_(fila);
  if (actual.valores.every(function (v) { return v.trim() === ''; })) return { ok: false, error: 'La fila ya no existe en DATOS FB. Recarga los datos.' };
  if (norm_(actual.valores[COL.CCF]) !== norm_(d.ccf)) return { ok: false, error: 'La fila cambió de lugar en la hoja (alguien insertó o movió filas). Recarga los datos e intenta de nuevo.' };

  var prov = proveedorVigente_(d.proveedor.codProv);
  if (!prov) return { ok: false, error: 'El proveedor ' + d.proveedor.codProv + ' no existe en el catálogo PROVEEDORES. Operación cancelada.' };

  var reg = construirRegistro_(d, prov);
  var dup = verificarDuplicado_(prov.codProv, String(d.ccf).trim(), reg.fechaEmision, reg.monto, fila);
  if (dup === 'FACTURA_COMPLETA') return { ok: false, error: 'Esta factura ya fue registrada anteriormente en otra fila.' };
  if (dup === 'CCF_PROVEEDOR') return { ok: false, error: 'El CCF ' + String(d.ccf).trim() + ' ya existe para este proveedor en otra fila. Verifica antes de guardar.' };

  escribirFila_(hoja_(TAB.datos), fila, reg);
  SpreadsheetApp.flush();
  return { ok: true, factura: leerFila_(fila) };
}

// ───────────────────────────── Notas de crédito ─────────────────────────────

var ESTADOS_CCF_NC = [ESTATUS.PROGRAMADA, ESTATUS.PROCESO_PAGO, ESTATUS.PENDIENTE, ESTATUS.ABONO];

/**
 * Aplica una nota de crédito a su CCF (v3.2): NO crea otra fila.
 * - Suma el monto (positivo) a la columna J "NOTA DE CRÉDITO ($)" del CCF;
 *   la hoja recalcula TOTAL y SALDO con sus fórmulas.
 * - Agrega a COMENTARIOS (col. R): "NC-#### (dd/mm/aaaa)" + comentario opcional.
 * - No cambia el ESTATUS ni los días de crédito del CCF.
 * - Si el monto es mayor que el saldo, pide confirmación (confirmarExceso).
 * - La misma NC no se puede aplicar dos veces al mismo proveedor.
 */
function aplicarNota_(d) {
  if (!d) return { ok: false, error: 'Datos inválidos.' };
  var numero = normalizarNumeroNota_(d.numeroNota);
  if (!numero || numero.length > 53) return { ok: false, error: 'Ingresa el número de la nota de crédito.' };
  if (!esIso_(d.fechaIngreso)) return { ok: false, error: 'Ingresa la fecha de ingreso.' };
  var monto = round2_(Number(d.monto));
  if (!(isFinite(monto) && monto > 0)) return { ok: false, error: 'El monto debe ser mayor que 0.' };
  var ccfRel = String(d.ccfRelacionado || '').trim(), codProv = String(d.codProv || '').trim();
  if (!ccfRel || !codProv) return { ok: false, error: 'Selecciona el documento al que se aplica la nota.' };
  var extra = texto_(d.comentarios, 'Comentarios').replace(/^'/, '');

  var filas = todasLasFacturas_();
  var ccf = null;
  var rxNum = new RegExp('(^|[^0-9A-Z])' + numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9A-Z])', 'i');
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    if (norm_(f.valores[COL.COD_PROV]) !== norm_(codProv)) continue;
    if (rxNum.test(f.valores[COL.COMENTARIOS]) || norm_(f.valores[COL.CCF]) === norm_(numero)) {
      return { ok: false, error: 'La ' + numero + ' ya está registrada en el documento ' + f.valores[COL.CCF].trim() + ' (fila ' + f.fila + ').' };
    }
    if (!ccf && !esNotaCredito_(f) && norm_(f.valores[COL.CCF]) === norm_(ccfRel)) ccf = f;
  }
  if (!ccf) return { ok: false, error: 'El documento relacionado no existe o no pertenece a ese proveedor.' };
  var estado = ccf.valores[COL.ESTADO].trim();
  if (ESTADOS_CCF_NC.indexOf(estado) === -1) return { ok: false, error: 'El documento está en estado "' + estado + '" y no admite notas de crédito.' };

  var saldo = num_(ccf.valores[COL.SALDO]);
  if (isFinite(saldo) && monto > saldo + TOLERANCIA && !d.confirmarExceso) {
    return { ok: false, exceso: true, saldo: saldo, error: 'El monto de la nota es mayor que el saldo del documento.' };
  }

  var ncActual = num_(ccf.valores[COL.NOTA_CREDITO]);
  var nuevaNc = round2_((isFinite(ncActual) ? ncActual : 0) + monto);
  var marca = numero + ' (' + isoAHoja_(d.fechaIngreso) + ')' + (extra ? ' ' + extra : '');
  var comentAnt = ccf.valores[COL.COMENTARIOS].trim();
  var coment = comentAnt ? comentAnt + ' | ' + marca : marca;
  if (coment.length > 1000) return { ok: false, error: 'Los comentarios del documento quedarían demasiado largos.' };

  var h = hoja_(TAB.datos);
  // Volver a confirmar que la fila sigue siendo el mismo documento antes de escribir
  var actual = leerFila_(ccf.fila);
  if (norm_(actual.valores[COL.CCF]) !== norm_(ccfRel) || norm_(actual.valores[COL.COD_PROV]) !== norm_(codProv)) {
    return { ok: false, error: 'La hoja cambió mientras se guardaba. Intenta de nuevo.' };
  }
  h.getRange(ccf.fila, 10).setValue(nuevaNc);                       // J — NOTA DE CRÉDITO ($)
  h.getRange(ccf.fila, 18).setValue(/^[=+]/.test(coment) ? "'" + coment : coment); // R — COMENTARIOS
  SpreadsheetApp.flush();
  return { ok: true, fila: ccf.fila, factura: leerFila_(ccf.fila), numero: numero, notaTotal: nuevaNc };
}

/** Edición de una NC: SOLO número (col. G) y días de crédito (col. D). */
function editarNota_(d) {
  var fila = Number(d && d.fila);
  if (!Number.isInteger(fila) || fila < 2) return { ok: false, error: 'Fila inválida.' };
  var numero = normalizarNumeroNota_(d.numeroNota);
  if (!numero) return { ok: false, error: 'Ingresa el número de la nota de crédito.' };
  var dias = Number(d.creditoDias);
  if (!(Number.isInteger(dias) && dias >= 0)) return { ok: false, error: 'Los días de crédito deben ser un entero no negativo.' };

  var actual = leerFila_(fila);
  if (actual.valores.every(function (x) { return x.trim() === ''; })) return { ok: false, error: 'La fila indicada no existe en DATOS FB.' };
  if (!esNotaCredito_(actual)) return { ok: false, error: 'La fila indicada no es una nota de crédito (la hoja pudo cambiar; recarga los datos).' };
  if (d.numeroActual && norm_(actual.valores[COL.CCF]) !== norm_(d.numeroActual)) return { ok: false, error: 'La fila cambió de lugar en la hoja. Recarga los datos e intenta de nuevo.' };

  var h = hoja_(TAB.datos);
  h.getRange(fila, 4).setValue(dias);
  h.getRange(fila, 7).setValue(numero);
  SpreadsheetApp.flush();
  return { ok: true, factura: leerFila_(fila) };
}

// ───────────────────────────── Pagos ─────────────────────────────

function comentarioDelPago_(metodo, comentarioUsuario) {
  var auto = metodo === 'TRANSFERENCIA' ? 'Pago realizado por transferencia bancaria.'
    : metodo === 'EFECTIVO' ? 'Pago realizado en efectivo.' : '';
  return [String(comentarioUsuario || '').trim(), auto].filter(function (x) { return x; }).join(' | ');
}

function registrarPago_(p) {
  if (!p || METODOS_PAGO.indexOf(p.metodoPago) === -1) return { ok: false, error: 'Elige el método de pago.' };
  if (!esIso_(p.fechaPago)) return { ok: false, error: 'Ingresa la fecha del pago.' };
  if (!Array.isArray(p.facturas) || p.facturas.length === 0) return { ok: false, error: 'Selecciona al menos una factura.' };
  var esEfectivo = p.metodoPago === 'EFECTIVO';
  var banco = texto_(p.banco, 'Banco'), referencia = referencia_(p.referencia, 'Referencia');
  if (!esEfectivo && !banco) return { ok: false, error: 'Indica el banco.' };
  if (!esEfectivo && !referencia) return { ok: false, error: p.metodoPago === 'CHEQUE' ? 'Indica el número de cheque.' : 'Indica el número de referencia.' };
  texto_(p.comentarios, 'Comentarios');

  // Releer cada fila (fuente de verdad) y validar estado.
  var actuales = {};
  for (var i = 0; i < p.facturas.length; i++) {
    var it = p.facturas[i];
    var fila = Number(it.fila);
    if (!Number.isInteger(fila) || fila < 2) return { ok: false, error: 'Fila inválida.' };
    var a = leerFila_(fila);
    if (a.valores.every(function (x) { return x.trim() === ''; })) return { ok: false, error: 'La fila ' + fila + ' no existe en DATOS FB.' };
    if (it.ccf && norm_(a.valores[COL.CCF]) !== norm_(it.ccf)) return { ok: false, error: 'La hoja cambió (el documento ' + it.ccf + ' ya no está en la fila ' + fila + '). Recarga los datos e intenta de nuevo.' };
    var estado = a.valores[COL.ESTADO].trim();
    var admite = it.esNotaCredito
      ? (estado === ESTATUS.PENDIENTE || estado === ESTATUS.DISPONIBLE)
      : (estado !== ESTATUS.PAGADA && estado !== ESTATUS.INACTIVA && estado !== ESTATUS.DISPONIBLE && estado !== ESTATUS.APLICADA);
    if (!admite) return { ok: false, error: 'El documento ' + a.valores[COL.CCF] + ' está en estado "' + estado + '" y no admite esta operación.' };
    actuales[fila] = a;
  }

  var provs = {};
  p.facturas.forEach(function (it) { provs[norm_(actuales[it.fila].valores[COL.COD_PROV])] = 1; });
  if (Object.keys(provs).length > 1) return { ok: false, error: 'No es posible registrar un mismo pago para facturas de diferentes proveedores.' };

  var itemsF = p.facturas.filter(function (it) { return !it.esNotaCredito; });
  var itemsN = p.facturas.filter(function (it) { return it.esNotaCredito; });
  if (itemsF.length === 0) return { ok: false, error: 'El pago debe incluir al menos una factura.' };

  var sumaF = 0;
  for (var k = 0; k < itemsF.length; k++) {
    var x = itemsF[k], monto = Number(x.montoAPagar);
    var saldo = num_(actuales[x.fila].valores[COL.SALDO]);
    if (!(isFinite(monto) && monto > 0)) return { ok: false, error: 'No se permiten pagos negativos ni en cero.' };
    if (!(isFinite(saldo) && saldo > TOLERANCIA)) return { ok: false, error: 'La factura ' + actuales[x.fila].valores[COL.CCF] + ' no tiene saldo pendiente.' };
    if (monto > saldo + TOLERANCIA) return { ok: false, error: 'El monto pagado no puede ser mayor al saldo pendiente (' + actuales[x.fila].valores[COL.CCF] + ').' };
    sumaF += monto;
  }
  var saldosN = itemsN.map(function (n) { var s = num_(actuales[n.fila].valores[COL.SALDO]); return isFinite(s) ? s : 0; });
  var totalNeto = round2_(sumaF + saldosN.reduce(function (s, v) { return s + v; }, 0));
  if (totalNeto <= 0) return { ok: false, error: 'El total a pagar debe ser mayor que cero.' };

  var fechaPago = isoAHoja_(p.fechaPago);
  var comentarioPago = comentarioDelPago_(p.metodoPago, p.comentarios);
  var combinar = function (actual) {
    return comentarioPago ? (actual ? actual + ' | ' + comentarioPago : comentarioPago) : actual;
  };

  // Solo ESTATUS (Q), COMENTARIOS (R), N° CHEQUE (S) y FECHA ENTREGA (T).
  var h = hoja_(TAB.datos);
  itemsF.forEach(function (it) {
    var a = actuales[it.fila];
    h.getRange(it.fila, 17).setValue(ESTATUS.PAGADA);
    h.getRange(it.fila, 18, 1, 3).setValues([[combinar(a.valores[COL.COMENTARIOS].trim()), esEfectivo ? referencia_(a.valores[COL.CHEQUE], 'N° de cheque') : referencia, fechaPago]]);
  });
  itemsN.forEach(function (it) {
    var a = actuales[it.fila];
    h.getRange(it.fila, 17).setValue(ESTATUS.APLICADA);
    h.getRange(it.fila, 18, 1, 3).setValues([[combinar(a.valores[COL.COMENTARIOS].trim()), referencia_(a.valores[COL.CHEQUE], 'N° de cheque'), fechaPago]]);
  });

  // Una fila en PAGOS por la operación completa.
  var primera = actuales[p.facturas[0].fila];
  var tz = Session.getScriptTimeZone();
  var ahora = new Date();
  var detalle = itemsF.map(function (it) { return { ccf: actuales[it.fila].valores[COL.CCF].trim(), monto: Number(it.montoAPagar), estado: ESTATUS.PAGADA }; })
    .concat(itemsN.map(function (it, i) { return { ccf: actuales[it.fila].valores[COL.CCF].trim(), monto: saldosN[i], estado: ESTATUS.APLICADA }; }));
  hojaPagos_().appendRow([
    'PAGO-' + Utilities.formatDate(ahora, tz, 'yyyyMMdd-HHmmss'),
    Utilities.formatDate(ahora, tz, 'dd/MM/yyyy'),
    primera.valores[COL.RAZON_SOCIAL].trim() || primera.valores[COL.NOMBRE_COMERCIAL].trim(),
    primera.valores[COL.COD_PROV].trim(),
    p.metodoPago,
    esEfectivo ? '' : banco,
    esEfectivo ? '' : referencia,
    p.facturas.length,
    totalNeto,
    comentarioPago,
    serializarDetalle_(detalle)
  ]);
  SpreadsheetApp.flush();

  return {
    ok: true,
    montoTotal: totalNeto,
    facturas: p.facturas.map(function (it) { return leerFila_(Number(it.fila)); }),
    pagos: todosLosPagos_()
  };
}

/** Pestaña PAGOS; si no existe se crea con sus encabezados. */
function hojaPagos_() {
  var libro = libro_();
  var h = libro.getSheetByName(TAB.pagos);
  if (!h) {
    h = libro.insertSheet(TAB.pagos);
    h.getRange(1, 1, 1, PAGOS_COLUMNS.length).setValues([PAGOS_COLUMNS]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

// ───────────────────────────── Prueba manual ─────────────────────────────

/** Ejecutar desde el editor: confirma que lee las 3 pestañas (no escribe nada). */
function probarLectura() {
  var t = accionTodo_();
  Logger.log('Proveedores: %s · Facturas: %s · Pagos: %s', t.proveedores.length, t.facturas.length, t.pagos.length);
}
