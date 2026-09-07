import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ERPProvider } from './context/ERPContext';
import { router } from './app/router';
import { ErrorBoundary, installGlobalErrorReporting } from './app/ErrorBoundary';
import './index.css';

// SERP-301 — errors thrown outside React's render cycle (event handlers, timers,
// unawaited promises) never reach a boundary. Installed before the first render
// so a failure during mount is still observed.
installGlobalErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      OUTSIDE the providers, deliberately. A boundary inside them cannot catch a
      failure thrown while ERPProvider or AuthProvider is initialising — which is
      exactly when a white screen is most likely and least explicable.
    */}
    <ErrorBoundary boundary="root">
    <ThemeProvider>
      <AuthProvider>
        <ERPProvider>
          <RouterProvider router={router} />
        </ERPProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
