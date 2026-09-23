import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    /*
     * App instalable (PWA).
     *
     * Es la MISMA app de siempre: se sube a Vercel igual y no hay nada que
     * volver a generar ni tienda que apruebe. Lo que agrega es que el
     * consultorio pueda ponerla en la pantalla de inicio de la tablet y abrirla
     * a pantalla completa, sin la barra del navegador —que en una tablet se
     * come una fila entera de la agenda.
     *
     * `registerType: 'prompt'` y no 'autoUpdate' a propósito: la app guarda una
     * copia de sí misma para abrir rápido, así que una versión nueva recién
     * entra al reabrirla. Con 'autoUpdate' eso pasa sin avisar y en medio del
     * uso —cambiaría la pantalla debajo de la mano de alguien que está
     * cobrando—. Acá avisamos y que decida (ver ActualizacionPWA).
     */
    VitePWA({
      registerType: 'prompt',
      // Los íconos y el favicon ya están en public/ y no los toca el bundle.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'SOI — Gestión odontológica',
        // Lo que entra debajo del ícono en la pantalla de inicio: doce
        // caracteres es lo que muestra un iPhone antes de cortar con puntos.
        short_name: 'SOI',
        description: 'La agenda, la ficha y las cuentas de tu consultorio, en un solo lugar.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // El crema del papel: es el fondo que se ve en el arranque, antes de
        // que la app pinte nada. En blanco pega un fogonazo.
        background_color: '#FBF7EE',
        // Azul tinta. Es fijo aunque cada consultorio recolorea su marca: el
        // manifiesto se genera una sola vez, en build, y no sabe de clínicas.
        theme_color: '#2C4A9E',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          // Android le aplica su propia máscara (círculo, gota, cuadrado) y
          // recorta hasta un 20% del borde: este va a sangre y con el diente
          // más chico para que nunca le corte una punta.
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo el armazón de la app. Las fotos de la ayuda (.jpg) quedan
        // afuera: son megas que nadie mira dos veces.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // SPA: cualquier dirección devuelve el index y el ruteo lo hace React.
        navigateFallback: '/index.html',
        // Nada de la API se guarda. Es otro dominio, así que ya quedaría afuera,
        // pero conviene que esté dicho: una agenda servida de una copia vieja es
        // peor que una agenda que no carga.
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Apagado en desarrollo: un service worker sirviendo copias viejas
        // mientras se edita es la forma más rápida de perder una tarde.
        enabled: false,
      },
    }),
  ],
})
