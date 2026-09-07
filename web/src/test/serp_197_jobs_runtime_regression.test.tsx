import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { CreateJobModal } from '../components/jobs/CreateJobModal';
import { WorkflowStepRail } from '../components/jobs/WorkflowStepRail';
import { JobsView } from '../components/jobs/JobsView';

// Helper component that opens CreateJobModal programmatically for testing
const TestModalHarness: React.FC = () => {
  const { setIsCreateJobOpen } = useERP();
  React.useEffect(() => {
    setIsCreateJobOpen(true);
  }, [setIsCreateJobOpen]);

  return <CreateJobModal />;
};

describe('SERP-197 / SERP-145: Jobs Runtime & CreateJobModal Permission Contract Regression', () => {
  it('mounts and renders JobsView without throwing TypeError: permissions.includes is not a function', () => {
    expect(() => {
      render(
        <MemoryRouter>
          <ERPProvider>
            <JobsView />
          </ERPProvider>
        </MemoryRouter>
      );
    }).not.toThrow();

    // Verify key elements render
    expect(screen.getByText(/Delivery Pipeline/i)).toBeDefined();
    expect(screen.getByText(/Dynamic pipeline/i)).toBeDefined();
  });

  it('renders WorkflowStepRail for all 13 canonical steps without data-shape errors', () => {
    expect(() => {
      render(
        <MemoryRouter>
          <ERPProvider>
            <WorkflowStepRail currentStatus="Vehicle Intake & Inspection" />
          </ERPProvider>
        </MemoryRouter>
      );
    }).not.toThrow();

    expect(screen.getByText(/Work Order Journey \(13-Step Pipeline\)/i)).toBeDefined();
  });

  it('opens CreateJobModal and correctly renders action buttons with active admin credentials', () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <TestModalHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Modal title should be present
    expect(screen.getByText(/Create New (Job Order \/ Work Ticket|Work Order)/i)).toBeDefined();
    
    // Action button should be enabled for active admin
    const submitBtn = screen.getByText(/Create (& Assign to Bay|& Schedule Work Order)/i);
    expect(submitBtn).toBeDefined();
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('SERP-151: displays administrator role assignment guidance and removes misleading self-switch instructions', () => {
    // Non-admin harness testing WorkflowStepRail for an intake step where user with role-member is logged in
    const NonAdminHarness: React.FC = () => {
      const { switchCurrentUser, setUsers } = useERP();
      React.useEffect(() => {
        setUsers((prev) => [
          ...prev,
          {
            id: 'user-7',
            tenantId: 'tenant-starq',
            name: 'Test Member',
            email: 'member@starq.test',
            roleId: 'role-member',
            roleName: 'Member',
            status: 'Active',
            permissions: [],
          } as any,
        ]);
        switchCurrentUser('user-7');
      }, [switchCurrentUser, setUsers]);

      return <WorkflowStepRail currentStatus="Vehicle Intake & Inspection" />;
    };

    render(
      <MemoryRouter>
        <ERPProvider>
          <NonAdminHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Verify the lock banner shows administrator guidance instead of self-switch instructions
    expect(screen.getByText(/Ask an administrator to assign the required role/i)).toBeDefined();
    expect(screen.queryByText(/Switch acting-as seat/i)).toBeNull();
  });
});

