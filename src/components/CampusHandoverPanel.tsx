import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import {
  generateHandoverQrDataUrl,
  isValidHandoverPin,
  parseHandoverQrOrPin,
  resolveNormalizedPaymentStatus,
} from '../lib/localPayments';
import {
  confirmCampusHandoverWithPin,
  subscribeBuyerHandoverPin,
} from '../services/ordersService';
import type { Order } from '../types/marketplace';

interface CampusHandoverPanelProps {
  order: Order;
  currentUid: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

const FOCUS_RING_CLASS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900';

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

function getFriendlyPinError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Unable to confirm campus handover right now.';
  }
  const msg = err.message.toLowerCase();
  if (msg.includes('permission') || msg.includes('insufficient')) {
    return 'That 4-digit PIN did not match the buyer’s handover PIN, or this order is not ready for handover.';
  }
  return err.message.startsWith('{')
    ? 'Could not verify the handover PIN. Please check the 4 digits and try again.'
    : err.message;
}

export function CampusHandoverPanel({
  order,
  currentUid,
  onNotice,
  onError,
}: CampusHandoverPanelProps) {
  const isBuyer = currentUid === order.buyerId;
  const isSeller = currentUid === order.sellerId;
  const paymentStatus = resolveNormalizedPaymentStatus(order);

  // Buyer-only PIN state (isolated in /orders/{orderId}/secrets/handover)
  const [buyerPin, setBuyerPin] = useState<string | null>(order.handoverPin ?? null);
  const [pinLoading, setPinLoading] = useState(Boolean(isBuyer && !order.handoverPin));
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedPin, setCopiedPin] = useState(false);

  // Seller verification state
  const [enteredPin, setEnteredPin] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submittingPin, setSubmittingPin] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isBuyer) {
      setPinLoading(false);
      return;
    }

    if (order.handoverPin && isValidHandoverPin(order.handoverPin)) {
      setBuyerPin(order.handoverPin);
      setPinLoading(false);
      return;
    }

    setPinLoading(true);
    const unsubscribe = subscribeBuyerHandoverPin(
      order.id,
      (pin) => {
        setBuyerPin(pin);
        setPinLoading(false);
      },
      () => {
        setPinLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isBuyer, order.id, order.handoverPin]);

  useEffect(() => {
    if (!isBuyer || !buyerPin || !isValidHandoverPin(buyerPin)) {
      setQrDataUrl('');
      return;
    }

    let cancelled = false;
    generateHandoverQrDataUrl(order.id, buyerPin)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [isBuyer, order.id, buyerPin]);

  const stopCamera = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleCopyPin = async () => {
    if (!buyerPin || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(buyerPin);
      setCopiedPin(true);
      window.setTimeout(() => setCopiedPin(false), 1800);
    } catch {
      // Clipboard blocked in restricted iframe; user can read the large digits directly
    }
  };

  const handleStartCameraScan = async () => {
    setCameraError('');
    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;

    if (!DetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'In-browser QR camera scanning is unavailable here. Ask the buyer for their 4-digit PIN or paste the scanned code below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new DetectorCtor({ formats: ['qr_code'] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const raw = results[0]?.rawValue;
          if (!raw) return;
          const parsed = parseHandoverQrOrPin(raw, order.id);
          if (parsed.valid && parsed.pin) {
            setEnteredPin(parsed.pin);
            setQrInput(raw);
            stopCamera();
            setShowQrScanner(false);
            onNotice(`QR code read cleanly (PIN ${parsed.pin}). Tap Confirm Campus Handover to complete.`);
          }
        } catch {
          // Ignore single frame detection error
        }
      }, 450);
    } catch {
      stopCamera();
      setCameraError(
        'Camera permission was declined or unavailable. Type the 4-digit PIN directly instead.'
      );
    }
  };

  const handleApplyQrPayload = () => {
    onError('');
    const parsed = parseHandoverQrOrPin(qrInput, order.id);
    if (!parsed.valid || !parsed.pin) {
      onError(parsed.error || 'Could not extract a valid 4-digit PIN from that QR code.');
      return;
    }
    setEnteredPin(parsed.pin);
    setShowQrScanner(false);
    onNotice(`Handover code verified (PIN ${parsed.pin}). Confirm campus handover below.`);
  };

  const handleSellerConfirmHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    onNotice('');

    const parsed = parseHandoverQrOrPin(enteredPin, order.id);
    if (!parsed.valid || !parsed.pin) {
      onError(parsed.error || 'Enter the buyer’s 4-digit numeric handover PIN.');
      return;
    }

    setSubmittingPin(true);
    try {
      await confirmCampusHandoverWithPin({
        orderId: order.id,
        listingId: order.listingId,
        enteredPin: parsed.pin,
      });
      setEnteredPin('');
      stopCamera();
      onNotice(
        'Campus handover confirmed! Order is now Completed, listing marked Sold, and buyer reviews unlocked.'
      );
    } catch (err) {
      onError(getFriendlyPinError(err));
    } finally {
      setSubmittingPin(false);
    }
  };

  const isClosed =
    order.status === 'cancelled' ||
    order.status === 'disputed' ||
    order.status === 'refunded';

  const canSellerConfirmPin =
    isSeller &&
    order.status !== 'completed' &&
    !isClosed &&
    (paymentStatus === 'pay_on_meetup' || paymentStatus === 'verified');

  const isWaitingForMoMoVerification =
    isSeller &&
    order.status !== 'completed' &&
    !isClosed &&
    order.paymentMethod === 'momo_prepayment' &&
    paymentStatus !== 'verified';

  // Hide panel only for non-participants or Paystack orders without handover PIN set
  if (!isBuyer && !isSeller) return null;
  if (!order.handoverPinSet && !buyerPin && order.paymentMethod === 'paystack') {
    return null;
  }

  return (
    <section
      id="campus-handover"
      aria-labelledby="campus-handover-heading"
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-4 border-b border-stone-200">
        <div className="space-y-1">
          <h2 id="campus-handover-heading" className="text-base font-semibold text-zinc-950">
            Campus Meetup Handover Verification
          </h2>
          <p className="text-xs text-zinc-700">
            {order.status === 'completed'
              ? 'Physical campus handover confirmed with the 4-digit buyer PIN.'
              : isBuyer
                ? 'Keep your 4-digit PIN private until you inspect the item together on campus.'
                : 'Enter the buyer’s 4-digit PIN (or scan their handover QR code) at meetup to complete this sale.'}
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border whitespace-nowrap shrink-0 ${
            order.status === 'completed'
              ? 'bg-emerald-900 text-white border-emerald-950'
              : 'bg-stone-100 text-zinc-900 border-stone-300'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {order.status === 'completed' ? 'Handover Verified' : 'PIN Protected'}
        </span>
      </div>

      {/* Completed Handover Summary */}
      {order.status === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Transaction Completed &amp; Item Marked Sold</span>
            </div>
            {order.handoverPin && (
              <span className="font-mono text-xs font-semibold text-emerald-950 bg-white border border-emerald-300 px-2.5 py-1 rounded tabular-nums">
                PIN {order.handoverPin} Verified
              </span>
            )}
          </div>

          {isBuyer && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-emerald-200">
              <p className="text-xs text-emerald-950">
                Your verified campus purchase is complete. Share feedback to help other students.
              </p>
              <Link
                to={`/listings/${order.listingId}?review=write#listing-reviews`}
                aria-label={`Rate and review this transaction for ${order.listingTitle}`}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors whitespace-nowrap shrink-0 ${FOCUS_RING_CLASS}`}
              >
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Rate &amp; Review This Transaction
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Buyer-Only Secret Handover PIN + Scannable QR Code */}
      {isBuyer && order.status !== 'completed' && !isClosed && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#FAF9F6] border border-stone-200 rounded-xl p-4 sm:p-5">
          <div className="md:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Visible Only to You (Buyer)</span>
            </div>

            {pinLoading ? (
              <div className="h-16 w-48 bg-stone-200 rounded-lg animate-pulse" />
            ) : buyerPin ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-700">Your 4-Digit Handover Confirmation PIN</p>
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    aria-label={`Buyer handover PIN: ${buyerPin.split('').join(' ')}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-emerald-900 rounded-xl font-mono text-2xl sm:text-3xl font-bold tracking-[0.28em] text-zinc-950 tabular-nums"
                  >
                    {buyerPin}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyPin()}
                    aria-label="Copy 4-digit handover PIN"
                    className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-medium text-zinc-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    {copiedPin ? 'Copied PIN' : 'Copy PIN'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-700">
                Handover PIN is unavailable for this legacy order.
              </p>
            )}

            <p className="text-xs text-zinc-700 leading-relaxed">
              {paymentStatus === 'pay_on_meetup'
                ? 'Meet at a public campus spot (such as Balme Library or Night Market). Pay Cash or MoMo in person after inspecting the item, then give the seller this PIN or let them scan the QR code.'
                : paymentStatus === 'verified'
                  ? 'Your MoMo payment is verified. Share this PIN or QR code with the seller once they hand over the item.'
                  : 'Submit your MoMo Transaction ID above first so the seller can verify payment and reserve this listing for your meetup.'}
            </p>
          </div>

          <div className="md:col-span-5 flex flex-col items-center justify-center bg-white border border-stone-200 rounded-xl p-4 space-y-2">
            {qrDataUrl ? (
              <>
                <img
                  src={qrDataUrl}
                  alt={`Handover QR code for order ${order.id}`}
                  className="w-40 h-40 object-contain"
                />
                <span className="text-[11px] font-medium text-zinc-700 text-center">
                  Scan at campus meetup to confirm handover
                </span>
              </>
            ) : (
              <div className="w-40 h-40 flex flex-col items-center justify-center text-zinc-500 text-xs text-center gap-2">
                <QrCode className="w-8 h-8" aria-hidden="true" />
                <span>QR unavailable</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seller "Confirm Campus Handover" PIN Verification Module */}
      {isSeller && order.status !== 'completed' && !isClosed && (
        <div className="space-y-4">
          {isWaitingForMoMoVerification ? (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-xs sm:text-sm text-amber-950 space-y-1">
              <p className="font-semibold">
                Verify Mobile Money payment before confirming campus handover
              </p>
              <p className="text-xs">
                {paymentStatus === 'proof_submitted'
                  ? 'The buyer has submitted MoMo payment proof. Confirm receipt in the panel below first to reserve the listing and unlock handover PIN confirmation.'
                  : 'Waiting for the buyer to send MoMo pre-payment and submit their Transaction ID.'}
              </p>
            </div>
          ) : canSellerConfirmPin ? (
            <form onSubmit={handleSellerConfirmHandover} className="space-y-4">
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-zinc-950 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-emerald-900" aria-hidden="true" />
                      Confirm Campus Handover
                    </h3>
                    <p className="text-xs text-zinc-700">
                      {paymentStatus === 'pay_on_meetup'
                        ? 'Collect Cash or MoMo in person from the buyer, then enter their 4-digit Handover PIN to complete the sale.'
                        : 'Once you hand over the item to the buyer, enter their 4-digit Handover PIN to finalize the transaction.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (showQrScanner) {
                        stopCamera();
                        setShowQrScanner(false);
                      } else {
                        setShowQrScanner(true);
                      }
                    }}
                    aria-expanded={showQrScanner}
                    aria-label="Scan or verify buyer handover QR code"
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-900/20 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto ${FOCUS_RING_CLASS}`}
                  >
                    <QrCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {showQrScanner ? 'Close QR Scanner' : 'Scan / Paste Handover QR'}
                  </button>
                </div>

                {showQrScanner && (
                  <div className="bg-white border border-stone-300 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        Verify Handover QR Code
                      </span>
                      {!cameraActive ? (
                        <button
                          type="button"
                          onClick={() => void handleStartCameraScan()}
                          className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg transition-colors ${FOCUS_RING_CLASS}`}
                        >
                          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                          Use Camera Scanner
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="inline-flex items-center gap-1 min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-800 bg-stone-100 hover:bg-stone-200 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          Stop Camera
                        </button>
                      )}
                    </div>

                    {cameraActive && (
                      <div className="rounded-lg overflow-hidden bg-zinc-950 max-w-xs mx-auto">
                        <video
                          ref={videoRef}
                          muted
                          playsInline
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    )}

                    {cameraError && <p className="text-xs text-amber-900">{cameraError}</p>}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={qrInput}
                        onChange={(e) => setQrInput(e.target.value)}
                        aria-label="Paste scanned handover QR payload"
                        placeholder="Paste QR payload (campusmarket://handover?...)"
                        className="flex-1 min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
                      />
                      <button
                        type="button"
                        onClick={handleApplyQrPayload}
                        className={`min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg whitespace-nowrap ${FOCUS_RING_CLASS}`}
                      >
                        Extract PIN
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="sm:w-52">
                    <label
                      htmlFor="seller-handover-pin"
                      className="block text-xs font-medium text-zinc-800 mb-1"
                    >
                      Buyer’s 4-Digit Handover PIN
                    </label>
                    <input
                      id="seller-handover-pin"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      autoComplete="one-time-code"
                      maxLength={4}
                      value={enteredPin}
                      onChange={(e) =>
                        setEnteredPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="0000"
                      disabled={submittingPin}
                      required
                      className="w-full min-h-[46px] px-3.5 py-2 text-lg font-mono font-bold tracking-[0.3em] text-center bg-white border border-stone-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-900/20 focus:border-emerald-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingPin || enteredPin.length !== 4}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[46px] px-5 py-2.5 text-xs sm:text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap ${FOCUS_RING_CLASS}`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {submittingPin ? 'Verifying PIN...' : 'Confirm Campus Handover'}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </section>
  );
}
