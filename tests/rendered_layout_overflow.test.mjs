import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { chromium } from '../web/node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT, 'web', 'dist');

// Find a usable browser binary on Windows/Linux
function getBrowserOptions() {
  const possiblePaths = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return { executablePath: p, headless: true };
    }
  }

  // Fallback to chrome or msedge channel
  return { channel: 'chrome', headless: true };
}

// Simple static SPA server for web/dist
function startServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    let filePath = path.join(DIST_DIR, reqPath === '/' ? 'index.html' : reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

describe('SERP Material 3 Rendered Browser Layout & Viewport Overflow Suite', () => {
  let serverInstance;
  let port;
  let browser;

  before(async () => {
    assert.ok(
      fs.existsSync(path.join(DIST_DIR, 'index.html')),
      'web/dist must exist. Run npm run build --prefix web first.'
    );

    const s = await startServer();
    serverInstance = s.server;
    port = s.port;

    const opts = getBrowserOptions();
    browser = await chromium.launch(opts);
  });

  after(async () => {
    if (browser) await browser.close();
    if (serverInstance) serverInstance.close();
  });

  const VIEWPORTS = [
    { name: 'Compact (360x800)', width: 360, height: 800 },
    { name: 'Medium lower bound (600x900)', width: 600, height: 900 },
    { name: 'Medium tablet (768x1024)', width: 768, height: 1024 },
    { name: 'Expanded lower bound (840x900)', width: 840, height: 900 },
    { name: 'Large laptop (1280x800)', width: 1280, height: 800 },
    { name: 'Extra-large lower bound (1600x900)', width: 1600, height: 900 },
    { name: 'Extra-large desktop (1920x1080)', width: 1920, height: 1080 },
    { name: '200% Zoom Equivalent (640x900 @ 2x)', width: 640, height: 900, dsf: 2 },
  ];

  const ROUTES = [
    { path: '/', name: 'Dashboard' },
    { path: '/jobs', name: 'Jobs List / Kanban' },
    { path: '/jobs/job-1', name: 'Job Detail' },
    { path: '/invoices', name: 'Invoices' },
    { path: '/inventory', name: 'Inventory' },
    { path: '/customers', name: 'Customers' },
    { path: '/payments', name: 'Payments' },
    { path: '/expenses', name: 'Expenses' },
  ];

  for (const vp of VIEWPORTS) {
    it(`Zero page horizontal overflow across all dense views at ${vp.name}`, async () => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf || 1,
      });
      const page = await context.newPage();

      for (const route of ROUTES) {
        await page.goto(`http://127.0.0.1:${port}${route.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(100);

        // Evaluate layout overflow
        const overflow = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientW = docEl.clientWidth;
          const delta = scrollW - clientW;

          let offending = [];
          if (delta > 0) {
            // Find offending elements wider than clientWidth
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const r = el.getBoundingClientRect();
              if (r.right > clientW + 1) {
                offending.push({
                  tag: el.tagName,
                  class: el.className ? String(el.className).slice(0, 50) : '',
                  right: Math.round(r.right),
                  width: Math.round(r.width),
                });
                if (offending.length >= 3) break;
              }
            }
          }

          return {
            hasOverflow: delta > 1, // Allow 1px subpixel rounding tolerance
            scrollW,
            clientW,
            delta,
            offending,
          };
        });

        assert.strictEqual(
          overflow.hasOverflow,
          false,
          `Horizontal page overflow detected on ${route.name} (${route.path}) at viewport ${vp.name}: ` +
          `scrollWidth (${overflow.scrollW}) > clientWidth (${overflow.clientW}) by ${overflow.delta}px.\n` +
          `Offending elements: ${JSON.stringify(overflow.offending)}`
        );
      }

      await context.close();
    });
  }
});
