import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { CATEGORY_LABEL_MAP, CONDITION_LABEL_MAP } from '../config/marketplace';
import { formatGhs } from '../lib/money';
import type { Listing } from '../types/marketplace';

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

export function ListingCard({ listing }: { listing: Listing }) {
  const [imgFailed, setImgFailed] = useState(false);
  const coverUrl = listing.images[0];

  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group block bg-white border border-stone-200 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
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
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 truncate">
          <span>{CATEGORY_LABEL_MAP[listing.category]}</span>
          <span aria-hidden="true">·</span>
          <span>{CONDITION_LABEL_MAP[listing.condition]}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeDate(listing.createdAt)}</span>
        </div>

        <h3 className="text-base font-semibold text-zinc-900 leading-snug line-clamp-1">
          {listing.title}
        </h3>

        <div className="flex items-baseline justify-between gap-2 pt-0.5">
          <span className="font-mono text-sm font-semibold text-emerald-900 tabular-nums">
            {formatGhs(listing.pricePesewas)}
          </span>
          <span className="text-xs text-zinc-500 truncate max-w-[120px]">
            {listing.sellerName}
          </span>
        </div>
      </div>
    </Link>
  );
}
