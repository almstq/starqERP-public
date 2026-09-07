/**
 * Maldives input-GST recoverability for the internal beta finance layer.
 *
 * The classifier refuses mixed-use apportionment until the post-beta
 * professional ruling is recorded. It never assumes that GST paid is
 * recoverable, and it makes the cost consequence of blocked tax explicit.
 */

export type PurchaseUse = 'taxable' | 'exempt' | 'mixed' | 'private';
export type CostDestination = 'inventory' | 'asset' | 'expense';
export type InputGstStatus = 'RECOVERABLE' | 'NON_RECOVERABLE' | 'HOLD';

export interface InputGstRequest {
  gstAmount: number;
  purchaseDate: string;
  claimDate: string;
  gstRegistered: boolean;
  validTaxInvoice: boolean;
  purchaseUse: PurchaseUse;
  costDestination: CostDestination;
  /** A MIRA-approved extension to the ordinary twelve-month claim window. */
  claimWindowExtensionApproved?: boolean;
}

export interface InputGstDecision {
  status: InputGstStatus;
  recoverableAmount: number;
  nonRecoverableAmount: number;
  recoverableAccount: '1410' | null;
  costTreatment: 'NONE' | 'CAPITALISE_IN_INVENTORY' | 'CAPITALISE_IN_ASSET' | 'EXPENSE';
  reason: string;
}

export class InputGstInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputGstInvalid';
  }
}

const round2 = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

function parseIsoDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputGstInvalid(`${field} must be an ISO date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new InputGstInvalid(`${field} is not a valid date.`);
  }
  return date;
}

function addTwelveMonths(date: Date): Date {
  const result = new Date(date.valueOf());
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  return result;
}

function blocked(amount: number, destination: CostDestination, reason: string): InputGstDecision {
  const costTreatment = destination === 'inventory'
    ? 'CAPITALISE_IN_INVENTORY'
    : destination === 'asset'
      ? 'CAPITALISE_IN_ASSET'
      : 'EXPENSE';
  return {
    status: 'NON_RECOVERABLE',
    recoverableAmount: 0,
    nonRecoverableAmount: amount,
    recoverableAccount: null,
    costTreatment,
    reason,
  };
}

export function classifyInputGst(request: InputGstRequest): InputGstDecision {
  if (!Number.isFinite(request.gstAmount) || request.gstAmount < 0) {
    throw new InputGstInvalid('gstAmount must be a finite, non-negative amount.');
  }
  const amount = round2(request.gstAmount);
  const purchaseDate = parseIsoDate(request.purchaseDate, 'purchaseDate');
  const claimDate = parseIsoDate(request.claimDate, 'claimDate');
  if (claimDate < purchaseDate) throw new InputGstInvalid('claimDate cannot precede purchaseDate.');

  // Hard blockers apply regardless of whether supply is taxable or mixed
  if (!request.gstRegistered) return blocked(amount, request.costDestination, 'Purchaser is not GST registered.');
  if (!request.validTaxInvoice) return blocked(amount, request.costDestination, 'A valid tax invoice is required to claim input GST.');
  if (request.purchaseUse === 'exempt') return blocked(amount, request.costDestination, 'Purchase relates to exempt supplies.');
  if (request.purchaseUse === 'private') return blocked(amount, request.costDestination, 'Private use is not recoverable business input tax.');

  const deadline = addTwelveMonths(purchaseDate);
  if (claimDate > deadline && !request.claimWindowExtensionApproved) {
    return blocked(amount, request.costDestination, 'The ordinary twelve-month input-tax claim window has expired.');
  }

  // Mixed taxable/exempt use requires professional apportionment; cannot guess ratio in beta
  if (request.purchaseUse === 'mixed') {
    return {
      status: 'HOLD',
      recoverableAmount: 0,
      nonRecoverableAmount: 0,
      recoverableAccount: null,
      costTreatment: 'NONE',
      reason: 'Mixed taxable/exempt use requires an approved apportionment method; beta must not guess a ratio.',
    };
  }

  return {
    status: 'RECOVERABLE',
    recoverableAmount: amount,
    nonRecoverableAmount: 0,
    recoverableAccount: '1410',
    costTreatment: 'NONE',
    reason: 'Registered purchaser, valid tax invoice, taxable use, and claim within the permitted window.',
  };
}
