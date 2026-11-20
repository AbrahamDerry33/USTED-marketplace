import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Download, Printer, QrCode } from 'lucide-react';
import { ListingFlyerPreview } from '../components/ListingFlyerPreview';
import {
  buildFlyerFileSlug,
  buildListingShareUrl,
  FLYER_LAYOUT_OPTIONS,
  FLYER_NOTE_MAX_LENGTH,
  formatFlyerDisplayUrl,
  generateListingQrAssets,
  type FlyerLayoutMode,
  type GeneratedListingQrAssets,
} from '../lib/listingFlyer';
import { getListingById } from '../services/listingsService';
import type { Listing } from '../types/marketplace';

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

export function ListingFlyerPage() {
  const { id } = useParams<{ id: string }>();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [layout, setLayout] = useState<FlyerLayoutMode>('poster');
  const [includePhoto, setIncludePhoto] = useState(true);
  const [monochrome, setMonochrome] = useState(false);
  const [meetupNote, setMeetupNote] = useState('');

  const [qrAssets, setQrAssets] = useState<GeneratedListingQrAssets | null>(null);
  const [qrError, setQrError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Invalid listing ID.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    getListingById(id)
      .then((item) => {
        if (cancelled) return;
        if (!item || item.status === 'removed') {
          setListing(null);
          setError('This listing is unavailable or has been removed.');
        } else {
          setListing(item);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Unable to load this listing for flyer generation.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const shareUrl = useMemo(() => {
    if (!listing) return '';
    try {
      return buildListingShareUrl(listing.id);
    } catch {
      return '';
    }
  }, [listing]);

  const displayUrl = useMemo(() => (shareUrl ? formatFlyerDisplayUrl(shareUrl) : ''), [shareUrl]);

  useEffect(() => {
    if (!shareUrl) {
      setQrAssets(null);
      return;
    }

    let cancelled = false;
    setQrError('');

    generateListingQrAssets(shareUrl, {
      darkColor: monochrome ? '#000000' : '#064E3B',
      lightColor: '#FFFFFF',
    })
      .then((assets) => {
        if (!cancelled) {
          setQrAssets(assets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrAssets(null);
          setQrError('Unable to generate QR code right now. Try refreshing the page.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareUrl, monochrome]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setStatusNotice('Listing link copied to clipboard.');
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setStatusNotice('Copy failed — highlight and copy the listing URL directly.');
    }
  };

  const handleDownloadPng = () => {
    if (!listing || !qrAssets) return;
    const link = document.createElement('a');
    link.href = qrAssets.pngDataUrl;
    link.download = `${buildFlyerFileSlug(listing.title, listing.id)}-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatusNotice('Downloaded high-resolution QR code (PNG).');
  };

  const handleDownloadSvg = () => {
    if (!listing || !qrAssets) return;
    const blob = new Blob([qrAssets.svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${buildFlyerFileSlug(listing.title, listing.id)}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setStatusNotice('Downloaded vector QR code (SVG).');
  };

  const handlePrint = () => {
    window.print();
  };

  const activeLayoutMeta =
    FLYER_LAYOUT_OPTIONS.find((opt) => opt.value === layout) ?? FLYER_LAYOUT_OPTIONS[0];

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="h-6 w-40 bg-stone-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
          <div className="lg:col-span-4 h-96 bg-white border border-stone-200 rounded-xl" />
          <div className="lg:col-span-8 h-[560px] bg-white border border-stone-200 rounded-xl" />
        </div>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-4">
          <QrCode className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-zinc-950">Flyer unavailable</h1>
          <p className="text-sm text-zinc-700">
            {error || 'This listing could not be found.'}
          </p>
          <Link
            to="/my-listings"
            aria-label="Return to My Listings"
            className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to My Listings
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      aria-labelledby="flyer-studio-heading"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 print:max-w-none print:px-0 print:py-0 print:space-y-0"
    >
      {/* Top Header & Back Navigation (hidden during print) */}
      <div className="print:hidden space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            to={`/listings/${listing.id}`}
            aria-label={`Back to listing ${listing.title}`}
            className={`inline-flex items-center gap-1.5 font-medium text-zinc-700 hover:text-zinc-950 rounded ${FOCUS_RING_CLASS}`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to listing
          </Link>
          <span className="text-zinc-400" aria-hidden="true">
            ·
          </span>
          <Link
            to="/my-listings"
            aria-label="Go to My Listings"
            className={`font-medium text-zinc-700 hover:text-zinc-950 rounded ${FOCUS_RING_CLASS}`}
          >
            My Listings
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <h1
              id="flyer-studio-heading"
              className="text-2xl font-bold tracking-tight text-zinc-950"
            >
              Printable QR Code Flyer
            </h1>
            <p className="text-sm text-zinc-700">
              Print a campus noticeboard flyer or download the QR code so students can scan and buy
              directly.
            </p>
          </div>

          <button
            type="button"
            disabled={!qrAssets}
            onClick={handlePrint}
            aria-label={`Print physical flyer for ${listing.title}`}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
          >
            <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
            Print Flyer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block">
        {/* Left Studio Controls (hidden on print) */}
        <aside
          aria-label="Flyer customization options"
          className="lg:col-span-4 print:hidden bg-white border border-stone-200 rounded-xl p-5 space-y-5 lg:sticky lg:top-20"
        >
          {/* Flyer Layout Switcher */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-zinc-900">Flyer Layout</span>
            <div
              role="group"
              aria-label="Choose printable flyer layout"
              className="grid grid-cols-1 gap-1.5"
            >
              {FLYER_LAYOUT_OPTIONS.map((opt) => {
                const isSelected = layout === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`Select ${opt.label} layout`}
                    onClick={() => setLayout(opt.value)}
                    className={`w-full text-left px-3.5 py-2.5 min-h-[44px] rounded-lg border transition-colors ${FOCUS_RING_CLASS} ${
                      isSelected
                        ? 'bg-emerald-900 text-white border-emerald-950'
                        : 'bg-[#FAF9F6] text-zinc-900 border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span
                      className={`block text-[11px] mt-0.5 ${
                        isSelected ? 'text-emerald-100' : 'text-zinc-600'
                      }`}
                    >
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="sr-only" aria-live="polite">
              Selected layout: {activeLayoutMeta.label}.
            </p>
          </div>

          {/* Optional Campus Meetup Note */}
          <div className="space-y-1.5 border-t border-stone-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="flyer-meetup-note" className="text-xs font-semibold text-zinc-900">
                Campus Meetup Note (optional)
              </label>
              <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
                {meetupNote.length}/{FLYER_NOTE_MAX_LENGTH}
              </span>
            </div>
            <input
              id="flyer-meetup-note"
              type="text"
              value={meetupNote}
              maxLength={FLYER_NOTE_MAX_LENGTH}
              onChange={(e) => setMeetupNote(e.target.value)}
              placeholder="e.g. Pickup at Balme Library or Commonwealth Hall"
              aria-label="Optional campus meetup note to print on flyer"
              className="w-full min-h-[44px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-500 focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15"
            />
          </div>

          {/* Print Display Toggles */}
          <div className="space-y-2 border-t border-stone-200 pt-4">
            <span className="block text-xs font-semibold text-zinc-900">Print Options</span>

            <label className="flex items-center justify-between gap-3 min-h-[40px] text-sm text-zinc-800 cursor-pointer">
              <span>Include item photo</span>
              <input
                type="checkbox"
                checked={includePhoto}
                onChange={(e) => setIncludePhoto(e.target.checked)}
                aria-label="Include item photo on printed flyer"
                className="w-4 h-4 accent-emerald-900 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-3 min-h-[40px] text-sm text-zinc-800 cursor-pointer">
              <span>Black &amp; white ink mode</span>
              <input
                type="checkbox"
                checked={monochrome}
                onChange={(e) => setMonochrome(e.target.checked)}
                aria-label="Enable high-contrast black and white printer mode"
                className="w-4 h-4 accent-emerald-900 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Encoded Listing Link */}
          <div className="space-y-2 border-t border-stone-200 pt-4">
            <span className="block text-xs font-semibold text-zinc-900">QR Destination Link</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg border border-stone-300 bg-[#FAF9F6] px-2.5 py-2 text-[11px] font-mono text-zinc-800">
                {displayUrl}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                aria-label={`Copy direct listing link for ${listing.title}`}
                className={`inline-flex items-center justify-center gap-1 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-900" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Print & QR Download Actions */}
          <div className="space-y-2.5 border-t border-stone-200 pt-4">
            <button
              type="button"
              disabled={!qrAssets}
              onClick={handlePrint}
              aria-label={`Print flyer for ${listing.title}`}
              className={`w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print Physical Flyer
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!qrAssets}
                onClick={handleDownloadPng}
                aria-label={`Download QR code PNG image for ${listing.title}`}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-950 bg-stone-100 hover:bg-stone-200 border border-stone-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                QR PNG
              </button>
              <button
                type="button"
                disabled={!qrAssets}
                onClick={handleDownloadSvg}
                aria-label={`Download vector QR code SVG for ${listing.title}`}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-950 bg-stone-100 hover:bg-stone-200 border border-stone-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                QR SVG
              </button>
            </div>

            {statusNotice && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs font-medium text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-2"
              >
                {statusNotice}
              </p>
            )}

            <p className="text-[11px] text-zinc-600 leading-relaxed">
              Tip: Turn off browser headers &amp; footers in the print dialog for a clean single-page
              noticeboard sheet.
            </p>
          </div>
        </aside>

        {/* Right: Printable Flyer Preview Sheet */}
        <section
          aria-label="Printable flyer live preview"
          className="lg:col-span-8 print:w-full"
        >
          {qrError ? (
            <div
              role="alert"
              className="bg-red-50 border border-red-300 text-red-900 rounded-xl p-6 text-sm"
            >
              {qrError}
            </div>
          ) : !qrAssets ? (
            <div
              aria-label="Generating QR code flyer preview"
              className="h-[620px] bg-white border border-stone-200 rounded-xl animate-pulse"
            />
          ) : (
            <ListingFlyerPreview
              listing={listing}
              qrSvgDataUrl={qrAssets.svgDataUrl}
              displayUrl={displayUrl}
              layout={layout}
              includePhoto={includePhoto}
              monochrome={monochrome}
              meetupNote={meetupNote}
            />
          )}
        </section>
      </div>
    </main>
  );
}
