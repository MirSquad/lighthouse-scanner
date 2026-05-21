import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/mcp-server.ts',
      name: 'LighthouseScannerAngie',
      fileName: () => 'mcp-server.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: true,
    target: 'es2018',
  },
});
