import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SavedItemsProvider } from './context/SavedItemsContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { AiHubPage } from './pages/AiHubPage';
import { AuthPage } from './pages/AuthPage';
import { BrowsePage } from './pages/BrowsePage';
import { CampusMapPage } from './pages/CampusMapPage';
import { DashboardPage } from './pages/DashboardPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { ListingFlyerPage } from './pages/ListingFlyerPage';
import { ListingFormPage } from './pages/ListingFormPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { OrderDetailsPage } from './pages/OrderDetailsPage';
import { OrdersPage } from './pages/OrdersPage';
import { SavedItemsPage } from './pages/SavedItemsPage';

function VerifiedRoute({ children }: { children: React.ReactNode }) {
  const { user, isVerified, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="h-32 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!user || !isVerified) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <SavedItemsProvider>
          <ErrorBoundary>
          <div className="min-h-screen flex flex-col bg-[#FAF9F6] print:bg-white text-zinc-900">
            {mapsQuotaExceeded && (
              <div className="print:hidden bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
                <span>
                  Google Maps Platform quota reached. If you are the app owner, visit{' '}
                  <a
                    href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-amber-950 hover:text-amber-800"
                  >
                    maps developer site
                  </a>{' '}
                  for instructions to update your account.
                </span>
              </div>
            )}
            <Navbar />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<BrowsePage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route
                  path="/sell"
                  element={
                    <VerifiedRoute>
                      <ListingFormPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/listings/:id"
                  element={
                    <VerifiedRoute>
                      <ListingDetailPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/listings/:id/edit"
                  element={
                    <VerifiedRoute>
                      <ListingFormPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/listings/:id/flyer"
                  element={
                    <VerifiedRoute>
                      <ListingFlyerPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <VerifiedRoute>
                      <DashboardPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/saved"
                  element={
                    <VerifiedRoute>
                      <SavedItemsPage />
                    </VerifiedRoute>
                  }
                />
                <Route path="/saved-items" element={<Navigate to="/saved" replace />} />
                <Route
                  path="/my-listings"
                  element={
                    <VerifiedRoute>
                      <MyListingsPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/seller-dashboard"
                  element={<Navigate to="/dashboard?tab=seller" replace />}
                />
                <Route
                  path="/orders"
                  element={
                    <VerifiedRoute>
                      <OrdersPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/orders/:orderId"
                  element={
                    <VerifiedRoute>
                      <OrderDetailsPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/campus-map"
                  element={
                    <VerifiedRoute>
                      <CampusMapPage />
                    </VerifiedRoute>
                  }
                />
                <Route
                  path="/ai"
                  element={
                    <VerifiedRoute>
                      <AiHubPage />
                    </VerifiedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <footer className="print:hidden border-t border-stone-200 bg-[#FAF9F6] py-6 px-4 sm:px-6">
              <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
                <span>Campus Market · Student-to-Student Marketplace</span>
                <span>Currency: Ghana Cedis (GHS)</span>
              </div>
            </footer>
          </div>
          </ErrorBoundary>
        </SavedItemsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
