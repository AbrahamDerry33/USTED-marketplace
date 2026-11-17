/**
 * Pure monetary helpers for Ghana cedis (GHS) and pesewas.
 * All money is stored internally as whole pesewas (1 GHS = 100 pesewas).
 */

export function ghsToPesewas(input: string | number): number | null {
  const raw = typeof input === 'number' ? String(input) : input.trim();
  if (!raw) return null;

  // Accept optional digits with up to 2 decimal places, no negatives or scientific notation
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return null;
  }

  const [wholePart, fracPart = ''] = raw.split('.');
  const whole = Number(wholePart);
  const frac = Number(fracPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) {
    return null;
  }

  const pesewas = whole * 100 + frac;
  if (!Number.isSafeInteger(pesewas) || pesewas <= 0) {
    return null;
  }
  return pesewas;
}

export function pesewasToGhsString(pesewas: number): string {
  if (!Number.isFinite(pesewas) || !Number.isInteger(pesewas) || pesewas < 0) {
    return '0.00';
  }
  const whole = Math.floor(pesewas / 100);
  const remainder = pesewas % 100;
  return `${whole}.${String(remainder).padStart(2, '0')}`;
}

export function formatGhs(pesewas: number): string {
  if (!Number.isFinite(pesewas) || !Number.isInteger(pesewas) || pesewas < 0) {
    return 'GHS 0.00';
  }
  const whole = Math.floor(pesewas / 100);
  const remainder = pesewas % 100;
  return `GHS ${whole.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}
