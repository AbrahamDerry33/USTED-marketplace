import { useSavedItems } from '../context/SavedItemsContext';

export function useFavorites() {
  return useSavedItems();
}
