/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const envCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
let commitHash = envCommit ? envCommit.slice(0, 7) : '';
if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {}
}
if (!commitHash) {
  commitHash = 'dev';
}

export default defineConfig(() => {
  const rootDir = process.cwd();
  return {
    root: rootDir,
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(commitHash),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: 'https://wthabguvueewgtabjsdo.supabase.co/functions/v1/starq-api',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
            });
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      pool: 'threads',
      setupFiles: [path.resolve(rootDir, 'src/test/setup.ts')],
      watch: false,
    },
  };
});
