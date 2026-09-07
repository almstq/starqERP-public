import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentRegistryView } from '../components/admin/AgentRegistryView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-015: Controlled AI Agent Registry & Kill Switch Interface', () => {
  it('renders registered AI agents, scope tags, and action proposals', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <AgentRegistryView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('AI Agent Governance & Master Kill Switch')).toBeDefined();
    expect(screen.getAllByText('@antigravity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@hermes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@claude').length).toBeGreaterThan(0);
    expect(screen.getByText('Activate Emergency Kill Switch')).toBeDefined();
    expect(screen.getByText('AI Action Proposals & Approval Pipeline')).toBeDefined();
  });

  it('toggles emergency kill switch status and renders warning banner', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <AgentRegistryView />
        </ERPProvider>
      </AuthProvider>
    );

    const killBtn = screen.getByText('Activate Emergency Kill Switch');
    fireEvent.click(killBtn);

    expect(screen.getByText('SYSTEM-WIDE EMERGENCY KILL SWITCH ACTIVE')).toBeDefined();
    expect(screen.getByText('Restore System Execution')).toBeDefined();
  });

  it('handles approving AI action proposal', () => {
    window.alert = vi.fn();
    render(
      <AuthProvider>
        <ERPProvider>
          <AgentRegistryView />
        </ERPProvider>
      </AuthProvider>
    );

    const approveBtns = screen.getAllByText('Approve & Execute');
    fireEvent.click(approveBtns[0]);

    expect(window.alert).toHaveBeenCalled();
  });
});
