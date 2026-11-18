# FACTURAS FB — Changelog

## 3.2.1 · Historial y Gestión de pagos sin barra horizontal (actual) — 18/11/2026

- **Historial**: la tabla se adapta al ancho de la pantalla y ya no sale la barra para desplazarse a la derecha. Las columnas menos usadas pasan como texto pequeño debajo de otra:
  - menos de 1600 px: **Código** va debajo del proveedor;
  - menos de 1366 px: **Crédito** va debajo del vencimiento ("30 días");
  - menos de 1240 px: **Fecha de emisión** va debajo del CCF y **Monto** se oculta (se ve en 👁);
  - menos de 1024 px: **Total** va debajo del saldo.
- **Gestión de pagos**: en pantallas medianas, la **Emisión** va debajo del CCF y el **Abono** debajo del saldo.
- En celular (menos de 761 px) siguen las tarjetas con todos los datos.
- Probado de 320 a 1960 px de ancho, de 10 en 10 px en Historial y de 20 en 20 px en Pagos: ninguna tabla desborda. Registro y Consulta de pagos ya cabían.
- Solo cambia la página (`css/app.css`, `js/historial.js`, `js/pagos.js`, `sw.js`); el Apps Script no cambia.

## 3.2.0 · La nota de crédito se aplica al documento — 17/11/2026

- La nota de crédito **ya no crea otra línea** en DATOS FB. Ahora se aplica al documento (CCF) relacionado:
  - el monto (positivo) **se suma** a la columna J **NOTA DE CRÉDITO ($)** del CCF; la hoja recalcula TOTAL y SALDO con sus fórmulas;
  - en **COMENTARIOS** se agrega "NC-#### (dd/mm/aaaa)" con la fecha de ingreso, más el comentario opcional, separado con " | " si ya había algo.
- **No cambia el estado** del documento ni pide días de crédito.
- **La fecha de ingreso** solo queda dentro del comentario; no va a otra columna.
- **Validaciones**:
  - la misma NC no se puede aplicar dos veces al mismo proveedor;
  - solo se aplica a documentos en estado 1–4.
- **Monto mayor que el saldo**: avisa con el saldo resultante y, si confirmas, la aplica aunque el saldo quede negativo.
- **Vista previa** antes de aplicar: "Nota de crédito $0.00 → $67.00 · Saldo $500.00 → $433.00".
- Las NC que ya están como línea propia en la hoja (formato anterior) se siguen viendo en Historial y se pueden aplicar en Gestión de pagos como antes.
- Apps Script versión 3.2.0: la acción `aplicarNota` reemplaza a `registrarNota`.

## 3.1.1 · Registro en una sola pantalla y responsive — 17/11/2026

- **Registro acoplado a la pantalla**: en computadora el formulario cabe completo sin bajar, incluso en ventanas bajas (1366×543).
  - Arriba van los totales del día y, al lado, el tipo de documento (CCF / Nota de crédito).
  - Abajo, en 3 columnas: Datos de la factura | Ajustes del monto | Programación y pago (siempre abierta). Debajo, el total y "Guardar factura".
  - La nota de crédito va en 2 columnas: CCF relacionado | datos de la nota.
- **Responsive**:
  - Tablets y ventanas medianas (700–1099 px): el formulario va en 2 columnas y también cabe sin bajar (1024×768 y 768×1024).
  - Celular: el total y el botón "Guardar factura" quedan fijos abajo, siempre a mano.
  - Pantallas muy grandes (≥1600 px): el contenido se ensancha.
  - Probado en 1920×1080, 1366×768, 1366×543, 1280×720, 1024×768, 768×1024, 390×844 y 320×568, sin desbordes.
- Se borró `js/dashboard.js` del repositorio.

## 3.1.0 · Diseño nuevo: menú lateral, fondo de marca y logito — 17/11/2026

Combinación elegida: **Interfaz C + Fondo 2 + Logo 2**.
- **Interfaz C · Menú lateral**: barra azul marino (#043544) a la izquierda, con el logito, los módulos y, abajo, Instalar y Salir. El contenido es claro: tarjetas blancas, KPIs con borde de color y botones azul (#0B8199). En celular el menú va abajo, en azul marino, con la línea verde en el módulo activo.
- **Fondo 2 · Degradado de marca**: azul muy suave que pasa a verde muy suave.
- **Logo 2 · Logito + "FACTURAS FB"**: solo el símbolo del logo original (círculo verde y azul con la cruz), recortado con fondo transparente (`img/logito.png`). Va en el menú, la barra del celular y la pantalla de entrada. Los íconos de la app instalada, la pestaña del navegador y el iPhone también son el logito.
- **Se quitó el módulo Dashboard.** Quedan Registro, Historial, Gestión de pagos y Consulta de pagos. `js/dashboard.js` ya no se carga.
- Los estados, avisos, ventanas y mensajes se rehicieron en tema claro.

## 3.0.1 · Publicada y probada — 17/11/2026

- Publicada en https://videsjose12345-ai.github.io/facturas-fb-app/ con el Apps Script aparte "FACTURAS FB API".
- **Dashboard**:
  - "Total pendiente" ahora suma solo el SALDO de lo que no está pagado;
  - "Total pagado" suma el TOTAL de las facturas pagadas.
  - Antes, desde que el pago dejó de escribir el ABONO, las facturas pagadas seguían contando como pendientes: daba $2.19 millones pendientes.
- La app instalada revisa siempre si hay una versión nueva en GitHub. Antes podía mostrar una versión vieja hasta 10 minutos.

## 3.0.0 · App instalable en GitHub Pages — 17/11/2026

- Antes la app era de Next.js con cuenta de servicio de Google. Ahora es una página estática (HTML/JS) que se publica en **GitHub Pages**: un link que se abre desde cualquier celular o computadora.
- Es **instalable** (PWA):
  - tiene manifest, íconos PNG (normal, *maskable* y Apple) y un *service worker*;
  - abre aunque no haya internet; los datos siempre se leen en vivo;
  - trae el botón **⬇ Instalar** y, en iPhone, las instrucciones.
- Backend nuevo: **Google Apps Script** pegado en la hoja (`apps-script/Code.gs`).
  - Hace lo mismo que la app anterior: anti-duplicados por proveedor + CCF, proveedor vigente, NC debajo de su CCF, pagos por proveedor y hoja PAGOS.
  - Escribe solo las 16 columnas de datos; nunca las de ARRAYFORMULA ni borra filas.
  - Escrituras de una en una (bloqueo), para que dos equipos no choquen.
- **Acceso con clave**:
  - la clave se guarda en Propiedades del script (`CLAVE_APP`);
  - "Recordar en este equipo" y botón **Salir**;
  - bloqueo de 10 minutos tras 10 intentos fallidos.
- Se mantienen los 5 módulos: Registro (CCF y NC), Historial con edición, Dashboard, Gestión de pagos y Consulta de pagos. También el respaldo CSV del día.
- **En vivo**: se actualiza sola cada 30 s y al volver a la app. Ya no hay botón Actualizar.
- **Diseño para celular**:
  - menú abajo;
  - tablas como tarjetas;
  - ventanas tipo hoja desde abajo;
  - campos de 16 px para que el iPhone no haga zoom.
- **Seguridad extra**:
  - antes de editar o pagar, revisa que la fila siga siendo el mismo CCF (si alguien insertó una NC, las filas se corren);
  - un texto que empieza con "=" no se convierte en fórmula;
  - el N° de cheque o referencia conserva los ceros a la izquierda (00123).
