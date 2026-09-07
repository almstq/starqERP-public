import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

describe('AppShell Responsive Mobile Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Material 3 Bottom Navigation Bar with 5 key mobile destinations', () => {
    render(
      <MemoryRouter initialEntries={['/customers']}>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const mobileNav = screen.getByLabelText(/Mobile Bottom Navigation/i);
    expect(mobileNav).toBeInTheDocument();

    // Verify the 5 primary tabs inside the mobile navigation bar
    const navScope = within(mobileNav);
    expect(navScope.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(navScope.getByRole('link', { name: /Orders/i })).toBeInTheDocument();
    expect(navScope.getByRole('link', { name: /Invoices/i })).toBeInTheDocument();
    expect(navScope.getByRole('link', { name: /Customers/i })).toBeInTheDocument();
    expect(navScope.getByRole('button', { name: /More/i })).toBeInTheDocument();
  });

  it('opens the full navigation drawer when "More" or hamburger menu is tapped', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const mobileNav = screen.getByLabelText(/Mobile Bottom Navigation/i);
    const navScope = within(mobileNav);

    // Click "More" button in the bottom navigation bar
    const moreButton = navScope.getByRole('button', { name: /More/i });
    fireEvent.click(moreButton);

    // Verify modal drawer dialog opens
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Verify secondary modules are present in the opened drawer
    const drawerScope = within(dialog);
    expect(drawerScope.getByRole('link', { name: /Inventory/i })).toBeInTheDocument();
    expect(drawerScope.getByRole('link', { name: /Purchasing/i })).toBeInTheDocument();
    expect(drawerScope.getByRole('link', { name: /Suppliers/i })).toBeInTheDocument();
    expect(drawerScope.getByRole('link', { name: /Reports/i })).toBeInTheDocument();
    expect(drawerScope.getByRole('link', { name: /Settings/i })).toBeInTheDocument();

    // Close button dismisses the drawer
    const closeButton = drawerScope.getByLabelText(/Close menu/i);
    fireEvent.click(closeButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('provides a hamburger menu button in the top app bar for compact viewports', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const hamburgerButton = screen.getByLabelText(/Open navigation menu/i);
    expect(hamburgerButton).toBeInTheDocument();

    fireEvent.click(hamburgerButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
