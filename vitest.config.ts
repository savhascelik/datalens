import { defineConfig } from 'vitest/config'

// Test-özel yapılandırma. PWA/DuckDB gibi ağır eklentileri yüklemeden,
// saf mantık modüllerini (registry, validate, budgetGuard, agent) test eder.
// jsdom ortamı localStorage/window sağlar (i18n init'i buna dayanır).
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // DuckDB wasm importları test kapsamı dışında; yalnızca saf modülleri test ediyoruz.
    exclude: ['node_modules', 'dist'],
  },
})
