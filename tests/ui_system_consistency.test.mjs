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

describe('SERP Material 3 UI System Consistency & Design System Linter', () => {
  it('UI Constitution declares Google Material 3 SSOT with Starq brand seed', () => {
    const docPath = path.join(ROOT, 'docs', 'UI_CONSTITUTION.md');
    assert.ok(fs.existsSync(docPath), 'docs/UI_CONSTITUTION.md must exist');
    const content = fs.readFileSync(docPath, 'utf8');
    assert.match(content, /Material 3/, 'Must reference Material 3');
    assert.match(content, /starqERP/, 'Must define starqERP');
    assert.match(content, /starqAI/, 'Must define starqAI');
    assert.match(content, /--md-sys-color-primary/, 'Must define --md-sys-color-primary');
    assert.match(content, /--md-sys-color-surface/, 'Must define --md-sys-color-surface');
  });

  it('Canonical Google Material 3 tokens exist in theme.css', () => {
    const themePath = path.join(WEB_SRC, 'theme.css');
    assert.ok(fs.existsSync(themePath), 'web/src/theme.css must exist');
    const content = fs.readFileSync(themePath, 'utf8');
    const requiredM3Tokens = [
      '--md-sys-color-primary',
      '--md-sys-color-on-primary',
      '--md-sys-color-primary-container',
      '--md-sys-color-on-primary-container',
      '--md-sys-color-secondary',
      '--md-sys-color-secondary-container',
      '--md-sys-color-surface',
      '--md-sys-color-surface-dim',
      '--md-sys-color-surface-bright',
      '--md-sys-color-surface-container-lowest',
      '--md-sys-color-surface-container-low',
      '--md-sys-color-surface-container',
      '--md-sys-color-surface-container-high',
      '--md-sys-color-surface-container-highest',
      '--md-sys-color-on-surface',
      '--md-sys-color-on-surface-variant',
      '--md-sys-color-outline',
      '--md-sys-color-outline-variant',
      '--md-sys-color-error',
      '--md-sys-shape-corner-extra-small',
      '--md-sys-shape-corner-small',
      '--md-sys-shape-corner-medium',
      '--md-sys-shape-corner-large',
      '--md-sys-shape-corner-extra-large',
      '--md-sys-shape-corner-full',
      '--md-sys-motion-easing-emphasized',
      '--md-sys-state-hover-opacity',
      '--md-sys-state-pressed-opacity',
      '--md-sys-elevation-1',
    ];
    for (const token of requiredM3Tokens) {
      assert.ok(content.includes(token), `theme.css must define Material 3 token ${token}`);
    }
  });

  it('ThemeContext provides System, Light, and Dark mode switching', () => {
    const contextPath = path.join(WEB_SRC, 'context', 'ThemeContext.tsx');
    assert.ok(fs.existsSync(contextPath), 'web/src/context/ThemeContext.tsx must exist');
    const content = fs.readFileSync(contextPath, 'utf8');
    assert.match(content, /'system'\s*\|\s*'light'\s*\|\s*'dark'/, 'Must support system, light, and dark modes');
    assert.match(content, /prefers-color-scheme:\s*dark/, 'Must listen to OS prefers-color-scheme');
    assert.match(content, /localStorage\.setItem/, 'Must persist user theme selection');
  });

  it('Enforces canonical starqAI naming across web components', () => {
    const files = walk(WEB_SRC);
    const forbiddenPatterns = [
      /\bSTARQ\s+AI\b/,
      /\bStarq\s+AI\b/,
      /\bStarqAI\b/,
      /\bstarq\s+AI\b/
    ];

    const violations = [];
    for (const file of files) {
      if (file.includes('test') || file.endsWith('.d.ts')) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          const rel = path.relative(ROOT, file);
          violations.push(`${rel} matches non-canonical AI pattern ${pattern}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found non-canonical AI naming violations:\n${violations.join('\n')}`
    );
  });

  it('Canonical UI primitives package exports Material 3 components', () => {
    const indexPath = path.join(WEB_SRC, 'components', 'ui', 'index.ts');
    assert.ok(fs.existsSync(indexPath), 'web/src/components/ui/index.ts must exist');
    const content = fs.readFileSync(indexPath, 'utf8');
    const requiredPrimitives = [
      'Button',
      'Input',
      'Select',
      'Surface',
      'Table',
      'DataTable',
      'Badge',
      'Modal',
      'Drawer',
      'Tabs',
      'Ripple',
      'StateLayer',
      'Switch',
      'SegmentedButton',
      'FilterChip',
      'ThemeSelector',
    ];
    for (const prim of requiredPrimitives) {
      assert.ok(
        content.includes(prim),
        `web/src/components/ui/index.ts must export ${prim}`
      );
    }
  });

  it('Zero improvised circle-line fake q logos across web codebase', () => {
    const files = walk(WEB_SRC);
    const violations = [];
    for (const file of files) {
      if (file.includes('test') || file.endsWith('.d.ts')) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('circle cx="30"') && content.includes('cy="28"')) {
        const rel = path.relative(ROOT, file);
        violations.push(`${rel} contains legacy improvised fake q mark`);
      }
    }
    assert.strictEqual(
      violations.length,
      0,
      `Found legacy improvised fake q mark violations:\n${violations.join('\n')}`
    );
  });

  it('ThemeSelector defines System, Light, and Dark options with canonical accessible labels', () => {
    const selectorPath = path.join(WEB_SRC, 'components', 'ui', 'ThemeSelector.tsx');
    assert.ok(fs.existsSync(selectorPath), 'ThemeSelector.tsx must exist');
    const content = fs.readFileSync(selectorPath, 'utf8');
    assert.match(content, /Theme:\s*System/, 'Must provide "Theme: System" label');
    assert.match(content, /Theme:\s*Light/, 'Must provide "Theme: Light" label');
    assert.match(content, /Theme:\s*Dark/, 'Must provide "Theme: Dark" label');
    assert.match(content, /Laptop/, 'Must use canonical system theme icon');
    assert.match(content, /Sun/, 'Must use Sun icon for Light mode');
    assert.match(content, /Moon/, 'Must use Moon icon for Dark mode');
  });

  it('SettingsView integrates LogoUpload and AboutTab with canonical metadata', () => {
    const settingsPath = path.join(WEB_SRC, 'components', 'settings', 'SettingsView.tsx');
    const aboutPath = path.join(WEB_SRC, 'components', 'settings', 'AboutTab.tsx');
    const logoUploadPath = path.join(WEB_SRC, 'components', 'settings', 'LogoUpload.tsx');

    assert.ok(fs.existsSync(settingsPath), 'SettingsView.tsx must exist');
    assert.ok(fs.existsSync(aboutPath), 'AboutTab.tsx must exist');
    assert.ok(fs.existsSync(logoUploadPath), 'LogoUpload.tsx must exist');

    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    assert.match(settingsContent, /LogoUpload/, 'SettingsView must integrate LogoUpload');
    assert.match(settingsContent, /AboutTab/, 'SettingsView must integrate AboutTab');

    const aboutContent = fs.readFileSync(aboutPath, 'utf8');
    assert.match(aboutContent, /STARQ_ERP_CANONICAL_METADATA/, 'AboutTab must consume canonical metadata SSOT');
    assert.match(aboutContent, /starqERP/, 'AboutTab must show starqERP');
    assert.match(aboutContent, /starqAI/, 'AboutTab must acknowledge starqAI');
    assert.match(aboutContent, /Copy System Information/, 'AboutTab must provide Copy System Information');
  });
});
