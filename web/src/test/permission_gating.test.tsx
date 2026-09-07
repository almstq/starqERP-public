import { describe, it, expect } from 'vitest';
import { UserRole, AppUser, PermissionModule, PermissionAction } from '../types/erp';

describe('RBAC & Permission Gating Tests (SERP-195 / SERP-163 / SERP-197)', () => {
  const adminRole: UserRole = {
    id: 'role-admin',
    tenantId: 'tenant-1',
    name: 'Admin / Owner',
    description: 'Full administrative access',
    color: 'purple',
    isSystemAdmin: true,
    permissions: {
      dashboard: ['view', 'export'],
      jobs: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      invoices: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      payments: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      inventory: ['view', 'create', 'edit', 'delete', 'manage', 'export'],
      purchasing: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      expenses: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
      suppliers: ['view', 'create', 'edit', 'delete', 'export'],
      reports: ['view', 'export'],
      audit: ['view', 'export'],
      workflows: ['view', 'edit', 'manage'],
      roles: ['view', 'create', 'edit', 'delete', 'manage'],
      users: ['view', 'create', 'edit', 'delete', 'approve', 'manage'],
      settings: ['view', 'edit', 'manage'],
    }
  };

  const technicianRole: UserRole = {
    id: 'role-tech',
    tenantId: 'tenant-1',
    name: 'Technician',
    description: 'Workshop floor technician',
    color: 'emerald',
    isSystemAdmin: false,
    permissions: {
      dashboard: ['view'],
      jobs: ['view', 'edit'],
      inventory: ['view'],
    }
  };

  const activeAdmin: AppUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Ali Mushthaq',
    email: 'ali@starq.io',
    phone: '7774356',
    roleId: 'role-admin',
    roleName: 'Admin / Owner',
    status: 'Active',
    invitedAt: '2026-08-01',
    authorizedBy: 'Founder',
    authorizedAt: '2026-08-01 00:00',
    lastActiveAt: 'Active now'
  };

  const activeTechnician: AppUser = {
    id: 'user-2',
    tenantId: 'tenant-1',
    name: 'Ahmed Farish',
    email: 'farish@ignition.mv',
    phone: '7771234',
    roleId: 'role-tech',
    roleName: 'Technician',
    status: 'Active',
    invitedAt: '2026-08-10',
    authorizedBy: 'Ali Mushthaq',
    authorizedAt: '2026-08-10 09:00',
    lastActiveAt: 'Active now'
  };

  const pendingUser: AppUser = {
    id: 'user-3',
    tenantId: 'tenant-1',
    name: 'New Trainee',
    email: 'trainee@ignition.mv',
    phone: '7779999',
    roleId: 'role-tech',
    roleName: 'Technician',
    status: 'Pending Approval',
    invitedAt: '2026-08-25',
    lastActiveAt: 'Just signed in'
  };

  function evaluateUserPermission(
    user: AppUser,
    roles: UserRole[],
    module: PermissionModule,
    action: PermissionAction = 'view'
  ): boolean {
    if (user.status !== 'Active') return false;
    const role = roles.find((r) => r.id === user.roleId);
    if (!role) return false;
    if (role.isSystemAdmin) return true;

    const modulePerms = role.permissions[module];
    if (!modulePerms) return false;
    return modulePerms.includes(action) || modulePerms.includes('manage');
  }

  it('allows active admin to view and edit invoices', () => {
    const canView = evaluateUserPermission(activeAdmin, [adminRole, technicianRole], 'invoices', 'view');
    const canCreate = evaluateUserPermission(activeAdmin, [adminRole, technicianRole], 'invoices', 'create');
    expect(canView).toBe(true);
    expect(canCreate).toBe(true);
  });

  it('prohibits technician from creating or deleting invoices', () => {
    const canView = evaluateUserPermission(activeTechnician, [adminRole, technicianRole], 'invoices', 'view');
    const canCreate = evaluateUserPermission(activeTechnician, [adminRole, technicianRole], 'invoices', 'create');
    const canDelete = evaluateUserPermission(activeTechnician, [adminRole, technicianRole], 'invoices', 'delete');
    expect(canView).toBe(false);
    expect(canCreate).toBe(false);
    expect(canDelete).toBe(false);
  });

  it('allows technician to view and edit jobs on the workshop floor', () => {
    const canViewJobs = evaluateUserPermission(activeTechnician, [adminRole, technicianRole], 'jobs', 'view');
    const canEditJobs = evaluateUserPermission(activeTechnician, [adminRole, technicianRole], 'jobs', 'edit');
    expect(canViewJobs).toBe(true);
    expect(canEditJobs).toBe(true);
  });

  it('strictly refuses all permissions for users in Pending Approval state', () => {
    const canViewDash = evaluateUserPermission(pendingUser, [adminRole, technicianRole], 'dashboard', 'view');
    const canViewJobs = evaluateUserPermission(pendingUser, [adminRole, technicianRole], 'jobs', 'view');
    expect(canViewDash).toBe(false);
    expect(canViewJobs).toBe(false);
  });
});
