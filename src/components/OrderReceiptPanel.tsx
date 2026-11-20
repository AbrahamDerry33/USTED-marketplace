import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck2,
  Image as ImageIcon,
  Receipt,
  Smartphone,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  canBuyerSubmitMoMoProof,
  canSellerReviewMoMoProof,
  formatGhanaPhoneDisplay,
  MOMO_NETWORK_LABEL_MAP,
  MOMO_NETWORK_OPTIONS,
  ORDER_PAYMENT_STATUS_META,
  PAYMENT_METHOD_LABELS,
  resolveNormalizedPaymentStatus,
  validateMoMoProofInput,
} from '../lib/localPayments';
import { formatGhs } from '../lib/money';
import {
  confirmMoMoPaymentReceived,
  rejectMoMoPaymentProof,
  reviewPaymentReceipt,
  submitMoMoPaymentProof,
  submitPaymentReceipt,
  uploadPaymentReceiptImage,
  validateReceiptFile,
} from '../services/ordersService';
import { getUserPublicProfile } from '../services/usersService';
import type { Order, OrderPaymentStatus, UserPublicProfile } from '../types/marketplace';

interface OrderReceiptPanelProps {
  order: Order;
  currentUid: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

function renderPaymentStatusIcon(paymentStatus: OrderPaymentStatus) {
  switch (paymentStatus) {
    case 'verified':
      return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    case 'proof_submitted':
      return <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    case 'pay_on_meetup':
      return <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
    default:
      return <Receipt className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />;
  }
}

function formatDateTime(date: Date | null): string {
  if (!date) return 'Just now';
  return date.toLocaleString('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getFriendlyActionError(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const lower = err.message.toLowerCase();
  if (lower.includes('permission') || lower.includes('insufficient')) {
    return 'You do not have permission to update this payment right now.';
  }
  return err.message.startsWith('{') ? fallback : err.message;
}

export function OrderReceiptPanel({
  order,
  currentUid,
  onNotice,
  onError,
}: OrderReceiptPanelProps) {
  const isBuyer = currentUid === order.buyerId;
  const isSeller = currentUid === order.sellerId;

  const [transactionId, setTransactionId] = useState(
    order.transactionId ?? order.manualReference ?? ''
  );
  const [receiptNote, setReceiptNote] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedMoMo, setCopiedMoMo] = useState(false);

  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewing, setReviewing] = useState<'verify' | 'reject' | null>(null);
  const [sellerProfile, setSellerProfile] = useState<UserPublicProfile | null>(null);

  useEffect(() => {
    setTransactionId(order.transactionId ?? order.manualReference ?? '');
  }, [order.transactionId, order.manualReference]);

  useEffect(() => {
    if (order.paymentMethod !== 'momo_prepayment' && order.paymentMethod !== 'manual_transfer') {
      return;
    }

    let cancelled = false;
    getUserPublicProfile(order.sellerId)
      .then((profile) => {
        if (!cancelled) setSellerProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setSellerProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [order.sellerId, order.paymentMethod]);

  const paymentStatus = resolveNormalizedPaymentStatus(order);
  const paymentMeta = ORDER_PAYMENT_STATUS_META[paymentStatus];
  const isLocalMoMo = order.paymentMethod === 'momo_prepayment';
  const isPayOnMeetup = order.paymentMethod === 'pay_on_meetup';

  const canBuyerSubmit = canBuyerSubmitMoMoProof({ order, actorUid: currentUid }).allowed;
  const canSellerReview = canSellerReviewMoMoProof({ order, actorUid: currentUid }).allowed;

  const resolvedMoMoNetwork = sellerProfile?.momoNetwork ?? order.sellerMoMoNetwork;
  const resolvedMoMoNumber = sellerProfile?.momoNumber ?? order.sellerMoMoNumber;
  const resolvedMoMoAccountName =
    sellerProfile?.momoAccountName ??
    order.sellerMoMoAccountName ??
    sellerProfile?.displayName;

  const dialHint = resolvedMoMoNetwork
    ? MOMO_NETWORK_OPTIONS.find((opt) => opt.value === resolvedMoMoNetwork)?.dialHint
    : undefined;

  const proofUrl = order.receiptUrl ?? order.receiptImageUrl;
  const proofTxId = order.transactionId ?? order.manualReference;

  const handleCopyMoMoNumber = async () => {
    if (!resolvedMoMoNumber || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(resolvedMoMoNumber);
      setCopiedMoMo(true);
      window.setTimeout(() => setCopiedMoMo(false), 1800);
    } catch {
      // Clipboard blocked in restricted preview frame
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateReceiptFile(file);
    if (err) {
      onError(err);
      e.target.value = '';
      return;
    }
    onError('');
    setSelectedFile(file);
  };

  const handleBuyerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    onNotice('');

    const validation = validateMoMoProofInput({
      transactionId,
      receiptNote,
    });

    if (!validation.valid || !validation.data) {
      onError(validation.error || 'Enter a valid Mobile Money Transaction ID.');
      return;
    }

    setSubmitting(true);
    try {
      let uploadedReceiptUrl: string | undefined;
      if (selectedFile) {
        setUploadProgress(0);
        uploadedReceiptUrl = await uploadPaymentReceiptImage(
          currentUid,
          order.id,
          selectedFile,
          setUploadProgress
        );
      }

      if (isLocalMoMo) {
        await submitMoMoPaymentProof({
          orderId: order.id,
          transactionId: validation.data.transactionId,
          receiptUrl: uploadedReceiptUrl,
          receiptNote: validation.data.receiptNote,
        });
      } else {
        await submitPaymentReceipt({
          orderId: order.id,
          manualReference: validation.data.transactionId,
          receiptImageUrl: uploadedReceiptUrl,
          receiptNote: validation.data.receiptNote,
        });
      }

      setSelectedFile(null);
      setUploadProgress(null);
      setReceiptNote('');
      onNotice(
        'Mobile Money Transaction ID submitted. Waiting for the seller to verify receipt and reserve the item.'
      );
    } catch (err) {
      onError(getFriendlyActionError(err, 'Unable to submit payment proof right now.'));
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleSellerReview = async (decision: 'verify' | 'reject') => {
    onError('');
    onNotice('');
    setReviewing(decision);

    try {
      if (isLocalMoMo) {
        if (decision === 'verify') {
          await confirmMoMoPaymentReceived({
            orderId: order.id,
            listingId: order.listingId,
          });
          onNotice(
            'MoMo payment verified and listing reserved! Enter the buyer’s 4-digit PIN at campus meetup to complete.'
          );
        } else {
          await rejectMoMoPaymentProof({
            orderId: order.id,
            note: rejectionReason.trim() || undefined,
          });
          setRejectionReason('');
          onNotice(
            'Payment proof flagged as invalid. Buyer has been asked to re-submit a valid MoMo Transaction ID.'
          );
        }
      } else {
        await reviewPaymentReceipt({
          orderId: order.id,
          decision,
          note: decision === 'reject' ? rejectionReason.trim() || undefined : undefined,
        });

        if (decision === 'verify') {
          onNotice('Manual payment verified. Order is marked Paid and listing is Reserved.');
        } else {
          setRejectionReason('');
          onNotice('Receipt rejected. Order returned to Pending Payment for the buyer.');
        }
      }
    } catch (err) {
      onError(getFriendlyActionError(err, 'Unable to review payment proof right now.'));
    } finally {
      setReviewing(null);
    }
  };

  return (
    <section
      aria-labelledby="receipt-panel-heading"
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-4 border-b border-stone-200">
        <div className="space-y-1">
          <h2 id="receipt-panel-heading" className="text-base font-semibold text-zinc-950">
            {isPayOnMeetup
              ? 'Campus Meetup Payment Details'
              : 'Mobile Money Payment & Proof Verification'}
          </h2>
          <p className="text-xs text-zinc-700">{paymentMeta.description}</p>
        </div>

        <span
          aria-label={`Payment status: ${paymentMeta.label}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border whitespace-nowrap shrink-0 ${paymentMeta.badgeClass}`}
        >
          {renderPaymentStatusIcon(paymentStatus)}
          <span>{paymentMeta.shortLabel}</span>
        </span>
      </div>

      {/* Pay on Campus Meetup Banner */}
      {isPayOnMeetup && (
        <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-4 space-y-2 text-xs text-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-950">
              {PAYMENT_METHOD_LABELS.pay_on_meetup}
            </span>
            <span className="font-mono font-semibold text-emerald-950 tabular-nums">
              {formatGhs(order.amountPesewas)} due at meetup
            </span>
          </div>
          <p className="text-zinc-700 leading-relaxed">
            {order.status === 'completed'
              ? 'In-person payment and campus handover PIN verification have been completed.'
              : isBuyer
                ? 'Inspect the item at your agreed campus meetup point, pay the seller via Cash or MoMo in person, and share your 4-digit Handover PIN above only after inspection.'
                : 'Meet the buyer on campus, collect Cash or Mobile Money in person, and enter their 4-digit Handover PIN above to confirm payment and complete the order.'}
          </p>
        </div>
      )}

      {/* Seller Mobile Money Wallet Instructions (for MoMo Pre-Payment) */}
      {(isLocalMoMo || order.paymentMethod === 'manual_transfer') && (
        <div className="bg-emerald-50/70 border border-emerald-900/20 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
              <Smartphone className="w-4 h-4 text-emerald-900 shrink-0" aria-hidden="true" />
              <span>Send MoMo Transfer To</span>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-950 tabular-nums">
              {formatGhs(order.amountPesewas)}
            </span>
          </div>

          {resolvedMoMoNumber ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white border border-stone-200 rounded-lg p-3">
              <div>
                <span className="text-zinc-600 block">Network</span>
                <span className="font-semibold text-zinc-950">
                  {resolvedMoMoNetwork ? MOMO_NETWORK_LABEL_MAP[resolvedMoMoNetwork] : 'Mobile Money'}
                  {dialHint ? ` (${dialHint})` : ''}
                </span>
              </div>
              <div>
                <span className="text-zinc-600 block">MoMo Number</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-bold text-zinc-950 tabular-nums">
                    {formatGhanaPhoneDisplay(resolvedMoMoNumber)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyMoMoNumber()}
                    aria-label="Copy seller MoMo number"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded transition-colors ${FOCUS_RING_CLASS}`}
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    {copiedMoMo ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-zinc-600 block">Account Name</span>
                <span className="font-semibold text-zinc-950">
                  {resolvedMoMoAccountName || 'Verified Campus Seller'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              {isSeller
                ? 'You have not configured your Mobile Money number yet. Add it on your Seller Dashboard so buyers see it automatically.'
                : 'The seller has not saved a MoMo wallet number on their profile yet. Confirm their MoMo details in listing chat before sending funds.'}
            </p>
          )}
        </div>
      )}

      {/* Existing Submitted Proof Details */}
      {(proofTxId || proofUrl || order.receiptStatus !== 'none' || paymentStatus === 'proof_submitted') && (
        <div className="bg-[#FAF9F6] border border-stone-200 rounded-lg p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-zinc-600 block">Payment Method</span>
              <span className="font-medium text-zinc-950">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </span>
            </div>
            <div>
              <span className="text-zinc-600 block">MoMo Transaction ID</span>
              <span className="font-mono font-semibold text-zinc-950">
                {proofTxId || '—'}
              </span>
            </div>
            <div>
              <span className="text-zinc-600 block">Proof Submitted</span>
              <span className="text-zinc-900">{formatDateTime(order.receiptSubmittedAt)}</span>
            </div>
          </div>

          {order.receiptStatus === 'rejected' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold block">Previous proof flagged by seller</span>
                <span>
                  {order.receiptNote
                    ? `Seller note: "${order.receiptNote}"`
                    : 'Double-check your MoMo Transaction ID and re-submit below.'}
                </span>
              </div>
            </div>
          )}

          {order.receiptNote && order.receiptStatus !== 'rejected' && (
            <div className="pt-2 border-t border-stone-200 text-xs">
              <span className="text-zinc-600 block mb-0.5">Buyer Note</span>
              <p className="text-zinc-900">{order.receiptNote}</p>
            </div>
          )}

          {proofUrl && (
            <div className="pt-2 border-t border-stone-200 space-y-2">
              <span className="text-xs text-zinc-600 block">Uploaded Transfer Screenshot / Receipt</span>
              {!previewFailed ? (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-xs border border-stone-200 rounded-lg overflow-hidden bg-white hover:opacity-95 transition-opacity"
                >
                  <img
                    src={proofUrl}
                    alt={`Payment receipt proof for order ${order.id}`}
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewFailed(true)}
                    className="w-full max-h-56 object-contain bg-stone-50"
                  />
                </a>
              ) : (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 underline"
                >
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  Open uploaded receipt image
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Buyer: Submit Mobile Money Transaction ID & Optional Receipt Screenshot */}
      {canBuyerSubmit && (
        <form onSubmit={handleBuyerSubmit} className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-950">
              {order.receiptStatus === 'rejected'
                ? 'Re-submit Mobile Money Transaction ID'
                : 'Submit Mobile Money Payment Proof'}
            </h3>
            <p className="text-xs text-zinc-700">
              After sending <strong className="font-mono text-zinc-950">{formatGhs(order.amountPesewas)}</strong>{' '}
              via MTN MoMo, Telecel Cash, or ATMoney, enter your Transaction ID and optionally
              attach a screenshot.
            </p>
          </div>

          <div>
            <label
              htmlFor="momo-transaction-id"
              className="block text-xs font-medium text-zinc-800 mb-1"
            >
              Mobile Money Transaction ID
            </label>
            <input
              id="momo-transaction-id"
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. 24981730411 or MP261120.1422"
              maxLength={80}
              required
              disabled={submitting}
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900 font-mono"
            />
          </div>

          <div>
            <label
              htmlFor="receipt-file"
              className="block text-xs font-medium text-zinc-800 mb-1"
            >
              Transfer Screenshot / Receipt (optional)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="receipt-file"
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg cursor-pointer transition-colors"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                {selectedFile ? 'Change Screenshot' : 'Attach Screenshot (JPEG/PNG/WebP)'}
              </label>
              <input
                id="receipt-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={submitting}
                className="sr-only"
              />
              {selectedFile && (
                <div className="inline-flex items-center gap-1.5 text-xs text-zinc-700 bg-[#FAF9F6] border border-stone-200 rounded-md px-2.5 py-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-900" aria-hidden="true" />
                  <span className="truncate max-w-[180px]">{selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    aria-label="Remove selected receipt image"
                    className="text-zinc-500 hover:text-zinc-900"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            {uploadProgress !== null && (
              <p className="mt-1.5 text-xs text-emerald-900 font-medium tabular-nums">
                Uploading screenshot: {uploadProgress}%
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="receipt-note"
              className="block text-xs font-medium text-zinc-800 mb-1"
            >
              Optional Note for Seller
            </label>
            <input
              id="receipt-note"
              type="text"
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              placeholder="e.g. Sent from 024***4421, ready to meet at Balme Library"
              maxLength={300}
              disabled={submitting}
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {submitting ? 'Submitting Proof...' : 'Submit MoMo Proof of Payment'}
          </button>
        </form>
      )}

      {/* Seller: Verify MoMo Receipt & Reserve Listing OR Flag Invalid Proof */}
      {canSellerReview && (
        <div className="pt-2 border-t border-stone-200 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-950">
              Verify Mobile Money Receipt
            </h3>
            <p className="text-xs text-zinc-700">
              Confirm your MoMo SMS alert shows Transaction ID{' '}
              <strong className="font-mono text-zinc-950">
                {proofTxId || 'above'}
              </strong>{' '}
              for <strong className="font-mono text-zinc-950">{formatGhs(order.amountPesewas)}</strong>{' '}
              before confirming. Confirming automatically reserves the listing for this buyer.
            </p>
          </div>

          <div>
            <label
              htmlFor="seller-reject-note"
              className="block text-xs font-medium text-zinc-800 mb-1"
            >
              Note to buyer (optional — sent if flagging invalid proof)
            </label>
            <input
              id="seller-reject-note"
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Transaction ID not found in my MoMo statement yet"
              maxLength={300}
              disabled={reviewing !== null}
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={reviewing !== null}
              onClick={() => void handleSellerReview('verify')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              {reviewing === 'verify'
                ? 'Confirming & Reserving...'
                : 'Confirm MoMo Receipt & Reserve Listing'}
            </button>
            <button
              type="button"
              disabled={reviewing !== null}
              onClick={() => void handleSellerReview('reject')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-50 transition-colors ${FOCUS_RING_CLASS}`}
            >
              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              {reviewing === 'reject' ? 'Flagging Proof...' : 'Flag Invalid Proof'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
