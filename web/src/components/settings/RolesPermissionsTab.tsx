import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Check,
  X,
  Lock,
  Users,
  Eye,
  Edit,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { UserRole, PermissionModule, PermissionAction } from '../../types/erp';
import { Badge } from '../common/Badge';

export const RolesPermissionsTab: React.FC = () => {
  const { roles, users, createRole, updateRolePermissions, deleteRole, currentUser, currentTerms, currentArchetype } = useERP();
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || 'role-superadmin');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const rolePickerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const modulesList: {
    key: PermissionModule;
    label: string;
    description: string;
    supportedActions: PermissionAction[];
  }[] = [
    {
      key: 'jobs',
      label: currentTerms.orders,
      description: `Manage ${currentTerms.orders.toLowerCase()}, scopes, milestones, assign ${currentTerms.workers.toLowerCase()}, and track deliverables.`,
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'export']
    },
    {
      key: 'invoices',
      label: 'Invoices & Billing',
      description: 'Create GST tax invoices, apply discounts, issue official MIRA compliant billing.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'export']
    },
    {
      key: 'payments',
      label: 'Payments & Reconciliation',
      description: 'Record BML/MIB transfer slips, reconcile bank balances, mark verified.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'export']
    },
    {
      key: 'expenses',
      label: 'Operating Expenses',
      description: 'Log rent, utilities, freight, subcontractor services, and operational expenditure.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'export']
    },
    {
      key: 'inventory',
      label: currentTerms.inventory,
      description: 'Adjust stock levels, receive inventory orders, view unit cost valuations, manage item SKUs.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'manage', 'export']
    },
    {
      key: 'purchasing',
      label: currentTerms.purchasing,
      description: 'Draft purchase orders and vendor bills, approve supplier requisitions.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'export']
    },
    {
      key: 'reports',
      label: 'Reports & Tax Analytics',
      description: 'View MIRA GST return reports, gross margin breakdowns, P&L summaries.',
      supportedActions: ['view', 'export']
    },
    {
      key: 'workflows',
      label: 'Configurable Workflows',
      description: 'Define operational pipeline stages, customize turnaround SLAs.',
      supportedActions: ['view', 'edit', 'manage']
    },
    {
      key: 'roles',
      label: 'Roles & Security Policies',
      description: 'Modify user permissions matrix, manage system capability levels.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'manage']
    },
    {
      key: 'users',
      label: 'User Authorizations',
      description: 'Authorize new staff invitations, manage member access and role assignments.',
      supportedActions: ['view', 'create', 'edit', 'delete', 'approve', 'manage']
    },
    {
      key: 'audit',
      label: 'Activity & Audit Logs',
      description: "Inspect immutable audit log records (the owner's evidence).",
      supportedActions: ['view', 'export']
    }
  ];

  const handleTogglePermission = (module: PermissionModule, action: PermissionAction) => {
    if (selectedRole.isSystemAdmin) return; // Super admin has full access

    const currentModulePerms = selectedRole.permissions[module] || [];
    let updatedModulePerms: PermissionAction[];

    if (currentModulePerms.includes(action)) {
      updatedModulePerms = currentModulePerms.filter((a) => a !== action);
    } else {
      updatedModulePerms = [...currentModulePerms, action];
    }

    const updatedPermissions = {
      ...selectedRole.permissions,
      [module]: updatedModulePerms
    };

    updateRolePermissions(selectedRole.id, updatedPermissions);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleCreateNewRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName) return;

    const newRole = createRole({
      name: newRoleName,
      description: newRoleDesc || 'Custom defined role permissions.',
      color: 'blue',
      isSystemAdmin: false,
      permissions: {
        dashboard: ['view'],
        jobs: ['view', 'edit'],
        inventory: ['view']
      }
    });

    setIsCreatingRole(false);
    setNewRoleName('');
    setNewRoleDesc('');
    setSelectedRoleId(newRole.id);
  };

  const assignedUsers = users.filter((u) => u.roleId === selectedRole.id);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
              User Roles & Permissions Engine
            </h2>
            <Badge variant="purple" size="sm">
              Granular RBAC
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5 max-w-2xl">
            In StarqERP, <strong>Admin is a capability set, not a job title</strong>. Define roles, assign module permissions, and control what actions different user types can execute.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingRole(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Role</span>
        </button>
      </div>

      {/* Entity-mode selector: role profiles, not module navigation. */}
      <div className="w-full max-w-full overflow-x-auto no-scrollbar scrollbar-none pb-2 pt-1">
        <div className="flex items-center gap-2 min-w-max" role="radiogroup" aria-label="Role profile">
          {roles.map((role) => {
            const isSelected = role.id === selectedRole.id;
            const userCount = users.filter((u) => u.roleId === role.id).length;
            const focusRole = (direction: -1 | 1) => {
              const nextIndex = (roles.findIndex((candidate) => candidate.id === role.id) + direction + roles.length) % roles.length;
              setSelectedRoleId(roles[nextIndex].id);
              rolePickerRefs.current[nextIndex]?.focus();
            };
            return (
              <button
                key={role.id}
                ref={(element) => { rolePickerRefs.current[roles.indexOf(role)] = element; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedRoleId(role.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') { event.preventDefault(); focusRole(1); }
                  if (event.key === 'ArrowLeft') { event.preventDefault(); focusRole(-1); }
                  if (event.key === 'Home') { event.preventDefault(); rolePickerRefs.current[0]?.focus(); }
                  if (event.key === 'End') { event.preventDefault(); rolePickerRefs.current[roles.length - 1]?.focus(); }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline-variant)] dark:hover:border-[var(--md-sys-color-outline-variant)]'
                }`}
              >
                {role.isSystemAdmin && <Lock className="w-3.5 h-3.5" />}
                <span>{role.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isSelected
                      ? 'bg-[var(--md-sys-color-surface-container-high)]/20 text-white'
                      : 'bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]'
                  }`}
                >
                  {userCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Definition & Permissions Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-6">
        {/* Role Banner / Details */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                {selectedRole.name}
              </h3>
              {selectedRole.isSystemAdmin ? (
                <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-bold">
                  Unrestricted System Capability
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold">
                  Scoped Role
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
              {selectedRole.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Permissions Saved</span>
              </div>
            )}
            {!selectedRole.isSystemAdmin && (
              <button
                onClick={() => deleteRole(selectedRole.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Role</span>
              </button>
            )}
          </div>
        </div>

        {/* Assigned Users list pill */}
        <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/50 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>Assigned Users ({assignedUsers.length}):</span>
          </span>
          {assignedUsers.length === 0 ? (
            <span className="text-xs text-[var(--md-sys-color-outline)] italic">No users currently assigned</span>
          ) : (
            assignedUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]"
              >
                <span className="font-semibold">{u.name}</span>
                <span className="text-[10px] text-[var(--md-sys-color-outline)]">({u.email})</span>
              </div>
            ))
          )}
        </div>

        {/* Permissions Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 bg-[var(--md-sys-color-surface-container-high)]/30 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                <th className="py-3 px-4 font-bold">Module & Functional Scope</th>
                <th className="py-3 px-3 font-bold text-center">View</th>
                <th className="py-3 px-3 font-bold text-center">Create</th>
                <th className="py-3 px-3 font-bold text-center">Edit</th>
                <th className="py-3 px-3 font-bold text-center">Delete</th>
                <th className="py-3 px-3 font-bold text-center">Approve</th>
                <th className="py-3 px-3 font-bold text-center">Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {modulesList.map((mod) => {
                const isSuper = selectedRole.isSystemAdmin;
                const grantedActions = selectedRole.permissions[mod.key] || [];

                return (
                  <tr
                    key={mod.key}
                    className="hover:bg-[var(--md-sys-color-surface-container-low)]/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                        {mod.label}
                      </div>
                      <div className="text-[11px] text-[var(--md-sys-color-outline)] dark:text-[var(--md-sys-color-on-surface-variant)]">
                        {mod.description}
                      </div>
                    </td>

                    {(['view', 'create', 'edit', 'delete', 'approve', 'export'] as PermissionAction[]).map(
                      (act) => {
                        const isSupported = mod.supportedActions.includes(act);
                        const isGranted = isSuper || grantedActions.includes(act) || grantedActions.includes('manage');

                        if (!isSupported) {
                          return (
                            <td key={act} className="py-3 px-3 text-center text-slate-300 dark:text-[var(--md-sys-color-on-surface)]">
                              -
                            </td>
                          );
                        }

                        return (
                          <td key={act} className="py-3 px-3 text-center">
                            <button
                              type="button"
                              disabled={isSuper}
                              onClick={() => handleTogglePermission(mod.key, act)}
                              className={`w-6 h-6 rounded-lg inline-flex items-center justify-center transition-all ${
                                isGranted
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-slate-300 dark:text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] dark:hover:bg-slate-700'
                              } ${isSuper ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                              title={
                                isSuper
                                  ? 'Super Admin has all capabilities unlocked'
                                  : `Toggle ${act} on ${mod.label}`
                              }
                            >
                              {isGranted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </button>
                          </td>
                        );
                      }
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Custom Role */}
      {isCreatingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] pb-3">
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                Create New Role Profile
              </h3>
              <button
                onClick={() => setIsCreatingRole(false)}
                className="text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewRole} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Paint Booth Operator, Doctor, Storekeeper"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Role Description
                </label>
                <textarea
                  rows={2}
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Briefly describe what this role is authorized to perform..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingRole(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
