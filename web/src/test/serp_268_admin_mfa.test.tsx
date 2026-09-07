import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { MfaSetupModal } from '../components/auth/MfaSetupModal';
import { MfaChallengeModal } from '../components/auth/MfaChallengeModal';

const MfaTestHarness: React.FC = () => {
  const {
    currentUser,
    users,
    setUsers,
    switchCurrentUser,
    authorizeUser,
    isMfaElevated,
    openMfaEnrollment,
    openMfaChallenge,
    enrollMfa,
    verifyMfaChallenge,
    requireMfaElevation,
  } = useERP();

  React.useEffect(() => {
    if (!users.some((u) => u.id === 'user-2')) {
      setUsers((prev) => [
        ...prev,
        {
          id: 'user-2',
          tenantId: 'tenant-starq',
          name: 'Test Staff',
          email: 'staff@starq.test',
          roleId: 'role-accountant',
          roleName: 'Staff Accountant',
          status: 'Active',
          mfaEnabled: false,
          mfaRequired: false,
          permissions: ['accounting.read', 'accounting.write'],
        } as any,
      ]);
    }
  }, [users, setUsers]);

  const [privilegedActionExecuted, setPrivilegedActionExecuted] = React.useState(false);

  return (
    <div>
      <div data-testid="current-user-id">{currentUser.id}</div>
      <div data-testid="current-user-name">{currentUser.name}</div>
      <div data-testid="current-user-role">{currentUser.roleName}</div>
      <div data-testid="current-user-mfa-enabled">{String(currentUser.mfaEnabled || false)}</div>
      <div data-testid="current-user-mfa-required">{String(currentUser.mfaRequired || false)}</div>
      <div data-testid="is-mfa-elevated">{String(isMfaElevated)}</div>
      <div data-testid="recovery-codes-count">{currentUser.recoveryCodes?.length || 0}</div>
      <div data-testid="privileged-action-status">{String(privilegedActionExecuted)}</div>

      <button onClick={openMfaEnrollment} data-testid="btn-open-enrollment">
        Open Enrollment Modal
      </button>
      <button onClick={() => openMfaChallenge()} data-testid="btn-open-challenge">
        Open Challenge Modal
      </button>
      <button
        onClick={() => {
          requireMfaElevation(() => {
            setPrivilegedActionExecuted(true);
          });
        }}
        data-testid="btn-trigger-privileged-action"
      >
        Trigger Privileged Action
      </button>

      {users.map((u) => (
        <button key={u.id} onClick={() => switchCurrentUser(u.id)} data-testid={`btn-switch-${u.id}`}>
          Switch to {u.name}
        </button>
      ))}

      {/* Target Pending user authorization button */}
      <button
        onClick={() => {
          requireMfaElevation(() => {
            authorizeUser('user-pending-1');
          });
        }}
        data-testid="btn-authorize-pending"
      >
        Authorize Pending User
      </button>

      <MfaSetupModal />
      <MfaChallengeModal />
    </div>
  );
};

describe('SERP-268: Privileged & Administrator MFA Security Boundary', () => {
  it('enforces MFA requirement on Super Administrator account', () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <MfaTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId('current-user-id').textContent).toBe('user-1');
    expect(screen.getByTestId('current-user-mfa-required').textContent).toBe('true');
  });

  it('completes the 3-step MFA enrollment workflow and generates recovery keys', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <MfaTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Switch to user-2 (Accountant, un-enrolled)
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-switch-user-2'));
    });

    expect(screen.getByTestId('current-user-mfa-enabled').textContent).toBe('false');

    // Open enrollment modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-open-enrollment'));
    });

    expect(screen.getByTestId('mfa-setup-modal')).toBeDefined();

    // Step 1 -> Continue
    const step1Btn = screen.getByRole('button', { name: /Continue to Recovery Codes/i });
    await act(async () => {
      fireEvent.click(step1Btn);
    });

    // Step 2 -> Confirm & Verify
    const step2Btn = screen.getByRole('button', { name: /Confirm & Verify Code/i });
    await act(async () => {
      fireEvent.click(step2Btn);
    });

    // Step 3 -> Enter 6-digit TOTP
    const codeInput = screen.getByTestId('mfa-verification-input');
    await act(async () => {
      fireEvent.change(codeInput, { target: { value: '123456' } });
    });

    const submitBtn = screen.getByTestId('mfa-enroll-submit-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Verify user-2 is now enrolled in MFA with 8 recovery codes
    expect(screen.getByTestId('current-user-mfa-enabled').textContent).toBe('true');
    expect(screen.getByTestId('recovery-codes-count').textContent).toBe('8');
  });

  it('demands MFA challenge before allowing privileged action on un-elevated admin session', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <MfaTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Switch to user-1 (Admin) -> sets isMfaElevated to false on persona switch
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-switch-user-1'));
    });

    expect(screen.getByTestId('is-mfa-elevated').textContent).toBe('false');

    // Trigger privileged action -> opens MFA challenge modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-trigger-privileged-action'));
    });

    expect(screen.getByTestId('mfa-challenge-modal')).toBeDefined();
    expect(screen.getByTestId('privileged-action-status').textContent).toBe('false');

    // Enter valid 6-digit TOTP
    const challengeInput = screen.getByTestId('mfa-challenge-input');
    await act(async () => {
      fireEvent.change(challengeInput, { target: { value: '123456' } });
    });

    const submitChallenge = screen.getByTestId('mfa-challenge-submit-button');
    await act(async () => {
      fireEvent.click(submitChallenge);
    });

    // Elevation granted and queued privileged action executed
    expect(screen.getByTestId('is-mfa-elevated').textContent).toBe('true');
    expect(screen.getByTestId('privileged-action-status').textContent).toBe('true');
  });

  it('allows elevating with single-use emergency recovery code and consumes it', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <MfaTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Switch to user-1
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-switch-user-1'));
    });

    const initialCodesCount = Number(screen.getByTestId('recovery-codes-count').textContent);
    expect(initialCodesCount).toBeGreaterThan(0);

    // Trigger privileged action
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-trigger-privileged-action'));
    });

    // Switch to recovery mode in modal
    const toggleRecoveryBtn = screen.getByRole('button', { name: /Lost Device\? Use Recovery Code/i });
    await act(async () => {
      fireEvent.click(toggleRecoveryBtn);
    });

    // Submit valid recovery code
    const challengeInput = screen.getByTestId('mfa-challenge-input');
    await act(async () => {
      fireEvent.change(challengeInput, { target: { value: 'DEMO-RECOVERY-CODE-01' } });
    });

    const submitChallenge = screen.getByTestId('mfa-challenge-submit-button');
    await act(async () => {
      fireEvent.click(submitChallenge);
    });

    // Elevated, action performed, and recovery code count decremented by 1
    expect(screen.getByTestId('is-mfa-elevated').textContent).toBe('true');
    expect(screen.getByTestId('privileged-action-status').textContent).toBe('true');
    expect(Number(screen.getByTestId('recovery-codes-count').textContent)).toBe(initialCodesCount - 1);
  });

  it('rejects invalid or expired MFA tokens', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <MfaTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-switch-user-1'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-trigger-privileged-action'));
    });

    const challengeInput = screen.getByTestId('mfa-challenge-input');
    await act(async () => {
      fireEvent.change(challengeInput, { target: { value: '000001' } }); // invalid test code
    });

    const submitChallenge = screen.getByTestId('mfa-challenge-submit-button');
    await act(async () => {
      fireEvent.click(submitChallenge);
    });

    // Rejection: stays un-elevated, action not executed, error message displayed
    expect(screen.getByTestId('is-mfa-elevated').textContent).toBe('false');
    expect(screen.getByTestId('privileged-action-status').textContent).toBe('false');
    expect(screen.getByText(/Invalid or expired authentication code/i)).toBeDefined();
  });
});
