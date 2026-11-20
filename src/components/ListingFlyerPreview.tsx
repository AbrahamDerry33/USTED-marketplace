import { useEffect, useState } from 'react';
import { ImageOff, Scissors } from 'lucide-react';
import { CATEGORY_LABEL_MAP, CONDITION_LABEL_MAP } from '../config/marketplace';
import {
  sanitizeFlyerNote,
  TEAROFF_STRIP_COUNT,
  truncateFlyerDescription,
  type FlyerLayoutMode,
} from '../lib/listingFlyer';
import { formatGhs } from '../lib/money';
import type { Listing } from '../types/marketplace';

interface ListingFlyerPreviewProps {
  listing: Listing;
  qrSvgDataUrl: string;
  displayUrl: string;
  layout: FlyerLayoutMode;
  includePhoto: boolean;
  monochrome: boolean;
  meetupNote: string;
}

function FlyerPhoto({
  imageUrl,
  title,
  monochrome,
  aspectClass,
}: {
  imageUrl?: string;
  title: string;
  monochrome: boolean;
  aspectClass: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={`${aspectClass} w-full rounded-lg overflow-hidden border ${
        monochrome ? 'border-zinc-400 bg-zinc-100' : 'border-stone-200 bg-stone-100'
      }`}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`w-full h-full object-cover ${monochrome ? 'grayscale contrast-125' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-4">
          <ImageOff className="w-6 h-6 mb-1" aria-hidden="true" />
          <span className="text-xs">Item photo unavailable</span>
        </div>
      )}
    </div>
  );
}

function CompactFlyerHalf({
  listing,
  qrSvgDataUrl,
  displayUrl,
  includePhoto,
  monochrome,
  cleanNote,
  copyIndex,
}: {
  listing: Listing;
  qrSvgDataUrl: string;
  displayUrl: string;
  includePhoto: boolean;
  monochrome: boolean;
  cleanNote: string;
  copyIndex: number;
}) {
  const categoryLabel = CATEGORY_LABEL_MAP[listing.category];
  const conditionLabel = CONDITION_LABEL_MAP[listing.condition];
  const descriptionExcerpt = truncateFlyerDescription(listing.description, includePhoto ? 120 : 185);
  const priceText = formatGhs(listing.pricePesewas);

  return (
    <article
      aria-label={`Compact campus flyer copy ${copyIndex} for ${listing.title}`}
      className={`rounded-xl border p-5 sm:p-6 space-y-4 ${
        monochrome ? 'border-zinc-900 bg-white' : 'border-stone-300 bg-white'
      }`}
    >
      <header
        className={`flex items-baseline justify-between gap-3 pb-3 border-b ${
          monochrome ? 'border-zinc-900' : 'border-emerald-950/20'
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-zinc-950">Campus Market</p>
          <p className="text-[11px] text-zinc-700">Verified Student Marketplace</p>
        </div>
        <p className="text-xs font-medium text-zinc-700 text-right shrink-0">
          {categoryLabel} <span aria-hidden="true">·</span> {conditionLabel}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-12 print:grid-cols-12 gap-4 items-center">
        <div className="sm:col-span-8 print:col-span-8 space-y-2.5 min-w-0">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-zinc-950 leading-snug text-balance">
              {listing.title}
            </h2>
            <p
              className={`font-mono text-2xl font-bold tabular-nums ${
                monochrome ? 'text-zinc-950' : 'text-emerald-950'
              }`}
            >
              {priceText}
            </p>
          </div>

          {includePhoto && listing.images[0] && (
            <div className="grid grid-cols-12 gap-3 items-start pt-0.5">
              <div className="col-span-5">
                <FlyerPhoto
                  imageUrl={listing.images[0]}
                  title={listing.title}
                  monochrome={monochrome}
                  aspectClass="aspect-[4/3]"
                />
              </div>
              <p className="col-span-7 text-xs text-zinc-700 leading-relaxed">
                {descriptionExcerpt}
              </p>
            </div>
          )}

          {(!includePhoto || !listing.images[0]) && (
            <p className="text-xs text-zinc-700 leading-relaxed">{descriptionExcerpt}</p>
          )}

          <div className="pt-1 space-y-0.5 text-xs text-zinc-800">
            <p>
              <span className="text-zinc-600">Seller:</span>{' '}
              <strong className="font-semibold text-zinc-950">{listing.sellerName}</strong>
            </p>
            {cleanNote && (
              <p>
                <span className="text-zinc-600">Pickup:</span>{' '}
                <span className="font-medium text-zinc-900">{cleanNote}</span>
              </p>
            )}
          </div>
        </div>

        <div className="sm:col-span-4 print:col-span-4 flex flex-col items-center text-center space-y-1.5">
          <div
            className={`w-36 h-36 p-1.5 bg-white rounded-lg border ${
              monochrome ? 'border-zinc-900' : 'border-stone-300'
            }`}
          >
            <img
              src={qrSvgDataUrl}
              alt={`QR code linking to ${listing.title} on Campus Market`}
              className="w-full h-full object-contain"
            />
          </div>
          <p className="text-[11px] font-semibold text-zinc-950">Scan to view &amp; buy</p>
          <p className="font-mono text-[9px] text-zinc-700 break-all leading-tight max-w-[160px]">
            {displayUrl}
          </p>
        </div>
      </div>
    </article>
  );
}

export function ListingFlyerPreview({
  listing,
  qrSvgDataUrl,
  displayUrl,
  layout,
  includePhoto,
  monochrome,
  meetupNote,
}: ListingFlyerPreviewProps) {
  const categoryLabel = CATEGORY_LABEL_MAP[listing.category];
  const conditionLabel = CONDITION_LABEL_MAP[listing.condition];
  const priceText = formatGhs(listing.pricePesewas);
  const cleanNote = sanitizeFlyerNote(meetupNote);

  if (layout === 'compact') {
    return (
      <div className="bg-white border border-stone-300 rounded-xl p-5 sm:p-7 shadow-sm print:border-0 print:rounded-none print:shadow-none print:p-0 space-y-5">
        <CompactFlyerHalf
          listing={listing}
          qrSvgDataUrl={qrSvgDataUrl}
          displayUrl={displayUrl}
          includePhoto={includePhoto}
          monochrome={monochrome}
          cleanNote={cleanNote}
          copyIndex={1}
        />

        <div className="flex items-center gap-2 text-zinc-600 py-0.5" aria-hidden="true">
          <Scissors className="w-3.5 h-3.5 shrink-0" />
          <div className="flex-1 border-t-2 border-dashed border-zinc-400" />
          <span className="text-[11px] font-medium whitespace-nowrap">
            Cut along dashed line · 2 flyers per sheet
          </span>
          <div className="flex-1 border-t-2 border-dashed border-zinc-400" />
        </div>

        <CompactFlyerHalf
          listing={listing}
          qrSvgDataUrl={qrSvgDataUrl}
          displayUrl={displayUrl}
          includePhoto={includePhoto}
          monochrome={monochrome}
          cleanNote={cleanNote}
          copyIndex={2}
        />
      </div>
    );
  }

  const isTearOff = layout === 'tearoff';
  const descriptionExcerpt = truncateFlyerDescription(
    listing.description,
    isTearOff ? (includePhoto ? 150 : 220) : includePhoto ? 220 : 380
  );

  return (
    <article
      aria-label={`Printable campus flyer for ${listing.title}`}
      className={`bg-white border rounded-xl p-6 sm:p-9 shadow-sm print:border-0 print:rounded-none print:shadow-none print:p-0 flex flex-col justify-between ${
        monochrome ? 'border-zinc-900' : 'border-stone-300'
      } ${isTearOff ? 'space-y-5' : 'space-y-6'}`}
    >
      {/* Masthead */}
      <header
        className={`flex flex-wrap items-end justify-between gap-3 pb-4 border-b-2 ${
          monochrome ? 'border-zinc-950' : 'border-emerald-950'
        }`}
      >
        <div className="space-y-0.5">
          <p className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950">Campus Market</p>
          <p className="text-xs font-medium text-zinc-700">
            Verified Student-to-Student Marketplace
          </p>
        </div>

        <p className="text-xs sm:text-sm font-medium text-zinc-800">
          {categoryLabel} <span aria-hidden="true">·</span> {conditionLabel}
        </p>
      </header>

      {/* Main Item Content */}
      <div className={isTearOff ? 'space-y-4' : 'space-y-5'}>
        <div className="flex flex-col sm:flex-row print:flex-row sm:items-baseline print:items-baseline justify-between gap-2 sm:gap-4">
          <h2
            className={`font-bold tracking-tight text-zinc-950 text-balance leading-tight ${
              isTearOff ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
            }`}
          >
            {listing.title}
          </h2>
          <p
            className={`font-mono font-bold tabular-nums whitespace-nowrap shrink-0 ${
              isTearOff ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
            } ${monochrome ? 'text-zinc-950' : 'text-emerald-950'}`}
          >
            {priceText}
          </p>
        </div>

        {includePhoto && listing.images[0] && (
          <FlyerPhoto
            imageUrl={listing.images[0]}
            title={listing.title}
            monochrome={monochrome}
            aspectClass={isTearOff ? 'aspect-[16/9] max-h-56' : 'aspect-[16/10] max-h-80'}
          />
        )}

        <p className="text-sm sm:text-base text-zinc-800 leading-relaxed">{descriptionExcerpt}</p>
      </div>

      {/* Scan-to-Buy QR Band */}
      <section
        aria-label="Scan QR code to purchase"
        className={`rounded-xl border p-5 sm:p-6 flex flex-col sm:flex-row print:flex-row items-center gap-5 sm:gap-6 ${
          monochrome
            ? 'bg-white border-zinc-900'
            : 'bg-[#FAF9F6] border-stone-300'
        }`}
      >
        <div
          className={`w-40 h-40 sm:w-44 sm:h-44 print:w-44 print:h-44 p-2 bg-white rounded-lg border shrink-0 ${
            monochrome ? 'border-zinc-950' : 'border-stone-300'
          }`}
        >
          <img
            src={qrSvgDataUrl}
            alt={`QR code linking to ${listing.title} on Campus Market`}
            className="w-full h-full object-contain"
          />
        </div>

        <div className="space-y-2.5 text-center sm:text-left print:text-left min-w-0 flex-1">
          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight text-zinc-950">
              Scan to View &amp; Buy on Campus Market
            </h3>
            <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
              Point your phone camera at this QR code to inspect photos, message the seller, or pay
              safely in Ghana cedis (GHS).
            </p>
          </div>

          <dl className="space-y-1 text-xs sm:text-sm text-zinc-800 pt-1">
            <div className="flex flex-wrap items-baseline justify-center sm:justify-start print:justify-start gap-x-1.5">
              <dt className="text-zinc-600 font-medium">Seller:</dt>
              <dd className="font-semibold text-zinc-950">{listing.sellerName}</dd>
            </div>
            {cleanNote && (
              <div className="flex flex-wrap items-baseline justify-center sm:justify-start print:justify-start gap-x-1.5">
                <dt className="text-zinc-600 font-medium">Campus Meetup:</dt>
                <dd className="font-medium text-zinc-950">{cleanNote}</dd>
              </div>
            )}
          </dl>

          <p className="font-mono text-[11px] text-zinc-700 break-all pt-1">{displayUrl}</p>
        </div>
      </section>

      {/* Optional Bottom Tear-Off Strips */}
      {isTearOff && (
        <section aria-label="Tear-off QR strips" className="pt-2 space-y-2.5">
          <div className="flex items-center gap-2 text-zinc-700" aria-hidden="true">
            <Scissors className="w-3.5 h-3.5 shrink-0" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-400" />
            <span className="text-[11px] font-medium whitespace-nowrap">
              Cut vertical slits below so students can tear off a tab
            </span>
            <div className="flex-1 border-t-2 border-dashed border-zinc-400" />
          </div>

          <div className="grid grid-cols-5 border border-dashed border-zinc-400 divide-x divide-dashed divide-zinc-400 rounded-lg overflow-hidden">
            {Array.from({ length: TEAROFF_STRIP_COUNT }, (_, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-white flex flex-col items-center justify-between text-center gap-1.5 min-w-0"
              >
                <div className="w-16 h-16 p-0.5 bg-white shrink-0">
                  <img
                    src={qrSvgDataUrl}
                    alt={`Tear-off QR tab ${idx + 1} for ${listing.title}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[10px] font-semibold text-zinc-950 line-clamp-2 leading-tight w-full">
                  {listing.title}
                </p>
                <p
                  className={`font-mono text-[11px] font-bold tabular-nums ${
                    monochrome ? 'text-zinc-950' : 'text-emerald-950'
                  }`}
                >
                  {priceText}
                </p>
                <span className="text-[9px] text-zinc-600">Campus Market</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
