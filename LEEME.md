# FACTURAS FB — app instalable (GitHub Pages + Google Sheets)

Registro de facturas y notas de crédito, Historial con edición, Dashboard, Gestión de pagos y Consulta de pagos.
Escribe en la misma hoja de siempre: **DATOS FB**, **PAGOS** y **PROVEEDORES** (esta última solo se lee).

## Cómo está armada

- **Link de la app**: https://videsjose12345-ai.github.io/facturas-fb-app/ (repositorio `videsjose12345-ai/facturas-fb-app`, GitHub Pages desde `main`).
- **El Apps Script** "FACTURAS FB API" es un proyecto **aparte** en script.google.com (no está dentro de la hoja), porque la hoja ya tiene su propio script con `doGet`/`doPost` que usa otra app. Así no se toca.
  - Propiedad `SHEET_ID`: la hoja a la que escribe.
  - Propiedad `CLAVE_APP`: la clave de acceso. Nunca va en GitHub.
  - Se ejecuta con tu cuenta de Google; ya no se necesita la cuenta de servicio.
- Después de 10 intentos con la clave equivocada, el acceso se bloquea 10 minutos.

## Reglas que respeta (las mismas de la app anterior)

- En DATOS FB solo escribe las 16 columnas de datos: A–E, G–K, O, Q, R–T y AA.
- Las 11 columnas con ARRAYFORMULA (F, L, M, N, P, U, V, W, X, Y, Z) **nunca** se tocan.
- No borra filas.
- La NC se inserta debajo de su CCF (o debajo de su última NC).
- Al pagar solo cambia ESTATUS, COMENTARIOS, N° CHEQUE y FECHA DE ENTREGA. Cada pago agrega una fila en PAGOS; la pestaña se crea sola si no existe.
- Antes de editar o pagar, revisa que la fila siga siendo el mismo CCF. Si alguien insertó filas, avisa que recargues en vez de escribir en la fila equivocada.

## Estado

- **En la hoja real** (`SHEET_ID` = PROGRAMACION DE FACTURAS CXP) desde el 17/11/2026. La copia de prueba quedó aparte, con filas PRUEBA.
- Versión de la app: 3.2.0 (menú lateral, Registro en una pantalla, NC aplicada al documento).

## Instalación (ya hecha)

1. Proyecto Apps Script "FACTURAS FB API" con `Code.gs`, zona horaria El Salvador y propiedades `SHEET_ID` y `CLAVE_APP`.
2. Implementado como **App web** (Ejecutar como: Yo · Acceso: Cualquiera); su URL `/exec` está en `js/config.js`.
3. Repositorio público en GitHub con Pages activado.

**Para pasar de la copia de prueba a la hoja real** solo se cambia el valor de `SHEET_ID` (Configuración del proyecto → Propiedades) por el ID de la hoja real. No hace falta volver a implementar.

### Instalar en cada equipo

- **Computadora (Chrome / Edge)**: botón **⬇ Instalar** en la app, o el ícono de instalar en la barra de direcciones.
- **Android (Chrome)**: botón **⬇ Instalar**, o menú ⋮ → *Instalar app*.
- **iPhone (Safari)**: Compartir → *Agregar a pantalla de inicio*.

## Cambios futuros

- **Cambiar el Apps Script**: pega el código nuevo y luego ve a *Implementar → Administrar implementaciones* → ✏️ → Versión: *Nueva versión* → *Implementar*. Así la URL no cambia.
- **Cambiar la página**: sube los archivos a GitHub. La app instalada se actualiza sola la próxima vez que se abre con internet.
- **Cambiar la clave**: edita `CLAVE_APP` en Propiedades del script. Todos los equipos te pedirán la clave nueva.
