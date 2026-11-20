import { describe, expect, it } from 'vitest';
import {
  extractMapsGroundingLinks,
  formatUpstreamAiError,
  validateAspectRatio,
  validateChatModel,
  validateRolePreset,
} from '../aiValidation';

describe('aiValidation helpers', () => {
  it('validates allowed Gemini chat models and rejects unsupported ones', () => {
    expect(validateChatModel('gemini-4-hydrogen')).toBe('gemini-4-hydrogen');
    expect(validateChatModel('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite');
    expect(validateChatModel('gemini-4-carbon')).toBe('gemini-4-carbon');
    expect(validateChatModel('gemini-4-argon')).toBe('gemini-4-argon');
    expect(() => validateChatModel('gemini-1.5-pro')).toThrow(/Unsupported model/);
  });

  it('defaults unknown role presets safely to campus-buyer', () => {
    expect(validateRolePreset('seller-coach')).toBe('seller-coach');
    expect(validateRolePreset('unknown-role')).toBe('campus-buyer');
  });

  it('enforces 16:9 or 9:16 video aspect ratios strictly', () => {
    expect(validateAspectRatio('16:9')).toBe('16:9');
    expect(validateAspectRatio('9:16')).toBe('9:16');
    expect(() => validateAspectRatio('1:1')).toThrow(/16:9.*9:16/);
  });

  it('extracts deduplicated Google Maps grounding URIs and review snippets', () => {
    const places = extractMapsGroundingLinks([
      {
        maps: {
          title: 'Balme Library',
          uri: 'https://maps.google.com/?cid=123',
          placeId: 'places/123',
          placeAnswerSources: {
            reviewSnippets: [
              {
                text: 'Quiet public study plaza during daytime.',
                googleMapsUri: 'https://maps.google.com/review/1',
                authorAttribution: { displayName: 'Kofi M.' },
              },
            ],
          },
        },
      },
      {
        maps: {
          title: 'Balme Library Duplicate',
          uri: 'https://maps.google.com/?cid=123',
        },
      },
      { web: { uri: 'https://example.com', title: 'Ignored web chunk' } },
      null,
    ]);

    expect(places).toEqual([
      {
        title: 'Balme Library',
        uri: 'https://maps.google.com/?cid=123',
        placeId: 'places/123',
        reviewSnippets: [
          {
            text: 'Quiet public study plaza during daytime.',
            uri: 'https://maps.google.com/review/1',
            author: 'Kofi M.',
          },
        ],
      },
    ]);
  });

  it('formats 429 / quota upstream errors transparently without faking success', () => {
    const quotaErr = formatUpstreamAiError(
      Object.assign(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'), { status: 429 })
    );
    expect(quotaErr.statusCode).toBe(429);
    expect(quotaErr.requiresPaidKey).toBe(true);
    expect(quotaErr.message).toContain('Settings > Secrets > GEMINI_API_KEY');

    const genericErr = formatUpstreamAiError(new Error('Upstream timeout'));
    expect(genericErr.statusCode).toBe(500);
    expect(genericErr.requiresPaidKey).toBe(false);
    expect(genericErr.message).toBe('Upstream timeout');
  });
});
