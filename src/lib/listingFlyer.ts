import QRCode from 'qrcode';
import { isValidFirestoreId, stripHtmlTags } from './listingValidation';

export type FlyerLayoutMode = 'poster' | 'tearoff' | 'compact';

export const FLYER_LAYOUT_OPTIONS: {
  value: FlyerLayoutMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'poster',
    label: 'Noticeboard Poster',
    description: 'Single full-page flyer with large photo and QR code.',
  },
  {
    value: 'tearoff',
    label: 'Tear-Off Tabs',
    description: 'Poster plus 5 cut-and-tear strips with mini QR codes.',
  },
  {
    value: 'compact',
    label: '2-Up Half Sheets',
    description: 'Two compact flyers per sheet to save campus printing cost.',
  },
];

export const FLYER_NOTE_MAX_LENGTH = 120;
export const FLYER_DESCRIPTION_MAX_LENGTH = 240;
export const TEAROFF_STRIP_COUNT = 5;

/**
 * Builds the canonical shareable URL for a listing detail page.
 */
export function buildListingShareUrl(listingId: string, origin?: string): string {
  const cleanId = listingId.trim();
  if (!isValidFirestoreId(cleanId)) {
    throw new Error('Invalid listing identifier for QR code.');
  }

  const resolvedOrigin =
    (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).trim().replace(/\/+$/, '');

  const path = `/listings/${encodeURIComponent(cleanId)}`;
  return resolvedOrigin ? `${resolvedOrigin}${path}` : path;
}

/**
 * Formats a full listing URL into a readable label printed under the QR code.
 */
export function formatFlyerDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Produces a filesystem-safe download filename stem for exported QR assets.
 */
export function buildFlyerFileSlug(title: string, listingId: string): string {
  const normalizedTitle = stripHtmlTags(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const safeId = listingId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'item';
  return normalizedTitle ? `campus-market-${normalizedTitle}-${safeId}` : `campus-market-${safeId}`;
}

/**
 * Truncates long listing descriptions cleanly on word boundaries so physical flyers stay single-page.
 */
export function truncateFlyerDescription(
  description: string,
  maxChars = FLYER_DESCRIPTION_MAX_LENGTH
): string {
  const clean = stripHtmlTags(description);
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const cutoff = lastSpace > Math.floor(maxChars * 0.65) ? sliced.slice(0, lastSpace) : sliced;
  return `${cutoff.replace(/[.,;:!?-]+$/, '')}…`;
}

/**
 * Sanitizes an optional seller meetup/pickup note printed on the physical flyer.
 */
export function sanitizeFlyerNote(note: string, maxChars = FLYER_NOTE_MAX_LENGTH): string {
  return stripHtmlTags(note).slice(0, maxChars).trim();
}

export interface GeneratedListingQrAssets {
  url: string;
  svgMarkup: string;
  svgDataUrl: string;
  pngDataUrl: string;
}

/**
 * Generates crisp vector SVG + high-resolution PNG QR codes locally (zero external API calls).
 * Uses High (H) error correction so creased or stapled noticeboard flyers still scan reliably.
 */
export async function generateListingQrAssets(
  url: string,
  options?: { darkColor?: string; lightColor?: string }
): Promise<GeneratedListingQrAssets> {
  const dark = options?.darkColor ?? '#18181B';
  const light = options?.lightColor ?? '#FFFFFF';

  const [svgMarkup, pngDataUrl] = await Promise.all([
    QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
      color: { dark, light },
    }),
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      width: 1024,
      margin: 2,
      color: { dark, light },
    }),
  ]);

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  return {
    url,
    svgMarkup,
    svgDataUrl,
    pngDataUrl,
  };
}
