import React, { useEffect, useState } from 'react';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  formatGhanaPhoneDisplay,
  MOMO_NETWORK_LABEL_MAP,
  MOMO_NETWORK_OPTIONS,
  validateMoMoProfileInput,
} from '../lib/localPayments';
import { updateUserMoMoProfile } from '../services/usersService';
import type { MoMoNetwork } from '../types/marketplace';

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

export function MoMoPayoutSettingsCard() {
  const { user, profile, refreshProfile } = useAuth();

  const [momoNetwork, setMomoNetwork] = useState<MoMoNetwork>(profile?.momoNetwork ?? 'mtn');
  const [momoNumber, setMomoNumber] = useState(profile?.momoNumber ?? '');
  const [momoAccountName, setMomoAccountName] = useState(
    profile?.momoAccountName ?? profile?.displayName ?? ''
  );
  const [editing, setEditing] = useState(!profile?.momoNumber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!profile) return;
    if (profile.momoNetwork) setMomoNetwork(profile.momoNetwork);
    if (profile.momoNumber) setMomoNumber(profile.momoNumber);
    if (profile.momoAccountName) {
      setMomoAccountName(profile.momoAccountName);
    } else if (!momoAccountName && profile.displayName) {
      setMomoAccountName(profile.displayName);
    }
    if (profile.momoNumber && !editing) {
      setEditing(false);
    }
  }, [profile?.momoNetwork, profile?.momoNumber, profile?.momoAccountName, profile?.displayName]);

  if (!user) return null;

  const hasSavedMoMo = Boolean(profile?.momoNetwork && profile?.momoNumber);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const validation = validateMoMoProfileInput({
      momoNetwork,
      momoNumber,
      momoAccountName,
    });
    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0] || 'Check your Mobile Money details.';
      setError(firstErr);
      return;
    }

    setSaving(true);
    try {
      await updateUserMoMoProfile(user.uid, {
        momoNetwork,
        momoNumber,
        momoAccountName,
      });
      await refreshProfile();
      setEditing(false);
      setNotice('Mobile Money payout details saved for student buyers.');
    } catch (err) {
      setError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not save your Mobile Money details right now.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="seller-momo-settings-heading"
      className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-900/15 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-emerald-900" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2
              id="seller-momo-settings-heading"
              className="text-base font-semibold tracking-tight text-zinc-950"
            >
              Seller Mobile Money Details
            </h2>
            <p className="text-xs text-zinc-700">
              Shown to buyers who choose Mobile Money Pre-Payment (MTN MoMo, Telecel Cash, or
              ATMoney).
            </p>
          </div>
        </div>

        {hasSavedMoMo && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setNotice('');
              setError('');
            }}
            aria-label="Edit saved Mobile Money details"
            className={`inline-flex items-center justify-center min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto ${FOCUS_RING_CLASS}`}
          >
            Edit MoMo Number
          </button>
        )}
      </div>

      {error && (
        <p
          className="text-xs sm:text-sm text-red-900 bg-red-50 border border-red-300 rounded-lg px-3.5 py-2.5"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs sm:text-sm text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg px-3.5 py-2.5"
        >
          {notice}
        </p>
      )}

      {hasSavedMoMo && !editing ? (
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#FAF9F6] border border-stone-200 rounded-lg p-3.5 text-xs">
          <div>
            <dt className="text-zinc-600">Preferred Network</dt>
            <dd className="font-semibold text-zinc-950 mt-0.5">
              {profile?.momoNetwork ? MOMO_NETWORK_LABEL_MAP[profile.momoNetwork] : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">MoMo Number</dt>
            <dd className="font-mono font-semibold text-zinc-950 tabular-nums mt-0.5">
              {formatGhanaPhoneDisplay(profile?.momoNumber)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">Registered Name</dt>
            <dd className="font-semibold text-zinc-950 mt-0.5 truncate">
              {profile?.momoAccountName || profile?.displayName}
            </dd>
          </div>
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="seller-momo-network"
                className="block text-xs font-medium text-zinc-800 mb-1"
              >
                MoMo Network
              </label>
              <select
                id="seller-momo-network"
                value={momoNetwork}
                onChange={(e) => setMomoNetwork(e.target.value as MoMoNetwork)}
                disabled={saving}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
              >
                {MOMO_NETWORK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.dialHint})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="seller-momo-number"
                className="block text-xs font-medium text-zinc-800 mb-1"
              >
                Ghana MoMo Number
              </label>
              <input
                id="seller-momo-number"
                type="tel"
                inputMode="tel"
                value={momoNumber}
                onChange={(e) => setMomoNumber(e.target.value)}
                placeholder="024 123 4567"
                maxLength={20}
                required
                disabled={saving}
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
              />
            </div>

            <div>
              <label
                htmlFor="seller-momo-account-name"
                className="block text-xs font-medium text-zinc-800 mb-1"
              >
                Registered Account Name
              </label>
              <input
                id="seller-momo-account-name"
                type="text"
                value={momoAccountName}
                onChange={(e) => setMomoAccountName(e.target.value)}
                placeholder="e.g. Ama Owusu"
                maxLength={80}
                required
                disabled={saving}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              {saving ? 'Saving MoMo Details...' : 'Save MoMo Details'}
            </button>
            {hasSavedMoMo && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError('');
                }}
                className={`inline-flex items-center justify-center min-h-[44px] px-3.5 py-2 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
