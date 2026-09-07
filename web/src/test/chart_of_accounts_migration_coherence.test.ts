/**
 * SERP-391 — chart-of-accounts / migration coherence ratchet.
 *
 * SERP-340 fixed a defect where three codes meant different things in
 * web/src/data/defaultChartOfAccounts.ts (the client's chart) versus the
 * posting engines, and six codes existed only in the database. The Founder
 * Action Register recorded SERP-340 as closed "with a coherence ratchet
 * added" - but nothing was ever added that would fail if the two sources
 * drifted apart again (docs/adjudications trail: DEC-107). This is that
 * ratchet, as its own task with its own evidence, per DEC-107.
 *
 * It parses the actual seed rows out of every `chart_of_accounts` migration
 * (not a second hand-maintained copy of the seed, which would just be a new
 * place for the two to drift) and compares them field-by-field against
 * DEFAULT_CHART_OF_ACCOUNTS. Mirrors the database's own
 * `on conflict (organisation_id, code) do nothing`: the first migration to
 * seed a code is authoritative if a later one ever repeats it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

interface SeedRow {
  code: string;
  name: string;
  accountClass: string;
  subtype: string;
  parentCode: string | null;
  level: number;
  currency: string;
  postingControl: string;
  sourceFile: string;
}

function parseSqlLiteral(raw: string): string | number | null {
  const s = raw.trim();
  if (/^null$/i.test(s)) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

/**
 * Splits the content of a SQL `values (...), (...), ...` block into its
 * individual tuples, each as an array of raw (still-quoted) field strings.
 * A small hand-rolled scanner, not a general SQL parser - it only needs to
 * survive the two migrations that actually seed this table: single-quoted
 * strings with '' escapes, numbers, null, and nested parens don't occur
 * inside these particular tuples other than the tuple's own wrapping parens.
 */
function splitSqlTuples(valuesBlock: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  const n = valuesBlock.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(valuesBlock[i])) i++;
    if (i >= n) break;
    if (valuesBlock[i] !== '(') {
      throw new Error(
        `chart_of_accounts migration parser: expected '(' at offset ${i}, found ${JSON.stringify(valuesBlock.slice(i, i + 20))}`,
      );
    }
    i++;
    const fields: string[] = [];
    let depth = 1;
    let current = '';
    let inString = false;
    while (i < n && depth > 0) {
      const ch = valuesBlock[i];
      if (inString) {
        if (ch === "'") {
          if (valuesBlock[i + 1] === "'") {
            current += "''";
            i += 2;
            continue;
          }
          inString = false;
          current += ch;
          i++;
          continue;
        }
        current += ch;
        i++;
        continue;
      }
      if (ch === "'") {
        inString = true;
        current += ch;
        i++;
        continue;
      }
      if (ch === '(') {
        depth++;
        current += ch;
        i++;
        continue;
      }
      if (ch === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        current += ch;
        i++;
        continue;
      }
      if (ch === ',' && depth === 1) {
        fields.push(current);
        current = '';
        i++;
        continue;
      }
      current += ch;
      i++;
    }
    fields.push(current);
    tuples.push(fields.map((f) => f.trim()));
  }
  return tuples;
}

function loadMigrationSeed(): Map<string, SeedRow> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const seed = new Map<string, SeedRow>();

  const insertRegex = /insert\s+into\s+public\.chart_of_accounts[\s\S]*?cross join\s*\(values([\s\S]*?)\)\s*as s\(/gi;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    let match: RegExpExecArray | null;
    while ((match = insertRegex.exec(sql)) !== null) {
      const tuples = splitSqlTuples(match[1]);
      for (const fields of tuples) {
        if (fields.length !== 9) {
          throw new Error(
            `chart_of_accounts migration parser: expected 9 fields in ${file}, got ${fields.length}: ${JSON.stringify(fields)}`,
          );
        }
        // 9th field (description) is deliberately not destructured - this
        // ratchet doesn't compare descriptions, only the identity/hierarchy/
        // classification fields that caused the SERP-340 defect.
        const [code, name, accountClass, subtype, parentCode, level, currency, postingControl] =
          fields.map(parseSqlLiteral);
        const codeStr = String(code);
        // First migration to seed a code wins - matches `on conflict (...) do nothing`.
        if (!seed.has(codeStr)) {
          seed.set(codeStr, {
            code: codeStr,
            name: String(name),
            accountClass: String(accountClass),
            subtype: String(subtype),
            parentCode: parentCode === null ? null : String(parentCode),
            level: Number(level),
            currency: String(currency),
            postingControl: String(postingControl),
            sourceFile: file,
          });
        }
      }
    }
    insertRegex.lastIndex = 0;
  }

  return seed;
}

describe('SERP-391: chart-of-accounts / migration coherence ratchet', () => {
  const migrationSeed = loadMigrationSeed();

  it('sanity: the parser actually found migration rows (a zero-row result would make every check below vacuous)', () => {
    expect(migrationSeed.size).toBeGreaterThan(30);
  });

  it('every code in the application chart exists in the migration seed', () => {
    const missing = DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code).filter((code) => !migrationSeed.has(code));
    expect(missing).toEqual([]);
  });

  it('every code in the migration seed exists in the application chart', () => {
    const appCodes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code));
    const missing = [...migrationSeed.keys()].filter((code) => !appCodes.has(code));
    expect(missing).toEqual([]);
  });

  it('name, class, subtype, level, currency and parent agree for every shared code', () => {
    const mismatches: string[] = [];
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      const seedRow = migrationSeed.get(account.code);
      if (!seedRow) continue; // already reported by the previous test

      const appParentCode = account.parentId ? account.parentId.replace(/^coa-/, '') : null;

      if (account.name !== seedRow.name) {
        mismatches.push(`${account.code}: name "${account.name}" vs migration "${seedRow.name}" (${seedRow.sourceFile})`);
      }
      if (account.accountClass !== seedRow.accountClass) {
        mismatches.push(`${account.code}: accountClass "${account.accountClass}" vs migration "${seedRow.accountClass}"`);
      }
      if (account.subtype !== seedRow.subtype) {
        mismatches.push(`${account.code}: subtype "${account.subtype}" vs migration "${seedRow.subtype}"`);
      }
      if (account.level !== seedRow.level) {
        mismatches.push(`${account.code}: level ${account.level} vs migration ${seedRow.level}`);
      }
      if (account.currency !== seedRow.currency) {
        mismatches.push(`${account.code}: currency "${account.currency}" vs migration "${seedRow.currency}"`);
      }
      if (appParentCode !== seedRow.parentCode) {
        mismatches.push(`${account.code}: parent "${appParentCode}" vs migration "${seedRow.parentCode}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('isSystem agrees with posting_control (postable = false, everything else = true)', () => {
    const mismatches: string[] = [];
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      const seedRow = migrationSeed.get(account.code);
      if (!seedRow) continue;
      const expectedIsSystem = seedRow.postingControl !== 'postable';
      if (account.isSystem !== expectedIsSystem) {
        mismatches.push(
          `${account.code}: isSystem ${account.isSystem} vs posting_control "${seedRow.postingControl}" (expected isSystem ${expectedIsSystem})`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
