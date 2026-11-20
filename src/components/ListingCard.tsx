import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ImageOff } from 'lucide-react';
import { CATEGORY_LABEL_MAP, CONDITION_LABEL_MAP } from '../config/marketplace';
import { formatGhs } from '../lib/money';
import type { Listing } from '../types/marketplace';
import { VerifiedStudentBadge } from './VerifiedStudentBadge';

function formatRelativeDate(date: Date | null): string {
  if (!date) return 'Just now';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface ListingCardProps {
  listing: Listing;
  isFavorite?: boolean;
  favoritePending?: boolean;
  onToggleFavorite?: (listing: Listing) => void;
  priceDropPesewas?: number;
  savedAt?: Date | null;
}

export function ListingCard({
  listing,
  isFavorite = false,
  favoritePending = false,
  onToggleFavorite,
  priceDropPesewas,
  savedAt,
}: ListingCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverUrl = listing.images[0];

  return (
    <article className="group relative bg-white border border-stone-200 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      {onToggleFavorite && (
        <button
          type="button"
          disabled={favoritePending}
          onClick={() => onToggleFavorite(listing)}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite
              ? `Remove ${listing.title} from Saved Items`
              : `Save ${listing.title} to Saved Items`
          }
          title={isFavorite ? 'Remove from Saved Items' : 'Bookmark listing'}
          className={`absolute top-2.5 right-2.5 z-10 inline-flex items-center justify-center w-10 h-10 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 disabled:opacity-60 ${
            isFavorite
              ? 'bg-emerald-900 text-white border-emerald-950 hover:bg-emerald-950'
              : 'bg-white/95 text-zinc-800 border-stone-300/90 hover:text-zinc-950 hover:bg-white'
          }`}
        >
          <Bookmark
            className={`w-4 h-4 transition-transform duration-150 ${
              isFavorite ? 'fill-current scale-105' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      )}

      <Link
        to={`/listings/${listing.id}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-900 rounded-xl"
      >
        <div className="aspect-[4/3] w-full bg-stone-100 overflow-hidden relative">
          {coverUrl && !imgFailed ? (
            <img
              src={coverUrl}
              alt={listing.title}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-zinc-500 p-4 text-center">
              <ImageOff className="w-6 h-6 mb-1.5" aria-hidden="true" />
              <span className="text-xs font-medium line-clamp-1">{listing.title}</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-zinc-600 truncate">
            <span>{CATEGORY_LABEL_MAP[listing.category]}</span>
            <span aria-hidden="true">·</span>
            <span>{CONDITION_LABEL_MAP[listing.condition]}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeDate(listing.createdAt)}</span>
          </div>

          <h3 className="text-base font-semibold text-zinc-950 leading-snug line-clamp-1">
            {listing.title}
          </h3>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="font-mono text-sm font-semibold text-emerald-950 tabular-nums shrink-0">
              {formatGhs(listing.pricePesewas)}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-zinc-600 truncate max-w-[120px]">
                {listing.sellerName}
              </span>
              {listing.sellerVerifiedStudent && <VerifiedStudentBadge size="xs" />}
            </div>
          </div>

          {(priceDropPesewas !== undefined && priceDropPesewas > 0) || savedAt !== undefined ? (
            <div className="pt-1.5 mt-1 border-t border-stone-100 flex items-center justify-between gap-2 text-[11px] tabular-nums">
              {priceDropPesewas !== undefined && priceDropPesewas > 0 ? (
                <span className="font-semibold text-emerald-950 truncate">
                  Price dropped {formatGhs(priceDropPesewas)}
                </span>
              ) : (
                <span className="text-zinc-600">Bookmarked</span>
              )}
              {savedAt !== undefined && (
                <span className="text-zinc-600 shrink-0">
                  {savedAt
                    ? savedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : 'Just now'}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
