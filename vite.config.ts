import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // /api/* is a Vercel serverless function, which `vite dev` doesn't
    // run - so locally the FantasyPros rankings just 404'd and the whole
    // page fell back to Sleeper's own ranking, making expert-data
    // behaviour impossible to check without deploying. Proxy it to the
    // deployed function instead. Read-only and already public; the API
    // key stays server-side there, never here.
    proxy: {
      '/api': {
        target: 'https://www.bbbgleague.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
