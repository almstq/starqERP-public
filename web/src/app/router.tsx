import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LoginPage } from './LoginPage';
import { useAuth } from '../context/AuthContext';

import { DashboardView } from '../components/dashboard/DashboardView';
import { CustomersView } from '../components/customers/CustomersView';
import { CustomerDetailView } from '../components/customers/CustomerDetailView';
import { JobsView } from '../components/jobs/JobsView';
import { JobDetailView } from '../components/jobs/JobDetailView';
import { InvoicesView } from '../components/invoices/InvoicesView';
import { InvoiceDetailView } from '../components/invoices/InvoiceDetailView';
import { PaymentsView } from '../components/payments/PaymentsView';
import { PaymentDetailView } from '../components/payments/PaymentDetailView';
import { ExpensesView } from '../components/expenses/ExpensesView';
import { InventoryView } from '../components/inventory/InventoryView';
import { PurchasingView } from '../components/purchasing/PurchasingView';
import { PODetailView } from '../components/purchasing/PODetailView';
import { SuppliersView } from '../components/suppliers/SuppliersView';
import { SupplierDetailView } from '../components/suppliers/SupplierDetailView';
import { ReportsView } from '../components/reports/ReportsView';
import { AuditLogView } from '../components/audit/AuditLogView';
import { SettingsView } from '../components/settings/SettingsView';
import { AccountsView } from '../components/accounts/AccountsView';

const AuthGate: React.FC = () => {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--md-sys-color-surface)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--md-sys-color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AuthGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardView /> },

          { path: 'customers', element: <CustomersView /> },
          { path: 'customers/:id', element: <CustomerDetailView /> },

          { path: 'jobs', element: <JobsView /> },
          { path: 'jobs/:id', element: <JobDetailView /> },

          { path: 'invoices', element: <InvoicesView /> },
          { path: 'invoices/:id', element: <InvoiceDetailView /> },

          { path: 'payments', element: <PaymentsView /> },
          { path: 'payments/:id', element: <PaymentDetailView /> },

          { path: 'expenses', element: <ExpensesView /> },
          { path: 'accounts', element: <AccountsView /> },
          { path: 'inventory', element: <InventoryView /> },

          { path: 'purchasing', element: <PurchasingView /> },
          { path: 'purchasing/:id', element: <PODetailView /> },

          { path: 'suppliers', element: <SuppliersView /> },
          { path: 'suppliers/:id', element: <SupplierDetailView /> },

          { path: 'reports', element: <ReportsView /> },
          { path: 'audit', element: <AuditLogView /> },
          { path: 'settings', element: <SettingsView /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
