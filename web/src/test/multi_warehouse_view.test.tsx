import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiWarehouseView } from '../components/inventory/MultiWarehouseView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-013: Multi-Warehouse & Inter-Island Inventory Interface', () => {
  it('renders warehouse locations, inventory SKU listings, and transfer orders', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <MultiWarehouseView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Multi-Warehouse & Inter-Island Inventory')).toBeDefined();
    expect(screen.getByText('Male Central Hub Warehouse')).toBeDefined();
    expect(screen.getByText('Thilafushi Heavy Marine Yard')).toBeDefined();
    expect(screen.getByText('Inter-Island Stock Transfer Orders (Sea Freight)')).toBeDefined();
    expect(screen.getByText('STO-2026-001')).toBeDefined();
  });

  it('handles stock transfer dispatch and receiving lifecycle', () => {
    window.alert = vi.fn();
    render(
      <AuthProvider>
        <ERPProvider>
          <MultiWarehouseView />
        </ERPProvider>
      </AuthProvider>
    );

    const dispatchBtn = screen.getByText('Dispatch to In-Transit (Account 1350)');
    fireEvent.click(dispatchBtn);

    expect(screen.getByText('Receive at WH-THL')).toBeDefined();
    expect(window.alert).toHaveBeenCalled();

    const receiveBtn = screen.getByText('Receive at WH-THL');
    fireEvent.click(receiveBtn);

    expect(screen.getByText('Delivered & Inventory Transferred ✓')).toBeDefined();
  });
});
