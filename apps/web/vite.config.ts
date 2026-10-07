import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The desktop shell expects 5173; a preview that cannot have it passes another port in PORT.
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
});
