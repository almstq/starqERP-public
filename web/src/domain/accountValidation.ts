/**
 * STARQ ERP — Chart of Accounts structural validation (SERP-343)
 *
 * The client half of what migration 202608300035 enforces in the database.
 * Two layers, one rule. If they disagree the database wins and this file is the
 * bug.
 *
 * WHAT WAS WRONG BEFORE THIS:
 *   - the Create Account subtype dropdown offered EVERY subtype for EVERY class,
 *     so Asset + Payroll Expense and Liability + Fixed Asset were selectable;
 *   - handleSubmit validated required-and-unique only. It never enforced the
 *     CLASS_CODE_RANGES relationship it displayed in its own UI;
 *   - the parent selector excluded the account itself but not its descendants,
 *     so an account could be made a child of its own child;
 *   - code suggestion took the maximum across a whole class, so a new utility
 *     account was proposed after the highest-numbered expense account rather
 *     than inside the utility block.
 *
 * AUTHORITY: docs/specs/CHART_OF_ACCOUNTS_SPECIFICATION.md v1.1 §2 and §3.
 */

import { AccountClass, AccountRecord, AccountSubtype, CLASS_CODE_RANGES } from './accounts';

/**
 * Which subtypes are meaningful for which class.
 *
 * Derived from the specification, not from what the seed happens to use — a
 * subtype absent from the seed today may still be legitimate tomorrow, but a
 * subtype belonging to another class never is.
 */
export const SUBTYPES_BY_CLASS: Record<AccountClass, AccountSubtype[]> = {
  ASSET: [
    'CURRENT_ASSET', 'BANK_AND_CASH', 'ACCOUNTS_RECEIVABLE', 'INVENTORY',
    'PREPAID_EXPENSE', 'INPUT_TAX_RECOVERABLE', 'FIXED_ASSET',
    'ACCUMULATED_DEPRECIATION', 'NON_CURRENT_ASSET',
  ],
  LIABILITY: [
    'CURRENT_LIABILITY', 'ACCOUNTS_PAYABLE', 'CREDIT_CARD', 'TAX_PAYABLE',
    'PENSION_PAYABLE', 'WITHHOLDING_TAX_PAYABLE', 'ACCRUED_EXPENSES',
    'LONG_TERM_LIABILITY',
  ],
  EQUITY: ['OWNERS_EQUITY', 'RETAINED_EARNINGS', 'CAPITAL_CONTRIBUTION', 'DRAWINGS'],
  REVENUE: ['OPERATING_REVENUE', 'SALES_REVENUE', 'SERVICE_REVENUE', 'DISCOUNT_GIVEN', 'OTHER_INCOME'],
  EXPENSE: [
    'COST_OF_GOODS_SOLD', 'OPERATING_EXPENSE', 'PAYROLL_EXPENSE',
    'RENT_AND_LEASE', 'UTILITIES', 'BANK_FEES_AND_CHARGES',
    'MARKETING_EXPENSE', 'TAX_EXPENSE', 'DEPRECIATION_EXPENSE',
  ],
};

/**
 * The code blocks a class occupies.
 *
 * EXPENSE is two blocks, which is why CLASS_CODE_RANGES could not describe it:
 * that record declares EXPENSE as prefix '5' with max '6999', and those two
 * disagree — a 6xxx account is a valid expense but fails a prefix check.
 * COGS is 5000-5999 and operating expenses are 6000-6999.
 */
export const CLASS_CODE_BLOCKS: Record<AccountClass, Array<{ min: string; max: string; label: string }>> = {
  ASSET: [{ min: '1000', max: '1999', label: 'Assets' }],
  LIABILITY: [{ min: '2000', max: '2999', label: 'Liabilities' }],
  EQUITY: [{ min: '3000', max: '3999', label: 'Equity' }],
  REVENUE: [{ min: '4000', max: '4999', label: 'Revenue' }],
  EXPENSE: [
    { min: '5000', max: '5999', label: 'Cost of Goods Sold' },
    { min: '6000', max: '6999', label: 'Operating Expenses' },
  ],
};

export interface AccountValidationIssue {
  field: 'code' | 'name' | 'subtype' | 'parentId';
  message: string;
}

/** Subtypes offerable for a class. Use this to build the dropdown. */
export function subtypesForClass(accountClass: AccountClass): AccountSubtype[] {
  return SUBTYPES_BY_CLASS[accountClass] ?? [];
}

export function isSubtypeValidForClass(accountClass: AccountClass, subtype: AccountSubtype): boolean {
  return subtypesForClass(accountClass).includes(subtype);
}

/** Is the code inside one of the blocks the class occupies? */
export function isCodeInClassRange(accountClass: AccountClass, code: string): boolean {
  return CLASS_CODE_BLOCKS[accountClass].some((b) => code >= b.min && code <= b.max);
}

/** Human description of where a class's codes may sit, for error messages. */
export function describeClassRange(accountClass: AccountClass): string {
  return CLASS_CODE_BLOCKS[accountClass].map((b) => `${b.min}-${b.max} (${b.label})`).join(' or ');
}

/** Every descendant of an account, so the parent selector can exclude them. */
export function descendantIdsOf(accountId: string, accounts: AccountRecord[]): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const a of accounts) {
      if (a.parentId === parentId && !out.has(a.id)) {
        out.add(a.id);
        walk(a.id);
      }
    }
  };
  walk(accountId);
  return out;
}

/**
 * Accounts that may legitimately be a parent: same class, not the account
 * itself, and not one of its own descendants.
 */
export function eligibleParentsFor(
  accountClass: AccountClass,
  accounts: AccountRecord[],
  editingAccountId?: string,
): AccountRecord[] {
  const banned = editingAccountId ? descendantIdsOf(editingAccountId, accounts) : new Set<string>();
  if (editingAccountId) banned.add(editingAccountId);
  return accounts.filter((a) => a.accountClass === accountClass && !banned.has(a.id));
}

/**
 * Next free code, aware of where the account actually belongs.
 *
 * With a parent, allocate inside the parent's block — a child of 6200 gets 6201,
 * not "one past the highest expense code in the chart". Without one, allocate
 * inside the class block.
 */
export function suggestNextCode(
  accountClass: AccountClass,
  accounts: AccountRecord[],
  parentCode?: string,
): string {
  const used = new Set(accounts.map((a) => a.code));

  if (parentCode) {
    // Children of 1110 live in 1111-1119; children of 1100 in 1110-1190.
    const base = Number(parentCode);
    const step = parentCode.endsWith('00') ? 10 : 1;
    for (let c = base + step; c < base + (step === 10 ? 100 : 10); c += step) {
      const code = String(c).padStart(4, '0');
      if (!used.has(code) && isCodeInClassRange(accountClass, code)) return code;
    }
  }

  for (const block of CLASS_CODE_BLOCKS[accountClass]) {
    const inBlock = accounts
      .map((a) => a.code)
      .filter((c) => c >= block.min && c <= block.max)
      .map(Number);
    const next = (inBlock.length ? Math.max(...inBlock) : Number(block.min)) + 10;
    const code = String(next).padStart(4, '0');
    if (!used.has(code) && code <= block.max) return code;
  }

  return CLASS_CODE_BLOCKS[accountClass][0].min;
}

/**
 * Full structural validation of a proposed account. Returns every issue rather
 * than the first, so a user fixes one form instead of five.
 */
export function validateAccountDraft(params: {
  code: string;
  name: string;
  accountClass: AccountClass;
  subtype: AccountSubtype;
  parentId: string | null;
  accounts: AccountRecord[];
  editingAccountId?: string;
}): AccountValidationIssue[] {
  const { code, name, accountClass, subtype, parentId, accounts, editingAccountId } = params;
  const issues: AccountValidationIssue[] = [];
  const trimmed = code.trim();

  if (!trimmed) {
    issues.push({ field: 'code', message: 'Account code is required.' });
  } else if (!/^[1-6][0-9]{3}$/.test(trimmed)) {
    issues.push({ field: 'code', message: `"${trimmed}" is not a valid account code. Codes are four digits beginning 1-6.` });
  } else if (!isCodeInClassRange(accountClass, trimmed)) {
    issues.push({
      field: 'code',
      message: `Code ${trimmed} is outside the ${accountClass} range. ${accountClass} codes sit in ${describeClassRange(accountClass)}.`,
    });
  }

  const duplicate = accounts.find((a) => a.code === trimmed && a.id !== editingAccountId);
  if (trimmed && duplicate) {
    issues.push({ field: 'code', message: `Account code "${trimmed}" is already used by "${duplicate.name}".` });
  }

  if (!name.trim()) {
    issues.push({ field: 'name', message: 'Account name is required.' });
  }

  if (!isSubtypeValidForClass(accountClass, subtype)) {
    issues.push({
      field: 'subtype',
      message: `Subtype ${subtype} does not belong to ${accountClass}. A subtype from another class would misreport this account.`,
    });
  }

  if (parentId) {
    const parent = accounts.find((a) => a.id === parentId);
    if (!parent) {
      issues.push({ field: 'parentId', message: 'The selected parent account no longer exists.' });
    } else {
      if (parent.accountClass !== accountClass) {
        issues.push({ field: 'parentId', message: `Parent "${parent.name}" is a ${parent.accountClass} account; a ${accountClass} account cannot sit beneath it.` });
      }
      if (editingAccountId) {
        if (parentId === editingAccountId) {
          issues.push({ field: 'parentId', message: 'An account cannot be its own parent.' });
        } else if (descendantIdsOf(editingAccountId, accounts).has(parentId)) {
          issues.push({ field: 'parentId', message: `"${parent.name}" is beneath this account already. Making it the parent would create a cycle.` });
        }
      }
    }
  }

  return issues;
}

/** True when the draft is structurally sound. */
export function isAccountDraftValid(params: Parameters<typeof validateAccountDraft>[0]): boolean {
  return validateAccountDraft(params).length === 0;
}

/**
 * CLASS_CODE_RANGES remains exported from domain/accounts for display, but its
 * EXPENSE entry cannot express two blocks. Anything enforcing a rule should use
 * CLASS_CODE_BLOCKS. This helper exists so the inconsistency is visible in code
 * review rather than silently relied upon.
 */
export function classCodeRangeIsSingleBlock(accountClass: AccountClass): boolean {
  const declared = CLASS_CODE_RANGES[accountClass];
  const blocks = CLASS_CODE_BLOCKS[accountClass];
  return blocks.length === 1 && blocks[0].min === declared.min && blocks[0].max === declared.max;
}
