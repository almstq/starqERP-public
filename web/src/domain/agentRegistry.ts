export type AgentScope =
  | 'invoices:read'
  | 'invoices:create'
  | 'bank:read'
  | 'bank:reconcile_propose'
  | 'journals:propose'
  | 'journals:post'
  | 'inventory:read'
  | 'inventory:transfer_propose'
  | 'reports:read';

export interface RegisteredAgent {
  id: string;
  handle: string;
  name: string;
  role: string;
  grantedScopes: AgentScope[];
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  trustScore: number; // 0 to 100
  lastActiveAt?: string;
}

export interface AgentActionProposal {
  id: string;
  agentId: string;
  agentHandle: string;
  actionType: string;
  summary: string;
  requiredScope: AgentScope;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  submittedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface SystemKillSwitchState {
  isKillActive: boolean;
  activatedAt?: string;
  activatedBy?: string;
  reason?: string;
}

export const DEFAULT_AI_AGENTS: RegisteredAgent[] = [
  {
    id: 'agent-hermes',
    handle: '@hermes',
    name: 'Hermes Telemetry & Ops Dispatcher',
    role: 'Autonomous Ops & Telegram Relay Gateway',
    grantedScopes: ['invoices:read', 'bank:read', 'reports:read', 'inventory:read'],
    status: 'ACTIVE',
    trustScore: 99,
  },
  {
    id: 'agent-claude',
    handle: '@claude',
    name: 'Claude Elder Architect',
    role: 'CI/CD & Architecture Auditor',
    grantedScopes: ['reports:read', 'bank:reconcile_propose', 'journals:propose'],
    status: 'ACTIVE',
    trustScore: 98,
  },
  {
    id: 'agent-antigravity',
    handle: '@antigravity',
    name: 'Antigravity Domain Engineer',
    role: 'Full-Stack ERP Domain Builder',
    grantedScopes: [
      'invoices:read',
      'invoices:create',
      'bank:read',
      'bank:reconcile_propose',
      'journals:propose',
      'journals:post',
      'inventory:read',
      'inventory:transfer_propose',
      'reports:read',
    ],
    status: 'ACTIVE',
    trustScore: 100,
  },
  {
    id: 'agent-financebot',
    handle: '@financebot',
    name: 'BML Auto-Reconciliation Bot',
    role: 'Bank Statement Matcher & Receipt OCR',
    grantedScopes: ['bank:read', 'bank:reconcile_propose', 'journals:propose'],
    status: 'ACTIVE',
    trustScore: 92,
  },
];

/**
 * Creates an action proposal submitted by an autonomous AI agent.
 */
export function proposeAgentAction(params: {
  id: string;
  agent: RegisteredAgent;
  actionType: string;
  summary: string;
  requiredScope: AgentScope;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}): AgentActionProposal {
  const { id, agent, actionType, summary, requiredScope, riskLevel } = params;

  return {
    id,
    agentId: agent.id,
    agentHandle: agent.handle,
    actionType,
    summary,
    requiredScope,
    riskLevel,
    status: 'PENDING_APPROVAL',
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates whether an agent action proposal can be executed.
 */
export function evaluateProposalExecution(
  proposal: AgentActionProposal,
  agent: RegisteredAgent,
  killSwitch: SystemKillSwitchState
): { canExecute: boolean; reason?: string } {
  if (killSwitch.isKillActive) {
    return {
      canExecute: false,
      reason: `Blocked: Emergency System-Wide Kill Switch is ACTIVE (${killSwitch.reason || 'Safety lockdown'})`,
    };
  }

  if (agent.status !== 'ACTIVE') {
    return {
      canExecute: false,
      reason: `Blocked: Agent ${agent.handle} is currently ${agent.status}`,
    };
  }

  if (!agent.grantedScopes.includes(proposal.requiredScope)) {
    return {
      canExecute: false,
      reason: `Blocked: Agent lacks required scope '${proposal.requiredScope}'`,
    };
  }

  if (proposal.riskLevel === 'HIGH' && proposal.status !== 'APPROVED') {
    return {
      canExecute: false,
      reason: 'Blocked: High-risk action requires explicit human approval before execution',
    };
  }

  return { canExecute: true };
}
