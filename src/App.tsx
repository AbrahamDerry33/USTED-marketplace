import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { BrowsePage } from './pages/BrowsePage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { ListingFormPage } from './pages/ListingFormPage';
import { MyListingsPage } from './pages/MyListingsPage';

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
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-zinc-900">
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
                  path="/my-listings"
                  element={
                    <VerifiedRoute>
                      <MyListingsPage />
                    </VerifiedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <footer className="border-t border-stone-200 bg-[#FAF9F6] py-6 px-4 sm:px-6">
              <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
                <span>Campus Market · Student-to-Student Marketplace</span>
                <span>Currency: Ghana Cedis (GHS)</span>
              </div>
            </footer>
          </div>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
