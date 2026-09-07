import React, { useState } from 'react';
import {
  Bot,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  KeyRound,
  RefreshCw
} from 'lucide-react';
import {
  DEFAULT_AI_AGENTS,
  RegisteredAgent,
  AgentActionProposal,
  SystemKillSwitchState,
  evaluateProposalExecution,
} from '../../domain/agentRegistry';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const AgentRegistryView: React.FC = () => {
  const { currentTenant } = useERP();

  const [agents, setAgents] = useState<RegisteredAgent[]>(DEFAULT_AI_AGENTS);
  const [killSwitch, setKillSwitch] = useState<SystemKillSwitchState>({
    isKillActive: false,
  });

  const [proposals, setProposals] = useState<AgentActionProposal[]>([
    {
      id: 'prop-001',
      agentId: 'agent-financebot',
      agentHandle: '@financebot',
      actionType: 'AUTO_RECONCILE_BATCH',
      summary: 'Auto-matched 14 BML transactions against invoice #INV-2026-088',
      requiredScope: 'bank:reconcile_propose',
      riskLevel: 'LOW',
      status: 'PENDING_APPROVAL',
      submittedAt: '2026-08-28T20:10:00Z',
    },
    {
      id: 'prop-002',
      agentId: 'agent-antigravity',
      agentHandle: '@antigravity',
      actionType: 'INTER_BRANCH_CLEARING',
      summary: 'Post inter-company elimination journal for Q3 branch consolidation',
      requiredScope: 'journals:post',
      riskLevel: 'HIGH',
      status: 'PENDING_APPROVAL',
      submittedAt: '2026-08-28T20:12:00Z',
    },
  ]);

  const toggleAgentStatus = (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a;
        const newStatus = a.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
        return { ...a, status: newStatus };
      })
    );
  };

  const handleToggleKillSwitch = () => {
    if (killSwitch.isKillActive) {
      setKillSwitch({ isKillActive: false });
    } else {
      setKillSwitch({
        isKillActive: true,
        activatedAt: new Date().toISOString(),
        activatedBy: 'Ali (Founder)',
        reason: 'Emergency Safety Protocol Activated by Admin',
      });
    }
  };

  const handleApproveProposal = (proposalId: string) => {
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) return;

    const agent = agents.find((a) => a.id === prop.agentId);
    if (!agent) return;

    const evaluation = evaluateProposalExecution(
      { ...prop, status: 'APPROVED' },
      agent,
      killSwitch
    );

    if (!evaluation.canExecute) {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(evaluation.reason);
      }
      return;
    }

    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: 'EXECUTED',
              decidedAt: new Date().toISOString(),
              decidedBy: 'Ali (Founder)',
            }
          : p
      )
    );

    if (typeof window !== 'undefined' && window.alert) {
      window.alert(`Proposal #${proposalId} approved and executed successfully!`);
    }
  };

  const handleRejectProposal = (proposalId: string) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: 'REJECTED',
              decidedAt: new Date().toISOString(),
              decidedBy: 'Ali (Founder)',
            }
          : p
      )
    );
  };

  return (
    <div className="space-y-6" data-testid="agent-registry-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Bot size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">AI Agent Governance & Master Kill Switch</h2>
                <Badge variant="positive">Controlled Execution</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Grant management, action proposals gate, immutable audit trail, and emergency safety isolation.
              </p>
            </div>
          </div>

          <div>
            <Button
              variant={killSwitch.isKillActive ? 'filled' : 'outlined'}
              size="sm"
              onClick={handleToggleKillSwitch}
              icon={killSwitch.isKillActive ? <Unlock size={14} /> : <AlertOctagon size={14} />}
              className={killSwitch.isKillActive ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'border-rose-500/50 text-rose-400 hover:bg-rose-950/30'}
            >
              <span>{killSwitch.isKillActive ? 'Restore System Execution' : 'Activate Emergency Kill Switch'}</span>
            </Button>
          </div>
        </div>
      </Surface>

      {/* Kill Switch Alert Banner */}
      {killSwitch.isKillActive && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500/80 flex items-center justify-between gap-4 text-white">
          <div className="flex items-center gap-3">
            <AlertOctagon size={24} className="text-rose-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-sm font-bold text-rose-200">
                SYSTEM-WIDE EMERGENCY KILL SWITCH ACTIVE
              </div>
              <div className="text-xs text-rose-300/80">
                {killSwitch.reason} · Activated by {killSwitch.activatedBy}. All AI ledger mutations are strictly blocked.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registered AI Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((ag) => (
          <Surface
            key={ag.id}
            className={`p-5 rounded-2xl border transition ${
              ag.status === 'ACTIVE'
                ? 'bg-[#0a0f1d] border-slate-800'
                : 'bg-slate-950 border-rose-900/50 opacity-75'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-950/60 text-indigo-400 border border-indigo-500/30 font-mono text-xs font-bold">
                  {ag.handle}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{ag.name}</h3>
                  <span className="text-[11px] text-slate-400">{ag.role}</span>
                </div>
              </div>

              <Badge variant={ag.status === 'ACTIVE' ? 'positive' : 'destructive'}>
                {ag.status}
              </Badge>
            </div>

            {/* Scope Grants */}
            <div className="mt-3 space-y-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-1">
                <KeyRound size={10} />
                <span>Granted Scopes</span>
              </span>
              <div className="flex flex-wrap gap-1">
                {ag.grantedScopes.map((sc) => (
                  <span
                    key={sc}
                    className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 font-mono text-[10px] border border-slate-800"
                  >
                    {sc}
                  </span>
                ))}
              </div>
            </div>

            {/* Trust & Controls */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <ShieldCheck size={14} className="text-teal-400" />
                <span className="text-slate-400">Trust Score:</span>
                <span className="font-bold text-white">{ag.trustScore}%</span>
              </div>

              <Button
                variant="outlined"
                size="sm"
                onClick={() => toggleAgentStatus(ag.id)}
                className={ag.status === 'ACTIVE' ? 'text-rose-400 border-rose-900/50' : 'text-teal-400 border-teal-900/50'}
              >
                <span>{ag.status === 'ACTIVE' ? 'Revoke Access' : 'Re-activate'}</span>
              </Button>
            </div>
          </Surface>
        ))}
      </div>

      {/* Action Proposals & Human Approval Gate */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            <span>AI Action Proposals & Approval Pipeline</span>
          </h3>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {proposals.map((p) => (
            <div key={p.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-indigo-400">{p.agentHandle}</span>
                  <span className="text-slate-400 font-sans font-bold">· {p.actionType}</span>
                  <Badge variant={p.riskLevel === 'HIGH' ? 'destructive' : p.riskLevel === 'MEDIUM' ? 'warning' : 'neutral'}>
                    {p.riskLevel} RISK
                  </Badge>
                </div>
                <Badge variant={p.status === 'EXECUTED' ? 'positive' : p.status === 'REJECTED' ? 'destructive' : 'warning'}>
                  {p.status}
                </Badge>
              </div>

              <div className="text-slate-300 font-sans text-xs">
                {p.summary}
              </div>

              {/* Action Buttons */}
              {p.status === 'PENDING_APPROVAL' && (
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/60 font-sans">
                  <Button
                    variant="outlined"
                    size="sm"
                    onClick={() => handleRejectProposal(p.id)}
                    icon={<XCircle size={14} />}
                    className="text-rose-400 border-rose-900/50"
                  >
                    <span>Reject</span>
                  </Button>
                  <Button
                    variant="filled"
                    size="sm"
                    onClick={() => handleApproveProposal(p.id)}
                    icon={<CheckCircle2 size={14} />}
                  >
                    <span>Approve & Execute</span>
                  </Button>
                </div>
              )}

              {p.status === 'EXECUTED' && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold pt-1 font-sans">
                  <CheckCircle2 size={14} />
                  <span>Approved by {p.decidedBy} & Executed ✓</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
};
