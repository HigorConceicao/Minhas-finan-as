import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build da demonstração: um único JS e CSS, depois embutidos num HTML só (scripts/montar-demo.mjs)
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: false,
    rollupOptions: { input: 'demo.html', output: { inlineDynamicImports: true } },
  },
});
