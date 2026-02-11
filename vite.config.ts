import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Ensure we use process.cwd() for loading env files. 
  // Cast to any to avoid "Property 'cwd' does not exist on type 'Process'" error if node types are not strictly configured.
  const cwd = (process as any).cwd();
  const env = loadEnv(mode, cwd, '');
  
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Polyfill process for libraries that might expect it
      'process.env': JSON.stringify(env)
    },
    server: {
      host: true
    }
  };
});