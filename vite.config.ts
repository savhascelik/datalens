import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  // react-draggable (react-grid-layout bağımlılığı) log.ts içinde process.env.DRAGGABLE_DEBUG
  // okuyor. Tarayıcıda `process` tanımsız olduğu için sürükleme başlarken hata veriyordu.
  // Bu define, ilgili referansları derleme sırasında güvenli değerlerle değiştirir.
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env': '{}',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Data Lens AI',
        short_name: 'DataLens',
        description: 'AI-Powered Local Data Analytics & Interactive Dashboards',
        theme_color: '#090e1b',
        background_color: '#090e1b',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // DuckDB wasm files can be large, so we increase the size limit for caching
        maximumFileSizeToCacheInBytes: 45 * 1024 * 1024,
      }
    })
  ],
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  server: {
    port: 5174,
  },
  preview: {
    port: 4174,
  },
}))
