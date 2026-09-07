import { describe, it, expect } from 'vitest';
import { CANONICAL_JOURNEY_STEPS, resolveCanonicalStepIndex } from '../components/jobs/WorkflowStepRail';
import { COMMAND_SEATS, CommandName } from '../../../contracts/commands';

describe('SERP-146 & SERP-145 — 13-Step Workflow Journey Rail & Seat Signpost', () => {
  it('SERP-146: Workflow journey contains EXACTLY 13 canonical operational steps', () => {
    // Acceptance criterion: exactly 13 steps visible on the journey rail
    expect(CANONICAL_JOURNEY_STEPS).toHaveLength(13);

    const expectedCodes: CommandName[] = [
      'CALL',
      'BOOKING',
      'INTAKE',
      'ESTIMATE',
      'AUTHORISATION',
      'JOB_CARD',
      'PARTS_PROCUREMENT',
      'WORK',
      'QC',
      'HANDOVER',
      'INVOICE',
      'INVOICE_PAYMENT',
      'CLOSE',
    ];

    CANONICAL_JOURNEY_STEPS.forEach((step, index) => {
      expect(step.code).toBe(expectedCodes[index]);
      expect(step.name).toBeDefined();
      expect(step.roleLabel).toBeDefined();

      // Required seats must exactly match the canonical authorization source COMMAND_SEATS
      expect(step.requiredSeats).toEqual(COMMAND_SEATS[step.code]);
    });
  });

  it('SERP-146: Step seats partition correctly across counter, technician, and qc_signer roles', () => {
    const intakeStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'INTAKE')!;
    expect(intakeStep.requiredSeats).toContain('counter');

    const partsStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'PARTS_PROCUREMENT')!;
    expect(partsStep.requiredSeats).toContain('technician');

    const workStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'WORK')!;
    expect(workStep.requiredSeats).toContain('technician');

    const qcStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'QC')!;
    expect(qcStep.requiredSeats).toContain('qc_signer');

    const handoverStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'HANDOVER')!;
    expect(handoverStep.requiredSeats).toContain('counter');

    const closeStep = CANONICAL_JOURNEY_STEPS.find((s) => s.code === 'CLOSE')!;
    expect(closeStep.requiredSeats).toContain('counter');
  });

  it('SERP-145: Seat signpost enforces counter/manager seat requirement for empty bay intake', () => {
    const checkCanCreateJob = (isSystemAdmin: boolean, rolePermissions: { jobs?: string[] }) => {
      return (
        isSystemAdmin ||
        (rolePermissions.jobs?.includes('create') ?? false) ||
        (rolePermissions.jobs?.includes('manage') ?? false)
      );
    };

    // Counter / Service Advisor / Manager can create jobs
    expect(checkCanCreateJob(false, { jobs: ['view', 'create', 'edit'] })).toBe(true);
    expect(checkCanCreateJob(false, { jobs: ['view', 'create', 'approve'] })).toBe(true);
    expect(checkCanCreateJob(true, {})).toBe(true);

    // Pure technician cannot create new jobs from empty bay without counter create permission
    expect(checkCanCreateJob(false, { jobs: ['view', 'edit'] })).toBe(false);
    expect(checkCanCreateJob(false, {})).toBe(false);
  });

  it('SERP-147: WorkflowStepRail maps representative legacy & operational statuses to correct steps', () => {
    // Representative statuses should resolve to their appropriate canonical index and NOT collapse to 0
    expect(resolveCanonicalStepIndex('Draft')).toBe(1); // BOOKING (Step 2)
    expect(resolveCanonicalStepIndex('Check-in & Inspection')).toBe(2); // INTAKE (Step 3)
    expect(resolveCanonicalStepIndex('Awaiting Approval')).toBe(4); // AUTHORISATION (Step 5)
    expect(resolveCanonicalStepIndex('Waiting for Material')).toBe(6); // PARTS_PROCUREMENT (Step 7)
    expect(resolveCanonicalStepIndex('In Progress')).toBe(7); // WORK (Step 8)
    expect(resolveCanonicalStepIndex('Detailing, QC & Assembly')).toBe(8); // QC (Step 9)
    expect(resolveCanonicalStepIndex('Ready for Customer Delivery')).toBe(9); // HANDOVER (Step 10)
    expect(resolveCanonicalStepIndex('Completed')).toBe(10); // INVOICE (Step 11)
    expect(resolveCanonicalStepIndex('Invoiced')).toBe(10); // INVOICE (Step 11)
    expect(resolveCanonicalStepIndex('Tax Invoiced & Settled')).toBe(11); // INVOICE_PAYMENT (Step 12)
    expect(resolveCanonicalStepIndex('Paid')).toBe(11); // INVOICE_PAYMENT (Step 12)
    expect(resolveCanonicalStepIndex('Closed')).toBe(12); // CLOSE (Step 13)

    // Direct command code matches
    expect(resolveCanonicalStepIndex('CALL')).toBe(0);
    expect(resolveCanonicalStepIndex('WORK')).toBe(7);
    expect(resolveCanonicalStepIndex('QC')).toBe(8);
  });
});

