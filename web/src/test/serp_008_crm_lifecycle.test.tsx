import { describe, it, expect } from 'vitest';

export type CustomerLifecycle = 'Lead' | 'Active' | 'VIP' | 'Inactive' | 'Blocked';

export function transitionCustomerStage(params: {
  currentStage: CustomerLifecycle;
  targetStage: CustomerLifecycle;
  userRole: 'counter' | 'technician' | 'director' | 'owner';
}): { ok: boolean; error?: string } {
  if (params.currentStage === params.targetStage) return { ok: true };

  if (params.currentStage === 'Blocked') {
    if (params.userRole !== 'director' && params.userRole !== 'owner') {
      return { ok: false, error: 'unblocking_requires_privileged_role' };
    }
  }

  const validTransitions: Record<CustomerLifecycle, CustomerLifecycle[]> = {
    Lead: ['Active', 'Inactive', 'Blocked'],
    Active: ['VIP', 'Inactive', 'Blocked'],
    VIP: ['Active', 'Inactive', 'Blocked'],
    Inactive: ['Active', 'Blocked'],
    Blocked: ['Active', 'Inactive'],
  };

  if (!validTransitions[params.currentStage]?.includes(params.targetStage)) {
    return { ok: false, error: 'illegal_lifecycle_transition' };
  }

  return { ok: true };
}

describe('SERP-008: Stage 5 CRM & Customer Lifecycle', () => {
  it('allows natural lifecycle transitions (Lead -> Active -> VIP)', () => {
    const toActive = transitionCustomerStage({
      currentStage: 'Lead',
      targetStage: 'Active',
      userRole: 'counter',
    });
    expect(toActive.ok).toBe(true);

    const toVIP = transitionCustomerStage({
      currentStage: 'Active',
      targetStage: 'VIP',
      userRole: 'counter',
    });
    expect(toVIP.ok).toBe(true);
  });

  it('restricts unblocking blocked customers to privileged director/owner roles', () => {
    const counterAttempt = transitionCustomerStage({
      currentStage: 'Blocked',
      targetStage: 'Active',
      userRole: 'counter',
    });
    expect(counterAttempt.ok).toBe(false);
    expect(counterAttempt.error).toBe('unblocking_requires_privileged_role');

    const ownerAttempt = transitionCustomerStage({
      currentStage: 'Blocked',
      targetStage: 'Active',
      userRole: 'owner',
    });
    expect(ownerAttempt.ok).toBe(true);
  });
});
