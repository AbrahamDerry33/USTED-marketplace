import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { extractSavedSnapshotFromListing } from '../lib/savedItems';
import {
  addFavorite,
  removeFavorite,
  removeFavoritesBatch,
  subscribeUserFavorites,
} from '../services/favoritesService';
import type { FavoriteItem, Listing } from '../types/marketplace';

interface SavedItemsContextValue {
  favorites: FavoriteItem[];
  savedItems: FavoriteItem[];
  favoriteIds: Set<string>;
  savedIds: Set<string>;
  savedCount: number;
  loadingFavorites: boolean;
  favoritesError: string;
  lastSyncedAt: Date | null;
  isFavorite: (listingId: string) => boolean;
  isSaved: (listingId: string) => boolean;
  isPending: (listingId: string) => boolean;
  toggleFavorite: (listingOrId: Listing | string) => Promise<boolean>;
  removeSavedItem: (listingId: string) => Promise<boolean>;
  removeSavedItems: (listingIds: string[]) => Promise<boolean>;
}

const SavedItemsContext = createContext<SavedItemsContextValue | null>(null);

export function SavedItemsProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [favoritesError, setFavoritesError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [optimisticMap, setOptimisticMap] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isVerified) {
      setFavorites([]);
      setOptimisticMap({});
      setPendingIds(new Set());
      setFavoritesError('');
      setLastSyncedAt(null);
      setLoadingFavorites(false);
      return;
    }

    setLoadingFavorites(true);
    setFavoritesError('');

    const unsubscribe = subscribeUserFavorites(
      user.uid,
      (items) => {
        setFavorites(items);
        setLastSyncedAt(new Date());
        setLoadingFavorites(false);
      },
      () => {
        setFavoritesError('Unable to sync your saved items right now.');
        setLoadingFavorites(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user, isVerified]);

  const favoriteIds = useMemo(() => {
    const next = new Set<string>(favorites.map((item) => item.listingId));
    for (const [listingId, saved] of Object.entries(optimisticMap)) {
      if (saved) {
        next.add(listingId);
      } else {
        next.delete(listingId);
      }
    }
    return next;
  }, [favorites, optimisticMap]);

  const isFavorite = useCallback(
    (listingId: string) => favoriteIds.has(listingId),
    [favoriteIds]
  );

  const isPending = useCallback(
    (listingId: string) => pendingIds.has(listingId),
    [pendingIds]
  );

  const toggleFavorite = useCallback(
    async (listingOrId: Listing | string): Promise<boolean> => {
      const listingId = typeof listingOrId === 'string' ? listingOrId : listingOrId.id;
      const snapshot =
        typeof listingOrId === 'string'
          ? undefined
          : extractSavedSnapshotFromListing(listingOrId);

      if (!user || !isVerified || pendingIds.has(listingId)) {
        return favoriteIds.has(listingId);
      }

      const currentlySaved = favoriteIds.has(listingId);
      const nextSaved = !currentlySaved;

      setFavoritesError('');
      setOptimisticMap((prev) => ({ ...prev, [listingId]: nextSaved }));
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(listingId);
        return next;
      });

      try {
        if (nextSaved) {
          await addFavorite(user.uid, listingId, snapshot);
        } else {
          await removeFavorite(user.uid, listingId);
        }
        return nextSaved;
      } catch {
        setFavoritesError('Could not update your saved items. Please try again.');
        return currentlySaved;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
        setOptimisticMap((prev) => {
          if (!(listingId in prev)) return prev;
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
      }
    },
    [user, isVerified, pendingIds, favoriteIds]
  );

  const removeSavedItem = useCallback(
    async (listingId: string): Promise<boolean> => {
      if (!user || !isVerified || pendingIds.has(listingId)) return false;

      setFavoritesError('');
      setOptimisticMap((prev) => ({ ...prev, [listingId]: false }));
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(listingId);
        return next;
      });

      try {
        await removeFavorite(user.uid, listingId);
        return true;
      } catch {
        setFavoritesError('Could not remove that saved item right now.');
        return false;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
        setOptimisticMap((prev) => {
          if (!(listingId in prev)) return prev;
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
      }
    },
    [user, isVerified, pendingIds]
  );

  const removeSavedItems = useCallback(
    async (listingIds: string[]): Promise<boolean> => {
      if (!user || !isVerified || listingIds.length === 0) return false;

      const uniqueIds = Array.from(new Set(listingIds));
      setFavoritesError('');
      setOptimisticMap((prev) => {
        const next = { ...prev };
        for (const id of uniqueIds) {
          next[id] = false;
        }
        return next;
      });
      setPendingIds((prev) => {
        const next = new Set(prev);
        for (const id of uniqueIds) {
          next.add(id);
        }
        return next;
      });

      try {
        await removeFavoritesBatch(user.uid, uniqueIds);
        return true;
      } catch {
        setFavoritesError('Could not clear unavailable saved items right now.');
        return false;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          for (const id of uniqueIds) {
            next.delete(id);
          }
          return next;
        });
        setOptimisticMap((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const id of uniqueIds) {
            if (id in next) {
              delete next[id];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    },
    [user, isVerified]
  );

  const value = useMemo<SavedItemsContextValue>(
    () => ({
      favorites,
      savedItems: favorites,
      favoriteIds,
      savedIds: favoriteIds,
      savedCount: favoriteIds.size,
      loadingFavorites,
      favoritesError,
      lastSyncedAt,
      isFavorite,
      isSaved: isFavorite,
      isPending,
      toggleFavorite,
      removeSavedItem,
      removeSavedItems,
    }),
    [
      favorites,
      favoriteIds,
      loadingFavorites,
      favoritesError,
      lastSyncedAt,
      isFavorite,
      isPending,
      toggleFavorite,
      removeSavedItem,
      removeSavedItems,
    ]
  );

  return <SavedItemsContext.Provider value={value}>{children}</SavedItemsContext.Provider>;
}

export function useSavedItems(): SavedItemsContextValue {
  const ctx = useContext(SavedItemsContext);
  if (!ctx) {
    throw new Error('useSavedItems must be used within SavedItemsProvider');
  }
  return ctx;
}
