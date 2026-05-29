import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const REPO = 'golf-pool'

export default defineConfig(({ mode }) => {
  const base = mode === 'production' ? `/${REPO}/` : '/'
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Golf Pool',
          short_name: 'Pool',
          description: 'Tournament golf pool with friends',
          theme_color: '#14532d',
          background_color: '#0b1220',
          display: 'standalone',
          start_url: base,
          scope: base,
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
  }
})
