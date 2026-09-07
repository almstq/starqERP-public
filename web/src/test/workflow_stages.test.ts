import { describe, it, expect } from 'vitest';
import { INITIAL_WORKFLOW_STAGES } from '../data/mockData';
import { WorkflowStage } from '../types/erp';

describe('SERP-147 & SERP-153 — Dynamic Workflow Progression & SOP Checklists', () => {
  it('SERP-147: Workflow stages allow jobs to advance through all stages dynamically without command-name mismatches', () => {
    const stages: WorkflowStage[] = INITIAL_WORKFLOW_STAGES;
    expect(stages.length).toBeGreaterThanOrEqual(6);

    // Initial stage is Check-in & Inspection
    const currentStage = stages[0];
    expect(currentStage.code).toBe('CHECK_IN');

    // Next stage is dynamically resolved by index, not hardcoded command vocabulary
    const nextStage = stages[1];
    expect(nextStage.code).toBe('SURFACE_PREP');
    expect(nextStage.name).toBe('Surface Prep & Sanding');

    // Verify all stages are sequentially reachable
    for (let i = 0; i < stages.length - 1; i++) {
      const step = stages[i];
      const nextStep = stages[i + 1];
      expect(nextStep.order).toBeGreaterThan(step.order);
      expect(nextStep.name).toBeDefined();
    }
  });

  it('SERP-153 / DEC-092: Check-in stage enforces Option A 8-point garage intake checklist', () => {
    const checkInStage = INITIAL_WORKFLOW_STAGES.find((s) => s.code === 'CHECK_IN')!;
    expect(checkInStage).toBeDefined();
    expect(checkInStage.requiresChecklist).toBe(true);
    expect(checkInStage.checklistItems).toHaveLength(8);
    expect(checkInStage.checklistItems![0]).toContain('registration');
    expect(checkInStage.checklistItems![7]).toContain('authorization');
  });

  it('SERP-153 / DEC-092: QC stage enforces Option A 6-point final QC sign-off checklist', () => {
    const qcStage = INITIAL_WORKFLOW_STAGES.find((s) => s.code === 'QC_DETAIL')!;
    expect(qcStage).toBeDefined();
    expect(qcStage.requiresChecklist).toBe(true);
    expect(qcStage.checklistItems).toHaveLength(6);
    expect(qcStage.checklistItems![0]).toContain('thickness');
    expect(qcStage.checklistItems![5]).toContain('road test');
  });
});
