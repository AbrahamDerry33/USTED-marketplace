import { Check, RotateCcw } from 'lucide-react';
import { LISTING_CATEGORIES, LISTING_CONDITIONS } from '../config/marketplace';
import type { ListingCategory, ListingCondition } from '../types/marketplace';

interface CategoryFilterSidebarProps {
  selectedCategories: ListingCategory[];
  categoryCounts: Record<ListingCategory, number>;
  totalMatchingCount: number;
  selectedConditions: ListingCondition[];
  conditionCounts: Record<ListingCondition, number>;
  totalConditionMatchingCount: number;
  minPriceGhs: string;
  maxPriceGhs: string;
  hasActiveFilters: boolean;
  onToggleCategory: (category: ListingCategory) => void;
  onClearCategories: () => void;
  onToggleCondition: (condition: ListingCondition) => void;
  onClearConditions: () => void;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  onClearAll: () => void;
}

export function CategoryFilterSidebar({
  selectedCategories,
  categoryCounts,
  totalMatchingCount,
  selectedConditions,
  conditionCounts,
  totalConditionMatchingCount,
  minPriceGhs,
  maxPriceGhs,
  hasActiveFilters,
  onToggleCategory,
  onClearCategories,
  onToggleCondition,
  onClearConditions,
  onMinPriceChange,
  onMaxPriceChange,
  onClearAll,
}: CategoryFilterSidebarProps) {
  const isAllCategoriesSelected = selectedCategories.length === 0;
  const isAnyConditionSelected = selectedConditions.length === 0;

  return (
    <aside
      aria-label="Filter listings by category, condition, and price"
      className="bg-white border border-stone-200 rounded-xl p-5 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Categories</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 rounded"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            Reset all
          </button>
        )}
      </div>

      {/* Category Filter List */}
      <div className="space-y-1" role="group" aria-label="Category tags">
        <button
          type="button"
          onClick={onClearCategories}
          aria-pressed={isAllCategoriesSelected}
          className={`w-full min-h-[44px] lg:min-h-[40px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
            isAllCategoriesSelected
              ? 'bg-emerald-50 text-emerald-950 font-semibold'
              : 'text-zinc-700 hover:bg-stone-100/80 font-medium'
          }`}
        >
          <span className="truncate">All Categories</span>
          <span
            className={`font-mono text-xs tabular-nums shrink-0 ${
              isAllCategoriesSelected ? 'text-emerald-900' : 'text-zinc-500'
            }`}
          >
            {totalMatchingCount}
          </span>
        </button>

        {LISTING_CATEGORIES.map((cat) => {
          const isSelected = selectedCategories.includes(cat.value);
          const count = categoryCounts[cat.value] ?? 0;

          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => onToggleCategory(cat.value)}
              aria-pressed={isSelected}
              className={`w-full min-h-[44px] lg:min-h-[40px] px-3 py-2 rounded-lg flex items-center justify-between gap-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                isSelected
                  ? 'bg-emerald-50 text-emerald-950 font-semibold'
                  : 'text-zinc-700 hover:bg-stone-100/80 font-normal'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-emerald-900 border-emerald-900 text-white'
                      : 'bg-white border-stone-300 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[2.5]" />
                </span>
                <span className="truncate">{cat.label}</span>
              </span>
              <span
                className={`font-mono text-xs tabular-nums shrink-0 ${
                  isSelected ? 'text-emerald-900' : 'text-zinc-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Condition Filter Section */}
      <div className="border-t border-stone-200 pt-5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">Condition</h3>
          {!isAnyConditionSelected && (
            <button
              type="button"
              onClick={onClearConditions}
              className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 rounded"
            >
              Clear
            </button>
          )}
        </div>

        <div className="space-y-1" role="group" aria-label="Listing condition">
          <button
            type="button"
            onClick={onClearConditions}
            aria-pressed={isAnyConditionSelected}
            className={`w-full min-h-[44px] lg:min-h-[40px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
              isAnyConditionSelected
                ? 'bg-emerald-50 text-emerald-950 font-semibold'
                : 'text-zinc-700 hover:bg-stone-100/80 font-medium'
            }`}
          >
            <span className="truncate">Any Condition</span>
            <span
              className={`font-mono text-xs tabular-nums shrink-0 ${
                isAnyConditionSelected ? 'text-emerald-900' : 'text-zinc-500'
              }`}
            >
              {totalConditionMatchingCount}
            </span>
          </button>

          {LISTING_CONDITIONS.map((cond) => {
            const isSelected = selectedConditions.includes(cond.value);
            const count = conditionCounts[cond.value] ?? 0;

            return (
              <button
                key={cond.value}
                type="button"
                onClick={() => onToggleCondition(cond.value)}
                aria-pressed={isSelected}
                className={`w-full min-h-[44px] lg:min-h-[40px] px-3 py-2 rounded-lg flex items-center justify-between gap-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-950 font-semibold'
                    : 'text-zinc-700 hover:bg-stone-100/80 font-normal'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-emerald-900 border-emerald-900 text-white'
                        : 'bg-white border-stone-300 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  </span>
                  <span className="truncate">{cond.label}</span>
                </span>
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    isSelected ? 'text-emerald-900' : 'text-zinc-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price Range Section */}
      <div className="border-t border-stone-200 pt-5 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">Price Range (GHS)</h3>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          <div>
            <label htmlFor="sidebar-min-price" className="block text-xs font-medium text-zinc-600 mb-1">
              Minimum
            </label>
            <input
              id="sidebar-min-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={minPriceGhs}
              onChange={(e) => onMinPriceChange(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-emerald-900"
            />
          </div>
          <div>
            <label htmlFor="sidebar-max-price" className="block text-xs font-medium text-zinc-600 mb-1">
              Maximum
            </label>
            <input
              id="sidebar-max-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={maxPriceGhs}
              onChange={(e) => onMaxPriceChange(e.target.value)}
              placeholder="5000.00"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-emerald-900"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
