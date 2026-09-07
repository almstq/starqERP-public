import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Phone,
  RotateCw,
  Ban,
  ShieldAlert,
  Send,
  X,
  BookOpen
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';

export const UsersManagementTab: React.FC = () => {
  const {
    users,
    roles,
    invitations,
    inviteStaffMember,
    resendInvitation,
    revokeInvitation,
    suspendUser,
    authorizeUser,
    updateUserRole,
    currentUser,
    switchCurrentUser,
    openMfaEnrollment,
    currentTenant
  } = useERP();
  const books = currentTenant?.books || [];

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('+960 ');
  const [inviteRole, setInviteRole] = useState(roles[1]?.id || 'role-manager');
  const [inviteTitle, setInviteTitle] = useState('');
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const tenantUsers = users.filter((u) => u.tenantId === currentTenant.id || !u.tenantId);
  const activeUsers = tenantUsers.filter((u) => u.status === 'Active');
  const suspendedUsers = tenantUsers.filter((u) => u.status === 'Suspended');
  const pendingInvitations = invitations.filter((i) => (i.organisation_id === currentTenant.id || !i.organisation_id) && i.status === 'pending');

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await inviteStaffMember({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        phone: invitePhone.trim(),
        role_id: inviteRole,
        job_title: inviteTitle.trim() || undefined,
        book_ids: selectedBooks.length > 0 ? selectedBooks : undefined
      });

      setInviteSuccess(true);
      setTimeout(() => {
        setInviteSuccess(false);
        setIsInviteOpen(false);
        setInviteName('');
        setInviteEmail('');
        setInviteTitle('');
        setSelectedBooks([]);
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create staff invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateDaysRemaining = (expiresAt: string) => {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expired';
    if (days === 1) return 'Expires today';
    return `Expires in ${days} days`;
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
              Users & Staff Authorizations
            </h2>
            <Badge variant="blue" size="sm">
              Google Identity Bound
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5 max-w-2xl">
            Invite staff members by their verified Google account email. Upon sign-in, membership and assigned operating book/location scopes activate automatically.
          </p>
        </div>

        <button
          onClick={() => setIsInviteOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Staff Member</span>
        </button>
      </div>

      {/* Tenant Authority Callout */}
      <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]/60 text-xs flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
            Tenant Authority Boundary
          </span>
          <p className="text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-[11px] leading-relaxed">
            Roles assigned here (including <strong>Super Administrator</strong> and <strong>Managing Director</strong>) grant authority strictly within <em>{currentTenant?.name || 'this organization'}</em>. Platform control operations (Starq HQ) require an independent platform operator entitlement.
          </p>
        </div>
      </div>

      {/* PENDING & SENT INVITATIONS QUEUE */}
      {pendingInvitations.length > 0 && (
        <div className="p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/50 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-blue-900 dark:text-blue-100">
                  Pending Staff Invitations ({pendingInvitations.length})
                </h3>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/70">
                  Awaiting sign-in with verified Google Workspace or personal identity
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-800 dark:text-blue-200 text-xs font-black uppercase tracking-wider">
              Active Invites
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container)] border border-blue-200/70 dark:border-blue-900/60 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-sm">
                      {inv.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                        {inv.name}
                      </div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-[var(--md-sys-color-outline)]" />
                        <span className="font-mono">{inv.email}</span>
                      </div>
                      {inv.phone && (
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-[var(--md-sys-color-outline)]" />
                          <span className="font-mono">{inv.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-[10px] font-bold">
                    {calculateDaysRemaining(inv.expires_at)}
                  </span>
                </div>

                <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] min-w-0">
                    <span className="text-[11px] whitespace-nowrap">Assigned Role:</span>
                    <span className="font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] capitalize">
                      {roles.find((r) => r.id === inv.role_id)?.name || inv.role_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => resendInvitation(inv.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] dark:hover:bg-slate-700 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] text-xs font-semibold transition-colors cursor-pointer"
                      title="Resend invitation and refresh 7-day expiration"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Resend</span>
                    </button>
                    <button
                      onClick={() => revokeInvitation(inv.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
                      title="Revoke pending invitation"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE TEAM MEMBERS LIST */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">
              Active Team Members ({activeUsers.length})
            </h3>
          </div>
          <span className="text-xs text-[var(--md-sys-color-outline)]">
            Active memberships with book-level isolation
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">User & Contact</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Assigned Role</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Job Title</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Last Active</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeUsers.map((user) => {
                const isCurrent = user.id === currentUser.id;
                return (
                  <tr
                    key={user.id}
                    className="hover:bg-[var(--md-sys-color-surface-container-low)]/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                            <span>{user.name}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--md-sys-color-outline)] flex items-center gap-2">
                            <span className="font-mono">{user.email}</span>
                            {user.phone && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{user.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <select
                        value={user.roleId}
                        onChange={(e) => updateUserRole(user.id, e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-xs whitespace-nowrap">
                      {user.jobTitle || 'Team Member'}
                    </td>

                    <td className="py-3 px-3 text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-[11px] whitespace-nowrap">
                      {user.lastActiveAt || 'Active Session'}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {Boolean(import.meta.env.DEV) && (
                          <button
                            onClick={() => switchCurrentUser(user.id)}
                            className="px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] dark:hover:bg-slate-700 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] font-semibold text-[11px] transition-colors whitespace-nowrap cursor-pointer"
                            title="[DEV ONLY] Switch active user session to test role UI gating"
                          >
                            Simulate User
                          </button>
                        )}
                        {user.id !== 'user-1' && user.id !== 'user-ignition-owner' && (
                          <button
                            onClick={() => suspendUser(user.id)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                            title="Suspend user access"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUSPENDED USERS */}
      {suspendedUsers.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] uppercase tracking-wider">
            <XCircle className="w-4 h-4 text-rose-500" />
            <span>Suspended / Withdrawn Access ({suspendedUsers.length})</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {suspendedUsers.map((user) => (
              <div
                key={user.id}
                className="py-3 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                    {user.name}
                  </span>
                  <span className="text-[var(--md-sys-color-outline)] ml-2">({user.email})</span>
                  <span className="text-rose-500 text-[10px] ml-2 font-semibold">
                    Access Withdrawn
                  </span>
                </div>

                <button
                  onClick={() => authorizeUser(user.id, user.roleId)}
                  className="px-3 py-1 rounded-lg bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] font-semibold text-[11px] cursor-pointer"
                >
                  Restore Access
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  Invite Staff Member
                </h3>
              </div>
              <button
                onClick={() => setIsInviteOpen(false)}
                className="text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inviteSuccess ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] text-sm">
                  Staff Invitation Dispatched!
                </h4>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  A 7-day activation token was generated. Access will bind upon Google sign-in.
                </p>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs">
                    {errorMessage}
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Mariyam Nazim"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Verified Google Identity Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="e.g. nazim@starqtech.com or nazim@gmail.com"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                      Maldives Mobile
                    </label>
                    <input
                      type="text"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="+960 778-0000"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                      Operational Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Job Title / Organizational Position
                  </label>
                  <input
                    type="text"
                    value={inviteTitle}
                    onChange={(e) => setInviteTitle(e.target.value)}
                    placeholder="e.g. Operations Coordinator / Finance Officer"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Operating Books Scope */}
                {books && books.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                      Operating Book Scopes
                    </label>
                    <div className="p-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] space-y-1.5">
                      {books.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 cursor-pointer text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
                          <input
                            type="checkbox"
                            checked={selectedBooks.includes(b.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBooks([...selectedBooks, b.id]);
                              } else {
                                setSelectedBooks(selectedBooks.filter((id) => id !== b.id));
                              }
                            }}
                            className="rounded border-[var(--md-sys-color-outline-variant)] text-blue-600 focus:ring-blue-500"
                          />
                          <BookOpen className="w-3.5 h-3.5 text-[var(--md-sys-color-outline)]" />
                          <span className="font-semibold">[{b.code}] {b.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Sending...' : 'Dispatch Invitation'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
