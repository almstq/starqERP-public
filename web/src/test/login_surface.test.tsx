import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../app/LoginPage';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import * as authService from '../services/auth';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock auth service
vi.mock('../services/auth', () => ({
  loginWithGoogle: vi.fn(),
  fetchCurrentUser: vi.fn().mockResolvedValue(null),
  logout: vi.fn().mockResolvedValue(undefined),
  switchSeat: vi.fn().mockResolvedValue(null),
}));

describe('LoginPage Material 3 Real Google Auth Surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders canonical starqERP brand lockup and company attribution', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Assert canonical brand elements
    const starqElements = screen.getAllByText('starq');
    expect(starqElements.length).toBeGreaterThan(0);

    const erpTags = screen.getAllByText('ERP');
    expect(erpTags.length).toBeGreaterThan(0);

    // Assert company legal attribution
    expect(screen.getByText(/Starq Technologies Pvt Ltd/i)).toBeInTheDocument();

    // Verify forbidden brand variants are NOT present
    expect(screen.queryByText(/^Starq ERP$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^STARQ ERP$/)).not.toBeInTheDocument();
  });

  it('renders Material 3 theme selector and accessible appearance controls', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Appearance control in top utility strip
    expect(screen.getByLabelText(/Theme:/i)).toBeInTheDocument();
    expect(screen.getByText(/Appearance/i)).toBeInTheDocument();
  });

  it('preserves production authentication gate badge on mobile viewports', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Auth Gate/i)).toBeInTheDocument();
  });

  it('renders Google Sign-In button container and handles GIS initialization', async () => {
    let callbackHandler: ((res: { credential?: string }) => void) | undefined;
    const mockInitialize = vi.fn().mockImplementation((config) => {
      callbackHandler = config.callback;
    });
    const mockRenderButton = vi.fn();

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          renderButton: mockRenderButton,
          prompt: vi.fn(),
        },
      },
    };

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockRenderButton).toHaveBeenCalled();
    });
  });

  it('processes real Google identity credential through backend and logs in', async () => {
    let callbackHandler: ((res: { credential?: string }) => Promise<void>) | undefined;
    const mockInitialize = vi.fn().mockImplementation((config) => {
      callbackHandler = config.callback;
    });
    const mockRenderButton = vi.fn();

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          renderButton: mockRenderButton,
          prompt: vi.fn(),
        },
      },
    };

    const mockUserSession = {
      person_id: 'person-ali',
      name: 'Ali Musthaq',
      seats: ['seat-super-admin'],
      acting_as: 'seat-super-admin',
      seat_label: 'Super Administrator',
      csrf: 'test-csrf-token',
      allowed_entities: ['starq', 'club-ignition', 'group', 'CI'],
    };

    vi.mocked(authService.loginWithGoogle).mockResolvedValueOnce(mockUserSession);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalled();
      expect(callbackHandler).toBeDefined();
    });

    // Simulate Google Identity Services returning credential
    await act(async () => {
      await callbackHandler?.({ credential: 'mock-google-id-token-xyz' });
    });

    expect(authService.loginWithGoogle).toHaveBeenCalledWith('mock-google-id-token-xyz');
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('displays error banner when Google authentication fails closed on unauthorized user', async () => {
    let callbackHandler: ((res: { credential?: string }) => Promise<void>) | undefined;
    const mockInitialize = vi.fn().mockImplementation((config) => {
      callbackHandler = config.callback;
    });

    window.google = {
      accounts: {
        id: {
          initialize: mockInitialize,
          renderButton: vi.fn(),
          prompt: vi.fn(),
        },
      },
    };

    vi.mocked(authService.loginWithGoogle).mockRejectedValueOnce(new Error('not_allowlisted'));

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockInitialize).toHaveBeenCalled();
    });

    // Simulate Google Identity Services returning credential for non-allowlisted email
    await act(async () => {
      await callbackHandler?.({ credential: 'mock-unauthorized-id-token' });
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/not allowlisted for this starqERP tenant/i)).toBeInTheDocument();
  });
});
