import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  const smartOltRawUrl = env.SMARTOLT_GET_ODBS_URL || 'https://geonet-cl.smartolt.com/api/system/get_odbs'
  const smartOltToken = env.SMARTOLT_X_TOKEN || ''

  let smartOltTarget = 'https://geonet-cl.smartolt.com'
  let smartOltPath = '/api/system/get_odbs'

  try {
    const parsed = new URL(smartOltRawUrl)
    smartOltTarget = `${parsed.protocol}//${parsed.host}`
    smartOltPath = `${parsed.pathname}${parsed.search}`
  } catch {
    // fallback defaults
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api/smartolt/odbs': {
          target: smartOltTarget,
          changeOrigin: true,
          secure: true,
          rewrite: () => smartOltPath,
          headers: smartOltToken ? { 'X-Token': smartOltToken } : {},
        },
      },
    },
  }
})
