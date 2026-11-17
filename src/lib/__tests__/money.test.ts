import { describe, it, expect } from 'vitest';
import { formatGhs, ghsToPesewas, pesewasToGhsString } from '../money';

describe('money helpers (pesewas & GHS)', () => {
  it('converts valid GHS strings and numbers into exact integer pesewas', () => {
    expect(ghsToPesewas('1')).toBe(100);
    expect(ghsToPesewas('125.5')).toBe(12550);
    expect(ghsToPesewas('125.50')).toBe(12550);
    expect(ghsToPesewas('0.99')).toBe(99);
    expect(ghsToPesewas(45.25)).toBe(4525);
  });

  it('rejects negative, zero, non-numeric, or >2 decimal values', () => {
    expect(ghsToPesewas('')).toBeNull();
    expect(ghsToPesewas('0')).toBeNull();
    expect(ghsToPesewas('0.00')).toBeNull();
    expect(ghsToPesewas('-50')).toBeNull();
    expect(ghsToPesewas('12.345')).toBeNull();
    expect(ghsToPesewas('1e5')).toBeNull();
    expect(ghsToPesewas('abc')).toBeNull();
  });

  it('formats pesewas back to GHS strings cleanly', () => {
    expect(pesewasToGhsString(12550)).toBe('125.50');
    expect(pesewasToGhsString(105)).toBe('1.05');
    expect(formatGhs(12550)).toBe('GHS 125.50');
    expect(formatGhs(150000)).toBe('GHS 1,500.00');
    expect(formatGhs(-10)).toBe('GHS 0.00');
  });
});
