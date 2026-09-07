import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Users,
  Sliders,
  Flame,
  Activity,
  Ship,
  Boxes,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  X,
  Code2,
  Briefcase,
  Layers,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { WorkflowStage, UserRole } from '../../types/erp';
import { Badge } from '../common/Badge';

export const WorkflowsConfigTab: React.FC = () => {
  const {
    workflowStages,
    roles,
    addWorkflowStage,
    updateWorkflowStage,
    deleteWorkflowStage,
    resetWorkflowToPreset,
    currentTenant,
    currentBook,
    currentArchetype,
    currentTerms
  } = useERP();

  const [isAddStageOpen, setIsAddStageOpen] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);

  // New stage form state
  const [stageName, setStageName] = useState('');
  const [stageCode, setStageCode] = useState('');
  const [stageDesc, setStageDesc] = useState('');
  const [stageColor, setStageColor] = useState<WorkflowStage['color']>('blue');
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['role-superadmin', 'role-manager']);
  const [slaHours, setSlaHours] = useState<number>(12);
  const [requiresChecklist, setRequiresChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState('Safety check completed\nCustomer briefed');

  const handleCreateStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName) return;

    const generatedCode = stageCode || stageName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const items = checklistItems.split('\n').filter((line) => line.trim().length > 0);

    addWorkflowStage({
      name: stageName,
      code: generatedCode,
      description: stageDesc || `Operational phase: ${stageName}`,
      color: stageColor,
      allowedRoleIds: allowedRoles,
      slaHours,
      requiresChecklist,
      checklistItems: requiresChecklist ? items : undefined
    });

    setIsAddStageOpen(false);
    setStageName('');
    setStageCode('');
    setStageDesc('');
  };

  const toggleRoleForNewStage = (roleId: string) => {
    setAllowedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const getColorClasses = (color: WorkflowStage['color']) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'emerald':
        return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'purple':
        return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'amber':
        return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'cyan':
        return 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
      case 'rose':
        return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
              Tenant Configurable Workflows
            </h2>
            <Badge variant="blue" size="sm">
              Dynamic Engine
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5 max-w-2xl">
            Operational pipeline stages in starqERP are <strong>per-book and per-tenant configurable</strong>. Software services, commercial workshops, boatyards, and clinics use the exact same underlying ERP spine with their own domain stages.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsAddStageOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Stage</span>
          </button>
        </div>
      </div>

      {/* Preset Fast-Loader Bar */}
      <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            <span>Load Standard Industry Workflow Template:</span>
          </span>
          <span className="text-[11px] text-[var(--md-sys-color-outline)] font-medium">
            Active: {currentBook?.name ? `${currentBook.name} (${currentArchetype.name})` : currentArchetype.name}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <button
            onClick={() => resetWorkflowToPreset('software_services')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-indigo-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Code2 className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
            <span>Software & Engineering (4 Stages)</span>
          </button>

          <button
            onClick={() => resetWorkflowToPreset('general_business')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-blue-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
            <span>General Business (4 Stages)</span>
          </button>

          <button
            onClick={() => resetWorkflowToPreset('professional_services')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-purple-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Briefcase className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
            <span>Professional Services (4 Stages)</span>
          </button>

          <button
            onClick={() => resetWorkflowToPreset('automotive_workshop')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-amber-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Flame className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
            <span>Auto Workshop & Prep (5 Stages)</span>
          </button>

          <button
            onClick={() => resetWorkflowToPreset('medical_clinic')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-emerald-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Activity className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span>Medical Clinic & Care (3 Stages)</span>
          </button>

          <button
            onClick={() => resetWorkflowToPreset('marine_service')}
            className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-cyan-500 bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] transition-all group cursor-pointer"
          >
            <Ship className="w-4 h-4 text-cyan-600 group-hover:scale-110 transition-transform" />
            <span>Marine & Slipway (4 Stages)</span>
          </button>
        </div>
      </div>

      {/* Visual Pipeline Flow */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
              Configured Pipeline Sequence ({workflowStages.length} Stages)
            </h3>
          </div>
          <span className="text-xs text-[var(--md-sys-color-outline)]">
            {currentTerms.orders} transition sequentially across lifecycle stages
          </span>
        </div>

        {/* Stage Sequence Cards */}
        <div className="space-y-3">
          {workflowStages.map((stage, idx) => {
            const allowedRoleNames = roles
              .filter((r) => stage.allowedRoleIds.includes(r.id))
              .map((r) => r.name);

            return (
              <div
                key={stage.id}
                className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)]/70 bg-[var(--md-sys-color-surface-container-high)]/40 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-[var(--md-sys-color-outline-variant)] dark:hover:border-[var(--md-sys-color-outline-variant)]"
              >
                <div className="flex items-start gap-3">
                  {/* Step Order Circle */}
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    {idx + 1}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-xs sm:text-sm text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                        {stage.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-bold font-mono ${getColorClasses(
                          stage.color
                        )}`}
                      >
                        {stage.code}
                      </span>

                      {stage.isInitial && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          Entry Stage
                        </span>
                      )}
                      {stage.isCompletedStage && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          Completed / Delivery
                        </span>
                      )}
                      {stage.isBillingStage && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                          Tax Invoiced
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                      {stage.description}
                    </p>

                    {/* Meta info: SLA + Roles */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                      {stage.slaHours && (
                        <span className="flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Target Turnaround: <strong className="font-semibold">{stage.slaHours}h</strong></span>
                        </span>
                      )}

                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-blue-500" />
                        <span>Allowed Transition Roles:</span>
                        <strong className="font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                          {allowedRoleNames.length > 0 ? allowedRoleNames.join(', ') : 'All Roles'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {workflowStages.length > 2 && (
                    <button
                      onClick={() => deleteWorkflowStage(stage.id)}
                      className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="Remove Stage"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Add Stage */}
      {isAddStageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  Add Pipeline Workflow Stage
                </h3>
              </div>
              <button
                onClick={() => setIsAddStageOpen(false)}
                className="text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStage} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Stage Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    placeholder="e.g. Ultrasonic Cleaning"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Stage Code
                  </label>
                  <input
                    type="text"
                    value={stageCode}
                    onChange={(e) => setStageCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ULTRASONIC_CLEAN"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-blue-600 dark:text-blue-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Stage Description & Instructions
                </label>
                <textarea
                  rows={2}
                  value={stageDesc}
                  onChange={(e) => setStageDesc(e.target.value)}
                  placeholder="What actions must be completed during this phase?"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    SLA Target (Hours)
                  </label>
                  <input
                    type="number"
                    value={slaHours}
                    onChange={(e) => setSlaHours(Number(e.target.value))}
                    min={1}
                    max={120}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Badge Color
                  </label>
                  <select
                    value={stageColor}
                    onChange={(e) => setStageColor(e.target.value as WorkflowStage['color'])}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                  >
                    <option value="blue">Blue</option>
                    <option value="emerald">Emerald</option>
                    <option value="amber">Amber</option>
                    <option value="purple">Purple</option>
                    <option value="cyan">Cyan</option>
                    <option value="rose">Rose</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                  Who may transition jobs into this stage?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map((r) => {
                    const isChecked = allowedRoles.includes(r.id);
                    return (
                      <div
                        key={r.id}
                        onClick={() => toggleRoleForNewStage(r.id)}
                        className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200'
                            : 'border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]'
                        }`}
                      >
                        <span className="truncate">{r.name}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStageOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Add Stage to Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
