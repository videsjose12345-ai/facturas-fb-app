// Configuración de FACTURAS FB (GitHub Pages).
// API_URL: la URL de la "Aplicación web" del Apps Script de la hoja
// (termina en /exec). No es secreta: sin la clave de acceso no lee ni escribe nada.
window.FFB_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzI5df7YrsvEYCL2DnFBzG-hMLH_EEwQ7P2BUiulIbtReCYFx2FNMrA05XnCqfo-9Wi/exec',
  // Cada cuántos segundos se actualiza sola desde la hoja (mínimo 15).
  REFRESCO_SEG: 30,
};
