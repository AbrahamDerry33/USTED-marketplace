import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Plus, ShoppingBag } from 'lucide-react';
import { BuyerDashboard } from '../components/BuyerDashboard';
import { SellerDashboard } from '../components/SellerDashboard';
import { VerifiedStudentBadge } from '../components/VerifiedStudentBadge';
import { useAuth } from '../context/AuthContext';
import { useSavedItems } from '../context/SavedItemsContext';
import { parseDashboardTab, type DashboardTab } from '../lib/dashboardSummary';
import { subscribeMyListings } from '../services/listingsService';
import { subscribeBuyerOrders, subscribeSellerOrders } from '../services/ordersService';
import type { Listing, Order } from '../types/marketplace';

export function DashboardPage() {
  const { user, profile, isVerified } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab: DashboardTab = parseDashboardTab(searchParams.get('tab'));

  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);
  const [buyerOrdersLoading, setBuyerOrdersLoading] = useState(true);
  const [buyerOrdersError, setBuyerOrdersError] = useState('');

  const {
    favorites,
    loadingFavorites: favoritesLoading,
    favoritesError,
  } = useSavedItems();

  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [sellerOrdersLoading, setSellerOrdersLoading] = useState(true);
  const [sellerOrdersError, setSellerOrdersError] = useState('');

  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState('');

  useEffect(() => {
    if (!user || !isVerified) return;

    setBuyerOrdersLoading(true);
    setSellerOrdersLoading(true);
    setListingsLoading(true);
    setBuyerOrdersError('');
    setSellerOrdersError('');
    setListingsError('');

    const unsubBuyerOrders = subscribeBuyerOrders(
      user.uid,
      (orders) => {
        setBuyerOrders(orders);
        setBuyerOrdersLoading(false);
      },
      () => {
        setBuyerOrdersError('Unable to load your purchase history right now.');
        setBuyerOrdersLoading(false);
      }
    );

    const unsubSellerOrders = subscribeSellerOrders(
      user.uid,
      (orders) => {
        setSellerOrders(orders);
        setSellerOrdersLoading(false);
      },
      () => {
        setSellerOrdersError('Unable to load your weekly sales performance right now.');
        setSellerOrdersLoading(false);
      }
    );

    const unsubListings = subscribeMyListings(
      user.uid,
      (items) => {
        setMyListings(items);
        setListingsLoading(false);
      },
      () => {
        setListingsError('Unable to load your listings right now.');
        setListingsLoading(false);
      }
    );

    return () => {
      unsubBuyerOrders();
      unsubSellerOrders();
      unsubListings();
    };
  }, [user, isVerified]);

  const handleSelectTab = (nextTab: DashboardTab) => {
    if (nextTab === activeTab) return;
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      handleSelectTab(activeTab === 'buyer' ? 'seller' : 'buyer');
    } else if (event.key === 'Home') {
      event.preventDefault();
      handleSelectTab('buyer');
    } else if (event.key === 'End') {
      event.preventDefault();
      handleSelectTab('seller');
    }
  };

  const displayName = profile?.displayName || user?.displayName || 'Student';

  return (
    <main
      aria-labelledby="dashboard-page-heading"
      className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-9 space-y-6"
    >
      {/* Header & Contextual Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1
            id="dashboard-page-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
          >
            Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <p className="text-xs sm:text-sm text-zinc-700 truncate">
              {displayName}
              {profile?.campus ? ` · ${profile.campus}` : ''} · Campus Market account hub
            </p>
            {profile?.verifiedStudent && <VerifiedStudentBadge size="xs" />}
          </div>
        </div>

        {activeTab === 'seller' ? (
          <Link
            to="/sell"
            aria-label="Create a new marketplace listing"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Listing
          </Link>
        ) : (
          <Link
            to="/"
            aria-label="Browse marketplace listings"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 w-full sm:w-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            Browse Items
          </Link>
        )}
      </div>

      {/* Mobile-First (360px+) Segmented Tab Switcher */}
      <div className="w-full sm:w-auto">
        <div
          role="tablist"
          aria-label="Switch between Buyer Dashboard and Seller Dashboard"
          className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid p-1 bg-stone-200 rounded-xl gap-1"
        >
          <button
            id="dashboard-tab-buyer"
            type="button"
            role="tab"
            aria-label="Switch to Buyer Dashboard"
            aria-selected={activeTab === 'buyer'}
            aria-controls="dashboard-panel-buyer"
            tabIndex={activeTab === 'buyer' ? 0 : -1}
            onClick={() => handleSelectTab('buyer')}
            onKeyDown={handleTabKeyDown}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2.5 sm:px-5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
              activeTab === 'buyer'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-800 hover:text-zinc-950'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Buyer Dashboard</span>
          </button>

          <button
            id="dashboard-tab-seller"
            type="button"
            role="tab"
            aria-label="Switch to Seller Dashboard"
            aria-selected={activeTab === 'seller'}
            aria-controls="dashboard-panel-seller"
            tabIndex={activeTab === 'seller' ? 0 : -1}
            onClick={() => handleSelectTab('seller')}
            onKeyDown={handleTabKeyDown}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-2.5 sm:px-5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
              activeTab === 'seller'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-800 hover:text-zinc-950'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Seller Dashboard</span>
          </button>
        </div>
      </div>

      {/* Buyer Dashboard Tab Panel */}
      {activeTab === 'buyer' && user && (
        <div
          id="dashboard-panel-buyer"
          role="tabpanel"
          aria-labelledby="dashboard-tab-buyer"
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-900 rounded-xl"
        >
          <BuyerDashboard
            userId={user.uid}
            orders={buyerOrders}
            favorites={favorites}
            ordersLoading={buyerOrdersLoading}
            favoritesLoading={favoritesLoading}
            ordersError={buyerOrdersError}
            favoritesError={favoritesError}
          />
        </div>
      )}

      {/* Seller Dashboard Tab Panel */}
      {activeTab === 'seller' && (
        <div
          id="dashboard-panel-seller"
          role="tabpanel"
          aria-labelledby="dashboard-tab-seller"
          tabIndex={0}
          className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-900 rounded-xl"
        >
          <SellerDashboard
            orders={sellerOrders}
            listings={myListings}
            loading={sellerOrdersLoading}
            listingsLoading={listingsLoading}
            error={sellerOrdersError}
            listingsError={listingsError}
            variant="full"
          />
        </div>
      )}
    </main>
  );
}
