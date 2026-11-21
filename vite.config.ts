import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Power Apps Code Apps require a relative base path so the bundled assets
// resolve correctly when the app is hosted inside the Power Apps player,
// and the dev server port must match `localAppUrl` in power.config.json.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '::',
    port: 5173,
  },
})
