# FACTURAS FB — app instalable (GitHub Pages + Google Sheets)

Registro de facturas y notas de crédito, Historial con edición, Dashboard, Gestión de pagos y Consulta de pagos.
Escribe en la misma hoja de siempre: **DATOS FB**, **PAGOS** y **PROVEEDORES** (esta última solo se lee).

## Cómo está armada

- **La página** (esta carpeta) se publica en GitHub Pages. Es un link que se abre en cualquier celular o computadora y se puede instalar como app.
- **El Apps Script** (`apps-script/Code.gs`) va pegado dentro de la hoja de cálculo. Es el que lee y escribe en la hoja.
- Ya **no se necesita la cuenta de servicio** ni su llave privada. La página no guarda ninguna credencial.
- Para entrar se pide una **clave de acceso**. La clave se guarda en el Apps Script (Propiedades del script → `CLAVE_APP`), nunca en GitHub.
- Después de 10 intentos con la clave equivocada, el acceso se bloquea 10 minutos.

## Reglas que respeta (las mismas de la app anterior)

- En DATOS FB solo escribe las 16 columnas de datos: A–E, G–K, O, Q, R–T y AA.
- Las 11 columnas con ARRAYFORMULA (F, L, M, N, P, U, V, W, X, Y, Z) **nunca** se tocan.
- No borra filas.
- La NC se inserta debajo de su CCF (o debajo de su última NC).
- Al pagar solo cambia ESTATUS, COMENTARIOS, N° CHEQUE y FECHA DE ENTREGA. Cada pago agrega una fila en PAGOS; la pestaña se crea sola si no existe.
- Antes de editar o pagar, revisa que la fila siga siendo el mismo CCF. Si alguien insertó filas, avisa que recargues en vez de escribir en la fila equivocada.

## Instalación (una sola vez)

### 1. Apps Script en la hoja

> **Recomendado:** prueba primero en una **copia** de la hoja (Archivo → Hacer una copia). Cuando todo funcione, repite estos pasos en la hoja real.

1. Abre la hoja → **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega todo el contenido de `apps-script/Code.gs`. Guarda.
3. Configura el proyecto (⚙️ **Configuración del proyecto**):
   - **Zona horaria**: (GMT-06:00) El Salvador.
   - En **Propiedades del script** → **Agregar propiedad**, con nombre `CLAVE_APP` y como valor una clave fuerte (por ejemplo, 12 o más letras y números).
4. Selecciona la función `probarLectura` y dale **Ejecutar**.
   - Google pedirá permisos: elige tu cuenta → *Avanzado* → *Ir al proyecto* → *Permitir*.
   - En el registro debe salir cuántos proveedores, facturas y pagos leyó.
5. Ve a **Implementar → Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**.
6. Dale **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

### 2. Pegar la URL

Abre `js/config.js` y reemplaza `PEGA_AQUI_LA_URL_DEL_APPS_SCRIPT` por la URL `/exec`.

### 3. Subir a GitHub y activar Pages

1. En GitHub crea un repositorio nuevo, por ejemplo **`facturas-fb-app`**.
   - GitHub Pages gratis necesita que el repositorio sea **público**. No contiene claves, así que no hay riesgo.
2. Sube **todo el contenido de esta carpeta**: *Add file → Upload files* → arrastra los archivos y carpetas → *Commit changes*.
3. Ve a **Settings → Pages**:
   - Source: *Deploy from a branch*.
   - Branch: `main`, carpeta `/ (root)` → *Save*.
4. En 1–2 minutos queda el link: `https://videsjose12345-ai.github.io/facturas-fb-app/`

### 4. Instalar

- **Computadora (Chrome / Edge)**: botón **⬇ Instalar** en la app, o el ícono de instalar en la barra de direcciones.
- **Android (Chrome)**: botón **⬇ Instalar**, o menú ⋮ → *Instalar app*.
- **iPhone (Safari)**: Compartir → *Agregar a pantalla de inicio*.

## Cambios futuros

- **Cambiar el Apps Script**: pega el código nuevo y luego ve a *Implementar → Administrar implementaciones* → ✏️ → Versión: *Nueva versión* → *Implementar*. Así la URL no cambia.
- **Cambiar la página**: sube los archivos a GitHub. La app instalada se actualiza sola la próxima vez que se abre con internet.
- **Cambiar la clave**: edita `CLAVE_APP` en Propiedades del script. Todos los equipos te pedirán la clave nueva.
