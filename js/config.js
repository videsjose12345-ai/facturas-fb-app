// Configuración de FACTURAS FB (GitHub Pages).
// API_URL: la URL de la "Aplicación web" del Apps Script de la hoja
// (termina en /exec). No es secreta: sin la clave de acceso no lee ni escribe nada.
window.FFB_CONFIG = {
  API_URL: 'PEGA_AQUI_LA_URL_DEL_APPS_SCRIPT',
  // Cada cuántos segundos se actualiza sola desde la hoja (mínimo 15).
  REFRESCO_SEG: 30,
};
