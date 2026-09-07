import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert';

const ROOT = path.resolve(import.meta.dirname, '..');
const WEB_SRC = path.join(ROOT, 'web', 'src');

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      results = results.concat(walk(p));
    } else if (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css')) {
      results.push(p);
    }
  }
  return results;
}

describe('SERP Material 3 Adaptive Layout & Responsive Architecture Guardrail', () => {
  it('UI Constitution defines Material 3 Adaptive Window Classes', () => {
    const docPath = path.join(ROOT, 'docs', 'UI_CONSTITUTION.md');
    assert.ok(fs.existsSync(docPath), 'docs/UI_CONSTITUTION.md must exist');
    const content = fs.readFileSync(docPath, 'utf8');
    assert.match(content, /Compact/i, 'Must define Compact window class');
    assert.match(content, /Medium/i, 'Must define Medium window class');
    assert.match(content, /Expanded/i, 'Must define Expanded window class');
    assert.match(content, /Large/i, 'Must define Large window class');
    assert.match(content, /Extra-large/i, 'Must define Extra-large window class');
    assert.match(content, /container-type:\s*inline-size/i, 'Must specify container queries');
  });

  it('Zero uncontained wide min-width hacks across web components', () => {
    const files = walk(WEB_SRC);
    const violations = [];

    for (const file of files) {
      if (file.includes('test') || file.endsWith('.d.ts')) continue;
      const content = fs.readFileSync(file, 'utf8');
      
      // Look for uncontained min-w-[700px+] or fixed w-[700px+] on non-scroll containers
      const wideMatches = content.match(/min-w-\[(\d+)px\]/g) || [];
      for (const m of wideMatches) {
        const px = parseInt(m.replace(/\D/g, ''), 10);
        if (px > 500 && !content.includes('erp-scroll-region') && !content.includes('overflow-x-auto')) {
          violations.push(`${path.relative(ROOT, file)} has uncontained wide width ${m}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found uncontained wide min-width violations:\n${violations.join('\n')}`
    );
  });

  it('ResponsiveGrid, ActionGroup, Surface, and Table primitives are exported and fluid', () => {
    const indexPath = path.join(WEB_SRC, 'components', 'ui', 'index.ts');
    assert.ok(fs.existsSync(indexPath), 'ui/index.ts must exist');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('ResponsiveGrid'), 'Must export ResponsiveGrid');
    assert.ok(content.includes('ActionGroup'), 'Must export ActionGroup');
    assert.ok(content.includes('Surface'), 'Must export Surface');
    assert.ok(content.includes('Table'), 'Must export Table');

    const gridFile = fs.readFileSync(path.join(WEB_SRC, 'components', 'ui', 'ResponsiveGrid.tsx'), 'utf8');
    assert.ok(gridFile.includes('minmax'), 'ResponsiveGrid must use minmax()');

    const surfaceFile = fs.readFileSync(path.join(WEB_SRC, 'components', 'ui', 'Surface.tsx'), 'utf8');
    assert.ok(surfaceFile.includes('min-w-0'), 'Surface must enforce min-w-0');
    assert.ok(surfaceFile.includes('containerType'), 'Surface must support container queries');

    const tableFile = fs.readFileSync(path.join(WEB_SRC, 'components', 'ui', 'Table.tsx'), 'utf8');
    assert.ok(tableFile.includes('overflow-x-auto'), 'Table must own overflow-x-auto');
  });

  it('AppShell implements Material 3 window classes with live resize reflow', () => {
    const shellPath = path.join(WEB_SRC, 'app', 'AppShell.tsx');
    assert.ok(fs.existsSync(shellPath), 'AppShell.tsx must exist');
    const content = fs.readFileSync(shellPath, 'utf8');
    assert.match(content, /compact/i, 'Must handle compact class');
    assert.match(content, /medium/i, 'Must handle medium class');
    assert.match(content, /Navigation\s*Rail/i, 'Must provide NavigationRail for medium class');
    assert.match(content, /resize/, 'Must listen to window resize event');
  });
});
