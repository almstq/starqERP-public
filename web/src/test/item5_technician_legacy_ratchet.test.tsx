import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import * as authService from '../services/auth';
import { UserSession } from '../services/auth';
import { INITIAL_STAFF } from '../data/mockData';

/**
 * Founder Bug Log Item 5 (5 Sep 2026) - ratchet, not the full remediation.
 *
 * Repo reality check (posted to the Operations Room before writing this):
 * the legacy starqBooks garage staff (Ahsan, Nabeel, Sham, Moosa, Fayaz -
 * INITIAL_STAFF in data/mockData.ts) are ALREADY excluded from any
 * authenticated session by SERP-401 (ERPContext.tsx:665,
 * `const [staff] = useState<StaffMember[]>(session ? [] : INITIAL_STAFF)`).
 * That fix existed with no test proving it - this closes that gap.
 *
 * What this test does NOT do: build the actual "onboarded staff become
 * selectable" flow. That requires a staff-listing backend endpoint that does
 * not exist yet (checked: no such route in supabase/functions/starq-api).
 * Building it now under a bug-fix label would be undisclosed scope
 * expansion - flagged on the bus, parked as a separate follow-up.
 */

const activeSession: UserSession = {
  person_id: 'user-item5-active',
  name: 'Test Owner',
  email: 'owner@item5-test.mv',
  seats: ['managing_director'],
  acting_as: 'managing_director',
  seat_label: 'Managing Director',
  csrf: 'csrf-token-item5',
  allowed_entities: ['item5-test-workshop'],
  current_organisation_id: 'org-item5-100',
  current_book_id: 'book-item5-100',
  organisations: [
    {
      id: 'org-item5-100',
      slug: 'item5-test-workshop',
      name: 'Item 5 Test Workshop Pvt Ltd',
      books: [
        {
          id: 'book-item5-100',
          code: 'MAIN',
          name: 'Main Operating Book',
          is_default: true,
          archetype_id: 'automotive_workshop',
        },
      ],
    },
  ],
  platform_entitlement: null,
  application: {
    id: 'app-item5',
    status: 'approved',
    name: 'Item 5 Test Workshop',
    legal_name: 'Item 5 Test Workshop Pvt Ltd',
    created_at: new Date().toISOString(),
  },
} as UserSession;

const StaffProbe: React.FC = () => {
  const { staff } = useERP();
  return (
    <div data-testid="staff-probe">
      count:{staff.length}
      {staff.map((s) => (
        <span key={s.id}>{s.name}</span>
      ))}
    </div>
  );
};

const renderWithSession = (session: UserSession | null) => {
  if (session) {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(session);
  } else {
    vi.spyOn(authService, 'fetchCurrentUser').mockRejectedValue(new Error('no session'));
  }
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ERPProvider>
          <StaffProbe />
        </ERPProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
};

describe('Founder Bug Log Item 5: legacy starqBooks technician list must never reach an authenticated session', () => {
  it('confirms the legacy fixture actually contains the garage names the founder flagged (sanity - proves this test would catch it)', () => {
    const names = INITIAL_STAFF.map((s) => s.name);
    expect(names.some((n) => n.includes('Ahsan'))).toBe(true);
    expect(names.length).toBeGreaterThan(0);
  });

  it('shows an EMPTY staff list for a real, authenticated, approved session', async () => {
    renderWithSession(activeSession);

    await waitFor(() => {
      expect(screen.getByTestId('staff-probe')).toHaveTextContent('count:0');
    });

    for (const legacyStaff of INITIAL_STAFF) {
      expect(screen.queryByText(legacyStaff.name)).toBeNull();
    }
  });

  it('sanity: the demo/no-session path still uses INITIAL_STAFF, so the empty-when-authenticated result above is a real gate, not an accident', async () => {
    renderWithSession(null);

    await waitFor(() => {
      expect(screen.getByTestId('staff-probe')).toHaveTextContent(`count:${INITIAL_STAFF.length}`);
    });
  });
});
