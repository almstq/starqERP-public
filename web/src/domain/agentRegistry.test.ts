import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AI_AGENTS,
  proposeAgentAction,
  evaluateProposalExecution,
  SystemKillSwitchState,
} from './agentRegistry';

describe('SERP-015: Controlled AI Agent Registry & Kill Switch Engine', () => {
  const antigravity = DEFAULT_AI_AGENTS.find((a) => a.handle === '@antigravity')!;
  const financeBot = DEFAULT_AI_AGENTS.find((a) => a.handle === '@financebot')!;

  const normalKillSwitch: SystemKillSwitchState = { isKillActive: false };
  const activeKillSwitch: SystemKillSwitchState = {
    isKillActive: true,
    activatedAt: '2026-08-28T20:00:00Z',
    activatedBy: 'Ali (Founder)',
    reason: 'Suspicious mass mutation anomaly detected',
  };

  it('allows execution when agent has scope, normal risk, and kill switch is inactive', () => {
    const proposal = proposeAgentAction({
      id: 'prop-01',
      agent: antigravity,
      actionType: 'POST_JOURNAL',
      summary: 'Post balanced period closing journal',
      requiredScope: 'journals:post',
      riskLevel: 'LOW',
    });

    const res = evaluateProposalExecution(proposal, antigravity, normalKillSwitch);
    expect(res.canExecute).toBe(true);
  });

  it('blocks execution when emergency kill switch is activated', () => {
    const proposal = proposeAgentAction({
      id: 'prop-02',
      agent: antigravity,
      actionType: 'POST_JOURNAL',
      summary: 'Post balanced period closing journal',
      requiredScope: 'journals:post',
      riskLevel: 'LOW',
    });

    const res = evaluateProposalExecution(proposal, antigravity, activeKillSwitch);
    expect(res.canExecute).toBe(false);
    expect(res.reason).toContain('Emergency System-Wide Kill Switch is ACTIVE');
  });

  it('blocks execution when agent lacks required permission scope', () => {
    const proposal = proposeAgentAction({
      id: 'prop-03',
      agent: financeBot, // Does not have 'journals:post'
      actionType: 'POST_JOURNAL',
      summary: 'Directly post adjusting journal',
      requiredScope: 'journals:post',
      riskLevel: 'MEDIUM',
    });

    const res = evaluateProposalExecution(proposal, financeBot, normalKillSwitch);
    expect(res.canExecute).toBe(false);
    expect(res.reason).toContain("lacks required scope 'journals:post'");
  });

  it('requires human approval for high-risk action proposals', () => {
    const proposal = proposeAgentAction({
      id: 'prop-04',
      agent: antigravity,
      actionType: 'BULK_WRITE_OFF',
      summary: 'Bulk write off overdue bad debts',
      requiredScope: 'journals:post',
      riskLevel: 'HIGH',
    });

    const resBefore = evaluateProposalExecution(proposal, antigravity, normalKillSwitch);
    expect(resBefore.canExecute).toBe(false);
    expect(resBefore.reason).toContain('requires explicit human approval');

    proposal.status = 'APPROVED';
    const resAfter = evaluateProposalExecution(proposal, antigravity, normalKillSwitch);
    expect(resAfter.canExecute).toBe(true);
  });
});
