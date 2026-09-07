import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiraTgstView } from '../components/tax/MiraTgstView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-319: MIRA Tourism GST (16%) & Green Tax Interface', () => {
  it('shows the filing HOLD and prevents Print Schedule while retaining calculation cards', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<AuthProvider><ERPProvider><MiraTgstView /></ERPProvider></AuthProvider>);
    expect(screen.getByRole('status').textContent).toContain('do not file');
    const button = screen.getByRole('button', { name: 'Print Schedule' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText('16% TGST Output Tax')).toBeDefined();
    print.mockRestore();
  });

  it('renders official 16% TGST and Green Tax KPI cards and Guest Register', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <MiraTgstView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('MIRA Tourism GST (16%) & Green Tax')).toBeDefined();
    expect(screen.getByText('16% TGST Output Tax')).toBeDefined();
    expect(screen.getByText('Green Tax Payable')).toBeDefined();
    expect(screen.getByText(/Green Tax Guest Stays Register/)).toBeDefined();
    expect(screen.getByText('Alexander Wright')).toBeDefined();
  });

  it('opens Record Guest Stay modal and adds a new guest to the Green Tax register', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <MiraTgstView />
        </ERPProvider>
      </AuthProvider>
    );

    const addBtn = screen.getByText('Add Guest Stay');
    fireEvent.click(addBtn);

    expect(screen.getByText(/Record Guest Stay/)).toBeDefined();

    // Fill form
    const nameInput = screen.getByPlaceholderText('e.g. Charlotte Dupont');
    const passInput = screen.getByPlaceholderText('e.g. FR9901923');

    fireEvent.change(nameInput, { target: { value: 'Charlotte Dupont' } });
    fireEvent.change(passInput, { target: { value: 'FR9901923' } });

    const submitBtn = screen.getByText('Add Guest Record');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Charlotte Dupont')).toBeDefined();
    expect(screen.getByText('FR9901923')).toBeDefined();
  });

  it('triggers Post GL Tax Provision journal dispatch callback', () => {
    const onAddJournalMock = vi.fn();
    window.alert = vi.fn();

    render(
      <AuthProvider>
        <ERPProvider>
          <MiraTgstView onAddJournalEntry={onAddJournalMock} />
        </ERPProvider>
      </AuthProvider>
    );

    const postBtn = screen.getByText('Post GL Tax Provision');
    fireEvent.click(postBtn);

    expect(onAddJournalMock).toHaveBeenCalled();
    const createdJe = onAddJournalMock.mock.calls[0][0];
    expect(createdJe.isBalanced).toBe(true);
    expect(createdJe.lines[1].accountCode).toBe('2123'); // Green Tax Payable (MIRA)
  });
});
