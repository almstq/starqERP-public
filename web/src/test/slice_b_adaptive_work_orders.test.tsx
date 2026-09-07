import { describe, it, expect } from 'vitest';
import React, { useEffect, useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ERPProvider, useERP } from '../context/ERPContext';
import { CreateJobModal } from '../components/jobs/CreateJobModal';
import { NewCustomerModal } from '../components/customers/NewCustomerModal';

describe('Slice B — Adaptive Work Order & Customer Forms', () => {
  it('renders generic Project / Work Order fields when Starq Technologies (non-automotive) is active', () => {
    const TestStarqSetup: React.FC = () => {
      const { setIsCreateJobOpen } = useERP();
      const initRef = useRef(false);
      useEffect(() => {
        if (!initRef.current) {
          initRef.current = true;
          setIsCreateJobOpen(true);
        }
      }, []);

      return <CreateJobModal />;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ERPProvider>
            <TestStarqSetup />
          </ERPProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Modal title & button must be generic Work Order / Deliverables
    expect(screen.getByText('Create New Work Order')).toBeDefined();
    expect(screen.getByText('Create & Schedule Work Order')).toBeDefined();

    // Must have Project & Deliverable Scope block
    expect(screen.getByText('Project & Deliverable Scope')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. STQ-PRJ-2026-01')).toBeDefined();

    // Must NOT have automotive spray booth bays or car plate inputs
    expect(screen.queryByText('Vehicle / Asset Info')).toBeNull();
    expect(screen.queryByPlaceholderText('AB1-8842')).toBeNull();
    expect(screen.queryByText('Spray Booth Bay 1 (Bake Oven)')).toBeNull();
    expect(screen.queryByText('Full Body Repaint')).toBeNull();

    // Must offer neutral service types and facilities
    expect(screen.getByText('Software & Engineering Services')).toBeDefined();
    expect(screen.getByText('Main Studio / Engineering Unit')).toBeDefined();
  });

  it('preserves full automotive flow (car plates, spray booths, paint packages) when Club Ignition is active', () => {
    const TestIgnitionSetup: React.FC = () => {
      const { switchTenant, setIsCreateJobOpen } = useERP();
      const initRef = useRef(false);
      useEffect(() => {
        if (!initRef.current) {
          initRef.current = true;
          switchTenant('tenant-ignition');
          setIsCreateJobOpen(true);
        }
      }, []);

      return <CreateJobModal />;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ERPProvider>
            <TestIgnitionSetup />
          </ERPProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Modal title & button must be automotive
    expect(screen.getByText('Create New Job Order / Work Ticket')).toBeDefined();
    expect(screen.getByText('Create & Assign to Bay')).toBeDefined();

    // Must have automotive vehicle & spray booth fields
    expect(screen.getByText('Vehicle / Asset Info')).toBeDefined();
    expect(screen.getByPlaceholderText('AB1-8842')).toBeDefined();
    expect(screen.getByText('Full Body Repaint')).toBeDefined();
    expect(screen.getByText('Spray Booth Bay 1 (Bake Oven)')).toBeDefined();

    // Must NOT show non-automotive block
    expect(screen.queryByText('Project & Deliverable Scope')).toBeNull();
    expect(screen.queryByPlaceholderText('e.g. STQ-PRJ-2026-01')).toBeNull();
  });

  it('adapts NewCustomerModal: hides vehicle inputs for Starq Technologies and preserves them for Club Ignition', () => {
    const TestStarqCustomer: React.FC = () => {
      const { setIsNewCustomerOpen } = useERP();
      const initRef = useRef(false);
      useEffect(() => {
        if (!initRef.current) {
          initRef.current = true;
          setIsNewCustomerOpen(true);
        }
      }, []);

      return <NewCustomerModal />;
    };

    const { unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <ERPProvider>
            <TestStarqCustomer />
          </ERPProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Under Starq Technologies:
    expect(screen.getByText('Add New Customer')).toBeDefined();
    expect(screen.getByText('Save Customer Profile')).toBeDefined();
    expect(screen.getByText('Notes & Account Instructions')).toBeDefined();

    // Vehicle block must NOT be rendered
    expect(screen.queryByText('Primary Vehicle / Asset Details')).toBeNull();
    expect(screen.queryByPlaceholderText('AB1-8842')).toBeNull();
    expect(screen.queryByText('Vehicle Type')).toBeNull();

    unmount();

    // Now test under Club Ignition:
    const TestIgnitionCustomer: React.FC = () => {
      const { switchTenant, setIsNewCustomerOpen } = useERP();
      const initRef = useRef(false);
      useEffect(() => {
        if (!initRef.current) {
          initRef.current = true;
          switchTenant('tenant-ignition');
          setIsNewCustomerOpen(true);
        }
      }, []);

      return <NewCustomerModal />;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ERPProvider>
            <TestIgnitionCustomer />
          </ERPProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Under Club Ignition:
    expect(screen.getByText('Add New Customer & Vehicle')).toBeDefined();
    expect(screen.getByText('Notes & Garage Preferences')).toBeDefined();
    expect(screen.getByText('Primary Vehicle / Asset Details')).toBeDefined();
    expect(screen.getByPlaceholderText('AB1-8842')).toBeDefined();
  });
});
