/**
 * SERP-237 — no fabricated statutory identifiers on a statutory surface.
 *
 * WHY A TEST RATHER THAN A CLEANUP. The invented TIN has now been removed TWICE.
 * SERP-237 was written against '1099882GST501'; by 30 August the same defect was
 * live again as '1002345GST501' — in the GST-201 view, the tourism GST view, the
 * dashboard, and the tourism GST ENGINE itself, which fabricated a TIN even when
 * the caller passed an empty string. A cleanup does not survive. A test does.
 *
 * WHY IT IS SERIOUS RATHER THAN UNTIDY. A fabricated TIN does not stay in a
 * fixture. It flows onto a GST-201, which is a declaration to MIRA. An invented
 * legal entity name on the same return is worse. And Starq Technologies is NOT
 * GST-registered — migration 202608250017 records gst_general as
 * 'not_registered' — so any GST identifier it displays is fiction by definition.
 *
 * THE RULE: when a statutory identifier is not recorded, THE SYSTEM SAYS SO. It
 * never substitutes a plausible-looking value, because a plausible-looking value
 * is indistinguishable from a real one at the moment somebody files it.
 *
 * SCOPE, STATED HONESTLY. The assertions below cover the STATUTORY SURFACES —
 * the files whose output reaches MIRA or a customer. Moving all demo data behind
 * one labelled boundary is the rest of SERP-237 and has NOT been done; the final
 * test inventories it and ratchets, so it cannot grow silently. A red build for
 * work nobody has started teaches people to ignore the suite.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = sourceFiles(SRC);
const read = (f: string) => fs.readFileSync(f, 'utf8');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

/** Files whose output reaches MIRA or a customer. */
const STATUTORY = /^(components\/tax\/|components\/dashboard\/|domain\/miraGst201|domain\/miraTgst)/;

const TIN_LITERAL = /\b\d{7}GST\d{3}\b/;
const BML_ACCOUNT = /(?<!\d)7\d{12}(?!\d)/;

describe('SERP-237 — fabricated statutory identifiers', () => {
  it('no TIN literal appears on a statutory surface', () => {
    const offenders = files.filter((f) => STATUTORY.test(rel(f)) && TIN_LITERAL.test(read(f))).map(rel);
    expect(
      offenders,
      'A TIN literal here becomes a real-looking number on a real filing.',
    ).toEqual([]);
  });

  it('nothing substitutes a plausible value where a TIN belongs', () => {
    // The exact shape that put an invented number on a GST-201 and a tourism
    // return: `tin: x || '1002345GST501'`.
    //
    // An EXPLICIT ABSENCE MARKER is the correct behaviour, not a defect — the
    // whole point is that the system says "not recorded" rather than inventing.
    // So a dash, N/A, or the words NOT REGISTERED are allowed; a plausible
    // identifier is not.
    // Normalised so 'NOT REGISTERED', 'not_registered', 'NON-REG' and 'NONREG'
    // are all recognised as the same statement of absence.
    const isAbsenceMarker = (raw: string) => {
      const v = raw.trim().toUpperCase().replace(/[^A-Z/]/g, '');
      return v === '' || v === 'NA' || v === 'TAX' || /^(NOT|NON)REG/.test(v);
    };
    const offenders = files
      .filter((f) => {
        for (const m of read(f).matchAll(/(?<![A-Za-z])tin(?:Number)?\b\s*:?\s*[A-Za-z0-9_.?\s()]*\|\|\s*(['"`])([^'"`]*)\1/gi)) {
          if (!isAbsenceMarker(m[2])) return true;
        }
        return false;
      })
      .map(rel);
    expect(
      offenders,
      'When a TIN is not recorded the system must say so, not supply a plausible value.',
    ).toEqual([]);
  });

  it('nothing invents a legal entity name', () => {
    const offenders = files
      .filter((f) =>
        [...read(f).matchAll(/legalEntityName\s*:?\s*[A-Za-z0-9_.?\s()]*\|\|\s*(['"`])([^'"`]*)\1/g)].some(
          (m) => m[2].trim().length > 0,
        ),
      )
      .map(rel);
    expect(
      offenders,
      'An invented legal entity name on a tax return is a false declaration.',
    ).toEqual([]);
  });

  it('no placeholder word stands where an identifier belongs', () => {
    // `tinNumber || 'Registered'` rendered the word "Registered" where a number
    // belongs, which a reader takes as a credential rather than as an absence.
    const offenders = files
      .filter((f) => /tinNumber\s*\|\|\s*['"`](Registered|Active|Valid|Verified|Approved)['"`]/i.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('both identifiers this defect has already used are gone, by name', () => {
    for (const known of ['1099882GST501', '1002345GST501']) {
      const offenders = files.filter((f) => read(f).includes(known)).map(rel);
      expect(offenders, `${known} has been removed before and came back`).toEqual([]);
    }
  });

  it('demo identifiers embedded in components do not GROW — the remaining SERP-237 work', () => {
    // NOT a pass/fail on the isolation refactor, which has not been done. This
    // is a ratchet: the inventory is visible and cannot quietly get worse.
    //
    // Baseline measured 30 Aug 2026 after the statutory fixes: THIRTEEN files
    // carry a demo TIN or a 13-digit BML-shaped account number inline, rather
    // than behind one labelled fixture boundary. Named so the next person
    // inherits the list rather than rediscovering it.
    const inventory = files
      .filter((f) => TIN_LITERAL.test(read(f)) || BML_ACCOUNT.test(read(f)))
      .map(rel)
      .sort();

    const BASELINE = 13;
    expect(
      inventory.length,
      'Demo identifiers embedded in components grew past the recorded baseline. Files: ' +
        inventory.join(', '),
    ).toBeLessThanOrEqual(BASELINE);
  });
});
