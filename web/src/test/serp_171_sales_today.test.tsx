import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { DashboardView } from '../components/dashboard/DashboardView';

const SalesTodayTestHarness: React.FC = () => {
  const { totalSalesToday, createInvoice } = useERP();

  const handleAddTodayInvoice = () => {
    const today = new Date().toISOString().split('T')[0];
    createInvoice({
      customerId: 'cust-1',
      customerName: 'Ahmed Rauf',
      customerPhone: '+960 778-4321',
      customerIsland: "Male'",
      date: today,
      dueDate: today,
      items: [
        {
          id: 'item-today',
          description: 'Emergency Ceramic Coating & Prep',
          quantity: 1,
          unitPrice: 12500,
          amount: 12500,
          category: 'Labor/Service'
        }
      ],
      subtotal: 12500,
      gstRate: 0.08,
      gstAmount: 1000,
      totalAmount: 13500,
      amountPaid: 13500,
      balanceDue: 0,
      status: 'Paid',
      bankDetails: 'BML 7730000100201'
    });
  };

  return (
    <div>
      <button data-testid="add-invoice-btn" onClick={handleAddTodayInvoice}>
        Add Today Invoice
      </button>
      <div data-testid="sales-today-val">{totalSalesToday}</div>
      <DashboardView />
    </div>
  );
};

describe('SERP-171: Dashboard Sales Today Dynamic Derivation', () => {
  it('derives totalSalesToday from actual records and updates dynamically upon invoice issuance', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <SalesTodayTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    const salesVal = screen.getByTestId('sales-today-val');
    // Initial mock invoices are dated in the past (e.g. 2026-08-14), so today's sales are 0 (NOT hardcoded 38500)
    expect(Number(salesVal.textContent)).toBe(0);
    expect(Number(salesVal.textContent)).not.toBe(38500);

    // Issue a new invoice for today (MVR 13,500)
    const addBtn = screen.getByTestId('add-invoice-btn');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // totalSalesToday must now reflect MVR 13,500
    expect(Number(salesVal.textContent)).toBe(13500);
    expect(screen.getByText(/1 invoices logged/i)).toBeDefined();
  });
});
