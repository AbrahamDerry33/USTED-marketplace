import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { MessageSquare, Send, Tag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buildQuickOfferPresets,
  calculateOfferDeltaPercent,
  CHAT_MESSAGE_MAX_LENGTH,
  sortChatMessages,
  sortChatThreads,
  validateChatMessageInput,
} from '../lib/chat';
import { formatGhs, ghsToPesewas, pesewasToGhsString } from '../lib/money';
import {
  sendListingChatMessage,
  subscribeBuyerListingThread,
  subscribeListingChatMessages,
  subscribeSellerListingThreads,
} from '../services/chatService';
import type {
  Listing,
  ListingChatMessage,
  ListingChatMessageType,
  ListingChatThread,
} from '../types/marketplace';

interface ListingChatCardProps {
  listing: Listing;
  isOwner: boolean;
}

const BUYER_QUICK_QUESTIONS = [
  'Is this item still available?',
  'Is the price negotiable?',
  'Where on campus can we meet for pickup?',
];

function formatMessageTime(date: Date | null): string {
  if (!date) return 'Sending...';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatOfferDeltaLabel(offerPesewas: number, askingPesewas: number): string {
  const deltaPct = calculateOfferDeltaPercent(offerPesewas, askingPesewas);
  if (deltaPct === null) return '';
  if (deltaPct === 0) return 'Matches asking price';
  if (deltaPct < 0) return `${Math.abs(deltaPct)}% below asking`;
  return `${deltaPct}% above asking`;
}

function formatChatActionError(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  const trimmed = err.message.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string };
      const inner = String(parsed.error || '').toLowerCase();
      if (inner.includes('permission') || inner.includes('insufficient')) {
        return 'Unable to send right now. Verify your student email and confirm this listing is still active.';
      }
    } catch {
      // Fall back to generic message
    }
    return fallback;
  }
  return trimmed;
}

export function ListingChatCard({ listing, isOwner }: ListingChatCardProps) {
  const { user, profile, isVerified } = useAuth();
  const sellerFirstName = listing.sellerName.trim().split(/\s+/)[0] || 'Seller';

  // Thread state (buyer sees 0..1 thread; seller sees 0..N buyer threads)
  const [buyerThread, setBuyerThread] = useState<ListingChatThread | null>(null);
  const [sellerThreads, setSellerThreads] = useState<ListingChatThread[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState('');

  // Messages state for active thread
  const [messages, setMessages] = useState<ListingChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');

  // Composer state
  const [composerMode, setComposerMode] = useState<ListingChatMessageType>('text');
  const [body, setBody] = useState('');
  const [offerGhs, setOfferGhs] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevMessageCountRef = useRef(0);

  const sortedSellerThreads = useMemo(
    () => sortChatThreads(sellerThreads),
    [sellerThreads]
  );

  // Reset composer when navigating between listings
  useEffect(() => {
    setComposerMode('text');
    setBody('');
    setOfferGhs('');
    setFieldErrors({});
    setSendError('');
    setSelectedBuyerId(null);
    prevMessageCountRef.current = 0;
  }, [listing.id]);

  // Subscribe to thread metadata
  useEffect(() => {
    if (!user || !isVerified) {
      setBuyerThread(null);
      setSellerThreads([]);
      setThreadsLoading(false);
      setThreadsError('');
      return;
    }

    setThreadsLoading(true);
    setThreadsError('');

    if (isOwner) {
      const unsubscribe = subscribeSellerListingThreads(
        listing.id,
        user.uid,
        (items) => {
          setSellerThreads(items);
          setThreadsLoading(false);
          setThreadsError('');
        },
        () => {
          setThreadsLoading(false);
          setThreadsError('Unable to load buyer conversations right now.');
        }
      );
      return () => unsubscribe();
    }

    const unsubscribe = subscribeBuyerListingThread(
      listing.id,
      user.uid,
      (thread) => {
        setBuyerThread(thread);
        setThreadsLoading(false);
        setThreadsError('');
      },
      () => {
        setThreadsLoading(false);
        setThreadsError('Unable to connect to seller chat right now.');
      }
    );

    return () => unsubscribe();
  }, [listing.id, user, isVerified, isOwner]);

  // Keep seller's selected buyer thread synced with available conversations
  useEffect(() => {
    if (!isOwner) return;
    if (sortedSellerThreads.length === 0) {
      setSelectedBuyerId(null);
      return;
    }
    setSelectedBuyerId((current) => {
      if (current && sortedSellerThreads.some((t) => t.buyerId === current)) {
        return current;
      }
      return sortedSellerThreads[0].buyerId;
    });
  }, [isOwner, sortedSellerThreads]);

  const activeBuyerId = isOwner ? selectedBuyerId : user?.uid ?? null;
  const activeThread = useMemo(() => {
    if (!isOwner) return buyerThread;
    if (!selectedBuyerId) return null;
    return sortedSellerThreads.find((t) => t.buyerId === selectedBuyerId) ?? null;
  }, [isOwner, buyerThread, selectedBuyerId, sortedSellerThreads]);

  // Subscribe to real-time messages for the active thread
  useEffect(() => {
    if (!user || !isVerified || !activeBuyerId) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError('');
      return;
    }

    setMessagesLoading(true);
    setMessagesError('');
    prevMessageCountRef.current = 0;

    const unsubscribe = subscribeListingChatMessages(
      listing.id,
      activeBuyerId,
      user.uid,
      isOwner ? 'seller' : 'buyer',
      (items) => {
        setMessages(items);
        setMessagesLoading(false);
        setMessagesError('');
      },
      () => {
        setMessagesLoading(false);
        setMessagesError('Unable to load chat messages right now.');
      }
    );

    return () => unsubscribe();
  }, [listing.id, activeBuyerId, user, isVerified, isOwner]);

  const sortedMessages = useMemo(() => sortChatMessages(messages), [messages]);

  // Keep the chat viewport scrolled to the newest message without scrolling the full page
  useEffect(() => {
    const el = scrollBoxRef.current;
    if (!el) return;
    if (sortedMessages.length > 0 && sortedMessages.length !== prevMessageCountRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevMessageCountRef.current = sortedMessages.length;
  }, [sortedMessages.length, activeBuyerId]);

  const offerPresets = useMemo(
    () => buildQuickOfferPresets(listing.pricePesewas),
    [listing.pricePesewas]
  );

  const parsedOfferPesewas = useMemo(() => ghsToPesewas(offerGhs), [offerGhs]);

  const canSendMessage = Boolean(
    user &&
      isVerified &&
      !profile?.banned &&
      listing.status !== 'removed' &&
      (!isOwner || Boolean(activeThread))
  );

  const submitMessage = async () => {
    if (!user || !canSendMessage || !activeBuyerId) return;

    const senderRole = isOwner ? 'seller' : 'buyer';
    const senderName =
      profile?.displayName ||
      user.displayName ||
      (isOwner ? listing.sellerName : 'Campus Student');

    const validation = validateChatMessageInput({
      type: composerMode,
      body,
      offerGhs: composerMode === 'offer' ? offerGhs : undefined,
      senderName,
      senderRole,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSendError('');
    setSending(true);

    try {
      await sendListingChatMessage({
        listingId: listing.id,
        buyerId: activeBuyerId,
        sellerId: listing.sellerId,
        buyerName: isOwner
          ? activeThread?.buyerName || 'Campus Buyer'
          : senderName,
        sellerName: listing.sellerName,
        senderId: user.uid,
        senderName,
        senderRole,
        type: composerMode,
        body,
        offerGhs: composerMode === 'offer' ? offerGhs : undefined,
      });

      setBody('');
      if (composerMode === 'offer') {
        setOfferGhs('');
        setComposerMode('text');
      }
    } catch (err) {
      setSendError(
        formatChatActionError(err, 'Could not send your message. Please try again.')
      );
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sending) {
        void submitMessage();
      }
    }
  };

  const handleQuickQuestion = (promptText: string) => {
    setComposerMode('text');
    setBody(promptText);
    setFieldErrors({});
    setSendError('');
    textareaRef.current?.focus();
  };

  return (
    <section
      id="listing-chat"
      aria-label={isOwner ? 'Buyer messages and offers' : `Chat with ${sellerFirstName}`}
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">
            {isOwner ? 'Buyer Messages & Offers' : `Message ${sellerFirstName}`}
          </h2>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
            <span>
              Asking{' '}
              <span className="font-mono tabular-nums font-medium text-zinc-700">
                {formatGhs(listing.pricePesewas)}
              </span>
            </span>

            {isOwner ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {sortedSellerThreads.length}{' '}
                  {sortedSellerThreads.length === 1 ? 'buyer thread' : 'buyer threads'}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <span>Private 1-on-1 campus chat</span>
              </>
            )}

            {activeThread?.lastOfferPesewas !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-900 font-medium">
                  Latest offer{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {formatGhs(activeThread.lastOfferPesewas)}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Seller Buyer-Thread Selector */}
      {isOwner && !threadsLoading && sortedSellerThreads.length > 0 && (
        <div
          className="border-t border-stone-200 pt-3.5 space-y-2"
          aria-label="Interested buyers"
        >
          <p className="text-xs font-medium text-zinc-500">
            Select a student conversation
          </p>
          <div className="flex flex-wrap gap-2">
            {sortedSellerThreads.map((thread) => {
              const isSelected = thread.buyerId === selectedBuyerId;
              return (
                <button
                  key={thread.buyerId}
                  type="button"
                  onClick={() => {
                    setSelectedBuyerId(thread.buyerId);
                    setFieldErrors({});
                    setSendError('');
                  }}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium transition-colors max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 ${
                    isSelected
                      ? 'bg-emerald-900 text-white'
                      : 'bg-stone-100 text-zinc-800 hover:bg-stone-200'
                  }`}
                >
                  <span className="truncate max-w-[160px]">{thread.buyerName}</span>
                  {thread.lastOfferPesewas !== undefined && (
                    <span
                      className={`font-mono tabular-nums shrink-0 ${
                        isSelected ? 'text-emerald-100' : 'text-emerald-900'
                      }`}
                    >
                      · {formatGhs(thread.lastOfferPesewas)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error Notice */}
      {(threadsError || messagesError) && (
        <p
          role="alert"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {threadsError || messagesError}
        </p>
      )}

      {/* Real-Time Message Stream */}
      <div className="border-t border-stone-200 pt-4">
        {threadsLoading || messagesLoading ? (
          <div className="space-y-3 py-4 animate-pulse" aria-label="Loading messages">
            <div className="h-12 w-2/3 bg-stone-100 rounded-xl" />
            <div className="h-12 w-1/2 bg-stone-200 rounded-xl ml-auto" />
            <div className="h-10 w-3/5 bg-stone-100 rounded-xl" />
          </div>
        ) : isOwner && sortedSellerThreads.length === 0 ? (
          <div className="py-6 text-center space-y-1.5">
            <MessageSquare className="w-5 h-5 text-zinc-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-zinc-800">No buyer messages yet</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              When verified buyers ask questions or send price offers on this listing, their
              private conversations will appear here in real time.
            </p>
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="py-4 space-y-3">
            <p className="text-xs text-zinc-600 leading-relaxed">
              Ask {sellerFirstName} about item condition, campus meetup locations, or send a price
              offer directly. Messages sync live in Firestore.
            </p>
            {!isOwner && canSendMessage && (
              <div className="flex flex-wrap gap-2">
                {BUYER_QUICK_QUESTIONS.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => handleQuickQuestion(promptText)}
                    className="px-3 py-1.5 min-h-[36px] text-xs font-medium text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors text-left"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            ref={scrollBoxRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation messages"
            className="max-h-[340px] overflow-y-auto space-y-3 pr-1"
          >
            {sortedMessages.map((msg) => {
              const isMine = Boolean(user && msg.senderId === user.uid);
              const isOffer = msg.type === 'offer' && msg.offerPesewas !== undefined;
              const deltaLabel =
                isOffer && msg.offerPesewas !== undefined
                  ? formatOfferDeltaLabel(msg.offerPesewas, listing.pricePesewas)
                  : '';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-1 px-0.5">
                    <span className="font-medium text-zinc-700">
                      {isMine ? 'You' : msg.senderName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{msg.senderRole === 'seller' ? 'Seller' : 'Buyer'}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={msg.createdAt?.toISOString()}>
                      {formatMessageTime(msg.createdAt)}
                    </time>
                  </div>

                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 space-y-1.5 ${
                      isMine
                        ? 'bg-emerald-900 text-white rounded-br-sm'
                        : 'bg-stone-100 text-zinc-900 rounded-bl-sm'
                    }`}
                  >
                    {isOffer && msg.offerPesewas !== undefined && (
                      <div
                        className={`pb-1.5 border-b space-y-0.5 ${
                          isMine ? 'border-white/15' : 'border-stone-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span
                            className={`text-[11px] font-medium ${
                              isMine ? 'text-emerald-100' : 'text-emerald-900'
                            }`}
                          >
                            {msg.senderRole === 'seller' ? 'Counter-offer' : 'Price offer'}
                          </span>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {formatGhs(msg.offerPesewas)}
                          </span>
                        </div>
                        {deltaLabel && (
                          <p
                            className={`text-[11px] ${
                              isMine ? 'text-emerald-100/90' : 'text-zinc-500'
                            }`}
                          >
                            {deltaLabel}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-sm leading-relaxed whitespace-pre-line break-words">
                      {msg.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      {listing.status === 'removed' ? (
        <p className="border-t border-stone-200 pt-3.5 text-xs text-zinc-500">
          Messaging is closed because this listing has been removed.
        </p>
      ) : profile?.banned ? (
        <p className="border-t border-stone-200 pt-3.5 text-xs text-red-700">
          Suspended accounts cannot send messages.
        </p>
      ) : canSendMessage ? (
        <form
          onSubmit={handleFormSubmit}
          className="border-t border-stone-200 pt-4 space-y-3"
          noValidate
        >
          {/* Mode Switcher: Message vs Price Offer / Counter-Offer */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-lg"
              role="group"
              aria-label="Message type"
            >
              <button
                type="button"
                onClick={() => {
                  setComposerMode('text');
                  setFieldErrors({});
                }}
                aria-pressed={composerMode === 'text'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  composerMode === 'text'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{isOwner ? 'Reply' : 'Ask question'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setComposerMode('offer');
                  setFieldErrors({});
                  if (!offerGhs && offerPresets.length > 0 && !isOwner) {
                    setOfferGhs(pesewasToGhsString(offerPresets[1]?.pesewas ?? offerPresets[0].pesewas));
                  }
                }}
                aria-pressed={composerMode === 'offer'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  composerMode === 'offer'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{isOwner ? 'Counter-offer' : 'Make an offer'}</span>
              </button>
            </div>

            {isOwner && activeThread && (
              <span className="text-xs text-zinc-500 truncate">
                Replying to <span className="font-medium text-zinc-800">{activeThread.buyerName}</span>
              </span>
            )}
          </div>

          {/* Structured Price Negotiation Input */}
          {composerMode === 'offer' && (
            <div className="space-y-2.5 bg-stone-50 rounded-lg p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <label
                  htmlFor={`chat-offer-input-${listing.id}`}
                  className="text-xs font-semibold text-zinc-800 whitespace-nowrap"
                >
                  {isOwner ? 'Your counter-offer (GHS)' : 'Your offer (GHS)'}
                </label>

                <div className="relative flex-1 max-w-[200px]">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-medium text-zinc-500"
                  >
                    GHS
                  </span>
                  <input
                    id={`chat-offer-input-${listing.id}`}
                    type="text"
                    inputMode="decimal"
                    value={offerGhs}
                    onChange={(e) => {
                      setOfferGhs(e.target.value);
                      if (fieldErrors.offerGhs) {
                        setFieldErrors((prev) => ({ ...prev, offerGhs: '' }));
                      }
                    }}
                    placeholder={pesewasToGhsString(listing.pricePesewas)}
                    className="w-full rounded-lg border border-stone-300 bg-white pl-12 pr-3 py-2 min-h-[40px] font-mono text-sm tabular-nums text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15"
                  />
                </div>

                {parsedOfferPesewas !== null && (
                  <span className="text-xs text-zinc-600">
                    {formatOfferDeltaLabel(parsedOfferPesewas, listing.pricePesewas)}
                  </span>
                )}
              </div>

              {offerPresets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500 mr-1">Quick presets:</span>
                  {offerPresets.map((preset) => (
                    <button
                      key={preset.discountPercent}
                      type="button"
                      onClick={() => {
                        setOfferGhs(pesewasToGhsString(preset.pesewas));
                        setFieldErrors((prev) => ({ ...prev, offerGhs: '' }));
                      }}
                      className="px-2.5 py-1 min-h-[32px] text-xs font-mono tabular-nums font-medium text-zinc-800 bg-white border border-stone-200 hover:border-emerald-900 hover:text-emerald-900 rounded-md transition-colors"
                    >
                      {formatGhs(preset.pesewas)} ({preset.label})
                    </button>
                  ))}
                </div>
              )}

              {fieldErrors.offerGhs && (
                <p className="text-xs text-red-700" role="alert">
                  {fieldErrors.offerGhs}
                </p>
              )}
            </div>
          )}

          {/* Message Input + Send Button */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
            <div className="flex-1 space-y-1">
              <label htmlFor={`chat-message-input-${listing.id}`} className="sr-only">
                {composerMode === 'offer' ? 'Optional note with your offer' : 'Message'}
              </label>
              <textarea
                ref={textareaRef}
                id={`chat-message-input-${listing.id}`}
                rows={2}
                value={body}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (fieldErrors.body) {
                    setFieldErrors((prev) => ({ ...prev, body: '' }));
                  }
                }}
                onKeyDown={handleTextareaKeyDown}
                placeholder={
                  composerMode === 'offer'
                    ? 'Optional note (e.g. can pick up today at Balme Library)...'
                    : isOwner
                      ? 'Reply to buyer with availability, meetup spot, or price...'
                      : `Ask ${sellerFirstName} a question or suggest a meetup time...`
                }
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-900/15 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
            >
              <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {sending
                  ? 'Sending...'
                  : composerMode === 'offer'
                    ? isOwner
                      ? 'Send Counter'
                      : 'Send Offer'
                    : 'Send'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            {fieldErrors.body ? (
              <p className="text-xs text-red-700" role="alert">
                {fieldErrors.body}
              </p>
            ) : (
              <span>Press Enter to send · Shift+Enter for new line</span>
            )}
            {body.length > 0 && (
              <span className="font-mono tabular-nums shrink-0">
                {body.trim().length} / {CHAT_MESSAGE_MAX_LENGTH}
              </span>
            )}
          </div>

          {sendError && (
            <p
              role="alert"
              className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {sendError}
            </p>
          )}
        </form>
      ) : null}
    </section>
  );
}
