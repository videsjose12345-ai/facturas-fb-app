# FACTURAS FB — Changelog

## 3.0.0 · App instalable en GitHub Pages (actual) — 17/11/2026

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
