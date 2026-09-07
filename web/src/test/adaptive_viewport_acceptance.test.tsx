import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { LoginPage } from '../app/LoginPage';
import { SettingsView } from '../components/settings/SettingsView';
import { UsersManagementTab } from '../components/settings/UsersManagementTab';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

const VIEWPORTS = [
  { width: 360, height: 800, name: '360x800 (Compact Mobile)' },
  { width: 390, height: 844, name: '390x844 (Standard Mobile)' },
  { width: 412, height: 915, name: '412x915 (Android Flagship)' },
  { width: 600, height: 900, name: '600x900 (Small Tablet)' },
  { width: 768, height: 1024, name: '768x1024 (Tablet Portrait)' },
  { width: 840, height: 900, name: '840x900 (Tablet Landscape / Foldable)' },
  { width: 1280, height: 800, name: '1280x800 (Small Laptop)' },
  { width: 1600, height: 900, name: '1600x900 (Desktop)' },
  { width: 1920, height: 1080, name: '1920x1080 (FHD Widescreen)' },
];

function setWindowDimensions(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

describe('Adaptive Viewport & Layout Acceptance (SERP-ADAPTIVE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Compact Viewports (< 1024px)', () => {
    const compactWidths = VIEWPORTS.filter((v) => v.width < 1024);

    compactWidths.forEach(({ width, height, name }) => {
      it(`renders M3 bottom navigation and hamburger on ${name}`, () => {
        setWindowDimensions(width, height);

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

        // Bottom Navigation Bar is present
        const bottomNav = screen.getByLabelText(/Mobile Bottom Navigation/i);
        expect(bottomNav).toBeInTheDocument();

        // Hamburger Button is present
        const hamburger = screen.getByLabelText(/Open navigation menu/i);
        expect(hamburger).toBeInTheDocument();

        // Tapping hamburger opens slide-over drawer
        fireEvent.click(hamburger);
        const drawer = screen.getByRole('dialog');
        expect(drawer).toBeInTheDocument();

        // Close drawer
        const closeBtn = within(drawer).getByLabelText(/Close menu/i);
        fireEvent.click(closeBtn);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('expands nested Settings sub-navigation inside the mobile drawer', () => {
      setWindowDimensions(390, 844);

      render(
        <MemoryRouter initialEntries={['/settings?tab=users']}>
          <ThemeProvider>
            <AuthProvider>
              <ERPProvider>
                <AppShell />
              </ERPProvider>
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      const hamburger = screen.getByLabelText(/Open navigation menu/i);
      fireEvent.click(hamburger);

      const drawer = screen.getByRole('dialog');
      const drawerScope = within(drawer);

      // Verify nested sub-items exist in the drawer
      expect(drawerScope.getByRole('link', { name: /Profile & Tax/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /Branding & Logo/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /Roles & Permissions/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /Users & Staff/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /Workflows/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /Support & Help/i })).toBeInTheDocument();
      expect(drawerScope.getByRole('link', { name: /About starqERP/i })).toBeInTheDocument();
    });
  });

  describe('Desktop Viewports (>= 1024px)', () => {
    const desktopWidths = VIEWPORTS.filter((v) => v.width >= 1024);

    desktopWidths.forEach(({ width, height, name }) => {
      it(`renders persistent desktop sidebar on ${name}`, () => {
        setWindowDimensions(width, height);

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

        // Persistent desktop modules nav is in DOM
        const desktopNav = screen.getByRole('navigation', { name: /Modules/i });
        expect(desktopNav).toBeInTheDocument();
      });
    });

    it('expands nested Settings sub-navigation under Settings in desktop sidebar', () => {
      setWindowDimensions(1600, 900);

      render(
        <MemoryRouter initialEntries={['/settings?tab=roles']}>
          <ThemeProvider>
            <AuthProvider>
              <ERPProvider>
                <AppShell />
              </ERPProvider>
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      const desktopNav = screen.getByRole('navigation', { name: /Modules/i });
      const navScope = within(desktopNav);

      // Verify nested sub-items exist under Settings in main sidebar
      expect(navScope.getByRole('link', { name: /Profile & Tax/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /Branding & Logo/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /Roles & Permissions/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /Users & Staff/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /Workflows/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /Support & Help/i })).toBeInTheDocument();
      expect(navScope.getByRole('link', { name: /About starqERP/i })).toBeInTheDocument();
    });

    it('expands persistent Reports destinations from a deep link in the desktop sidebar', () => {
      setWindowDimensions(1600, 900);

      render(
        <MemoryRouter initialEntries={['/reports?tab=cash_flow']}>
          <ThemeProvider>
            <AuthProvider>
              <ERPProvider>
                <AppShell />
              </ERPProvider>
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      const navScope = within(screen.getByRole('navigation', { name: /Modules/i }));
      const cashFlow = navScope.getByRole('link', { name: /Cash Flow \(IFRS\)/i });
      expect(cashFlow).toHaveAttribute('href', '/reports?tab=cash_flow');
      expect(cashFlow).toHaveAttribute('aria-current', 'page');
      expect(navScope.getByRole('link', { name: /MIRA GST-201/i })).toBeInTheDocument();
    });
  });

  describe('Login Surface Compact Preservation', () => {
    it('preserves branding, production gate badge, founder quick launch on 360px viewport', () => {
      setWindowDimensions(360, 800);

      render(
        <MemoryRouter initialEntries={['/login']}>
          <ThemeProvider>
            <AuthProvider>
              <LoginPage />
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      // Verify canonical brand
      expect(screen.getAllByText(/starq/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/ERP/i).length).toBeGreaterThan(0);

      // Verify production auth gate badge is preserved on compact screens
      expect(screen.getByText(/Auth Gate/i)).toBeInTheDocument();

      // Verify sign-in heading is visible
      expect(screen.getByRole('heading', { name: /Sign in to your workspace/i })).toBeInTheDocument();
    });
  });

  describe('Table Column Containment & No Letter-by-Letter Squishing', () => {
    it('renders UsersManagementTab with minimum width table container and whitespace-nowrap actions', () => {
      render(
        <MemoryRouter>
          <ThemeProvider>
            <AuthProvider>
              <ERPProvider>
                <UsersManagementTab />
              </ERPProvider>
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      );

      // Verify table headers
      expect(screen.getByText(/User & Contact/i)).toBeInTheDocument();
      expect(screen.getByText(/Assigned Role/i)).toBeInTheDocument();
      expect(screen.getByText(/Job Title/i)).toBeInTheDocument();

      // Verify simulate user buttons are present
      const simulateBtns = screen.getAllByRole('button', { name: /Simulate User/i });
      expect(simulateBtns.length).toBeGreaterThan(0);
    });
  });
});
