import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { fileURLToPath, URL } from 'node:url'

// Popup (React app) and background service worker are built as separate
// entry points. `public/` is copied verbatim into `dist/` on build.
export default defineConfig({
  // Relative paths: chrome-extension pages resolve against the extension root,
  // and relative URLs stay correct regardless of the generated extension id.
  base: './',
  // near-api-js/seed-phrase pulls in bip39-light etc. which import Node
  // built-ins; polyfill only the ones actually needed for the browser.
  plugins: [
    react(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'events', 'util', 'string_decoder', 'process'],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL('./index.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background/index.ts', import.meta.url)),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
