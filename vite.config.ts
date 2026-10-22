import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Published under /vurb-finance/ (GitHub Pages project path).
export default defineConfig({
  base: '/vurb-finance/',
  plugins: [react()],
})
