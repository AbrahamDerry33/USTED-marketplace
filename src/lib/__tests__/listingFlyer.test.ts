import { describe, expect, it } from 'vitest';
import {
  buildFlyerFileSlug,
  buildListingShareUrl,
  FLYER_NOTE_MAX_LENGTH,
  formatFlyerDisplayUrl,
  generateListingQrAssets,
  sanitizeFlyerNote,
  truncateFlyerDescription,
} from '../listingFlyer';

describe('listingFlyer utilities', () => {
  it('builds a canonical share URL and strips trailing slashes', () => {
    expect(buildListingShareUrl('lst-calc-101', 'https://campusmarket.edu.gh/')).toBe(
      'https://campusmarket.edu.gh/listings/lst-calc-101'
    );
    expect(buildListingShareUrl('lst_abc_99', '')).toBe('/listings/lst_abc_99');
  });

  it('rejects invalid listing IDs when building QR URLs', () => {
    expect(() => buildListingShareUrl('../evil', 'https://campusmarket.edu.gh')).toThrow(
      'Invalid listing identifier for QR code.'
    );
    expect(() => buildListingShareUrl('', 'https://campusmarket.edu.gh')).toThrow();
  });

  it('formats display URLs cleanly without protocol or trailing slash', () => {
    expect(formatFlyerDisplayUrl('https://campusmarket.edu.gh/listings/lst-1/')).toBe(
      'campusmarket.edu.gh/listings/lst-1'
    );
  });

  it('generates filesystem-safe download slugs', () => {
    expect(buildFlyerFileSlug('HP Scientific Calculator (FX-991EX)!', 'lst-9988')).toBe(
      'campus-market-hp-scientific-calculator-fx-991ex-lst-9988'
    );
    expect(buildFlyerFileSlug('<b></b>', 'lst-1')).toBe('campus-market-lst-1');
  });

  it('truncates long descriptions on word boundaries and strips HTML', () => {
    const clean = truncateFlyerDescription('<b>Clean</b> desk lamp with USB port.', 100);
    expect(clean).toBe('Clean desk lamp with USB port.');

    const longText =
      'Used for one semester at Legon Hall. Includes original charger, protective carrying sleeve, and extra notes from Level 200 engineering tutorials.';
    const truncated = truncateFlyerDescription(longText, 70);
    expect(truncated.length).toBeLessThanOrEqual(71);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('sanitizes and bounds optional campus meetup notes', () => {
    expect(sanitizeFlyerNote('  <script>x</script>Meet at Balme Library  ')).toBe(
      'xMeet at Balme Library'
    );
    const overlong = 'a'.repeat(FLYER_NOTE_MAX_LENGTH + 40);
    expect(sanitizeFlyerNote(overlong)).toHaveLength(FLYER_NOTE_MAX_LENGTH);
  });

  it('generates real local vector SVG and PNG QR assets for a listing URL', async () => {
    const url = 'https://campusmarket.edu.gh/listings/lst-42';
    const assets = await generateListingQrAssets(url, {
      darkColor: '#064E3B',
      lightColor: '#FFFFFF',
    });

    expect(assets.url).toBe(url);
    expect(assets.svgMarkup).toContain('<svg');
    expect(assets.svgMarkup).toContain('</svg>');
    expect(assets.svgDataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(assets.pngDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
