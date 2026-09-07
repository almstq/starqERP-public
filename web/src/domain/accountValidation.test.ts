import { describe, it, expect } from 'vitest';
import {
  validateAccountDraft,
  isSubtypeValidForClass,
  subtypesForClass,
  isCodeInClassRange,
  descendantIdsOf,
  eligibleParentsFor,
  suggestNextCode,
  classCodeRangeIsSingleBlock,
  CLASS_CODE_BLOCKS,
} from './accountValidation';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import { AccountClass } from './accounts';

const accounts = DEFAULT_CHART_OF_ACCOUNTS;
const base = {
  name: 'Test Account',
  accounts,
} as const;

describe('SERP-343: Chart of Accounts structural validation', () => {
  describe('subtype must belong to the account class', () => {
    it('rejects an asset carrying a payroll subtype', () => {
      expect(isSubtypeValidForClass('ASSET', 'PAYROLL_EXPENSE')).toBe(false);
    });

    it('rejects a liability carrying a fixed-asset subtype', () => {
      expect(isSubtypeValidForClass('LIABILITY', 'FIXED_ASSET')).toBe(false);
    });

    it('rejects an expense carrying an accounts-receivable subtype', () => {
      expect(isSubtypeValidForClass('EXPENSE', 'ACCOUNTS_RECEIVABLE')).toBe(false);
    });

    it('accepts the subtypes the seed actually uses for each class', () => {
      for (const a of accounts) {
        expect(
          isSubtypeValidForClass(a.accountClass, a.subtype),
          `${a.code} ${a.name}: ${a.subtype} is not offered for ${a.accountClass}`,
        ).toBe(true);
      }
    });

    it('offers no subtype to more than one class', () => {
      const seen = new Map<string, AccountClass>();
      for (const cls of ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as AccountClass[]) {
        for (const st of subtypesForClass(cls)) {
          expect(seen.has(st), `${st} offered to both ${seen.get(st)} and ${cls}`).toBe(false);
          seen.set(st, cls);
        }
      }
    });
  });

  describe('code ranges', () => {
    it('accepts a code inside the class range', () => {
      expect(isCodeInClassRange('ASSET', '1450')).toBe(true);
      expect(isCodeInClassRange('EXPENSE', '5500')).toBe(true);
      expect(isCodeInClassRange('EXPENSE', '6500')).toBe(true);
    });

    it('rejects a code outside it', () => {
      expect(isCodeInClassRange('ASSET', '2450')).toBe(false);
      expect(isCodeInClassRange('EXPENSE', '7100')).toBe(false);
      expect(isCodeInClassRange('REVENUE', '5000')).toBe(false);
    });

    it('EXPENSE spans two blocks, which CLASS_CODE_RANGES could not express', () => {
      // prefix '5' with max '6999' — a 6xxx expense is valid but fails a prefix
      // check. This is the SERP-343 inconsistency, made explicit.
      expect(classCodeRangeIsSingleBlock('EXPENSE')).toBe(false);
      expect(CLASS_CODE_BLOCKS.EXPENSE).toHaveLength(2);
      for (const cls of ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE'] as AccountClass[]) {
        expect(classCodeRangeIsSingleBlock(cls), `${cls} should be one block`).toBe(true);
      }
    });

    it('rejects a code on submit, not merely in the UI hint', () => {
      const issues = validateAccountDraft({
        ...base, code: '2450', accountClass: 'ASSET', subtype: 'CURRENT_ASSET', parentId: null,
      });
      expect(issues.some((i) => i.field === 'code' && /outside the ASSET range/.test(i.message))).toBe(true);
    });

    it('rejects a malformed code', () => {
      for (const bad of ['abc', '99', '70000', '0100']) {
        const issues = validateAccountDraft({
          ...base, code: bad, accountClass: 'ASSET', subtype: 'CURRENT_ASSET', parentId: null,
        });
        expect(issues.some((i) => i.field === 'code'), `${bad} should be rejected`).toBe(true);
      }
    });
  });

  describe('hierarchy cannot become cyclic', () => {
    it('finds every descendant, not just direct children', () => {
      const assets = accounts.find((a) => a.code === '1000')!;
      const kids = descendantIdsOf(assets.id, accounts);
      expect(kids.has(accounts.find((a) => a.code === '1100')!.id)).toBe(true);
      expect(kids.has(accounts.find((a) => a.code === '1111')!.id), 'grandchild must be excluded too').toBe(true);
    });

    it('excludes descendants from the eligible parent list', () => {
      const cashAndBank = accounts.find((a) => a.code === '1110')!;
      const eligible = eligibleParentsFor('ASSET', accounts, cashAndBank.id);
      const codes = eligible.map((a) => a.code);
      expect(codes).not.toContain('1110'); // itself
      expect(codes).not.toContain('1111'); // its child
      expect(codes).toContain('1000'); // a legitimate ancestor
    });

    it('rejects making an account a child of its own descendant', () => {
      const cashAndBank = accounts.find((a) => a.code === '1110')!;
      const itsChild = accounts.find((a) => a.code === '1111')!;
      const issues = validateAccountDraft({
        ...base, code: '1110', accountClass: 'ASSET', subtype: 'BANK_AND_CASH',
        parentId: itsChild.id, editingAccountId: cashAndBank.id,
      });
      expect(issues.some((i) => i.field === 'parentId' && /cycle/i.test(i.message))).toBe(true);
    });

    it('rejects an account as its own parent', () => {
      const a = accounts.find((x) => x.code === '1110')!;
      const issues = validateAccountDraft({
        ...base, code: '1110', accountClass: 'ASSET', subtype: 'BANK_AND_CASH',
        parentId: a.id, editingAccountId: a.id,
      });
      expect(issues.some((i) => /its own parent/i.test(i.message))).toBe(true);
    });

    it('rejects a parent from a different class', () => {
      const liability = accounts.find((a) => a.code === '2100')!;
      const issues = validateAccountDraft({
        ...base, code: '1450', accountClass: 'ASSET', subtype: 'CURRENT_ASSET', parentId: liability.id,
      });
      expect(issues.some((i) => i.field === 'parentId')).toBe(true);
    });
  });

  describe('code suggestion is parent aware', () => {
    it('suggests inside the parent block, not after the class maximum', () => {
      const suggestion = suggestNextCode('ASSET', accounts, '1110');
      expect(suggestion.startsWith('111'), `expected a 111x code, got ${suggestion}`).toBe(true);
      expect(accounts.some((a) => a.code === suggestion), 'suggestion must be free').toBe(false);
    });

    it('never suggests a code already in use', () => {
      for (const cls of ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as AccountClass[]) {
        const s = suggestNextCode(cls, accounts);
        expect(accounts.some((a) => a.code === s), `${cls} suggested an in-use code ${s}`).toBe(false);
        expect(isCodeInClassRange(cls, s), `${cls} suggested out-of-range ${s}`).toBe(true);
      }
    });
  });

  describe('the whole draft', () => {
    it('accepts a well-formed account', () => {
      const issues = validateAccountDraft({
        ...base, code: '6450', accountClass: 'EXPENSE', subtype: 'MARKETING_EXPENSE',
        parentId: accounts.find((a) => a.code === '6000')!.id,
      });
      expect(issues).toEqual([]);
    });

    it('reports every problem at once rather than the first', () => {
      const issues = validateAccountDraft({
        ...base, name: '', code: '9999', accountClass: 'ASSET', subtype: 'PAYROLL_EXPENSE', parentId: null,
      });
      const fields = issues.map((i) => i.field);
      expect(fields).toContain('code');
      expect(fields).toContain('name');
      expect(fields).toContain('subtype');
    });

    it('does not flag an account as a duplicate of itself when editing', () => {
      const a = accounts.find((x) => x.code === '6210')!;
      const issues = validateAccountDraft({
        ...base, code: '6210', accountClass: 'EXPENSE', subtype: 'RENT_AND_LEASE',
        parentId: a.parentId, editingAccountId: a.id,
      });
      expect(issues).toEqual([]);
    });
  });
});
