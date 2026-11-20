import { stripHtmlTags } from './listingValidation';
import { formatGhs, ghsToPesewas } from './money';
import type {
  ListingChatMessage,
  ListingChatMessageType,
  ListingChatSenderRole,
  ListingChatThread,
} from '../types/marketplace';

export const CHAT_MESSAGE_MIN_LENGTH = 1;
export const CHAT_MESSAGE_MAX_LENGTH = 1000;
export const CHAT_PREVIEW_MAX_LENGTH = 200;
export const CHAT_NAME_MIN_LENGTH = 2;
export const CHAT_NAME_MAX_LENGTH = 60;
export const CHAT_OFFER_MIN_PESEWAS = 100;
export const CHAT_OFFER_MAX_PESEWAS = 100_000_000;

export function sanitizeParticipantName(raw: string, fallback = 'Campus Student'): string {
  const cleaned = stripHtmlTags(raw).slice(0, CHAT_NAME_MAX_LENGTH);
  return cleaned.length >= CHAT_NAME_MIN_LENGTH ? cleaned : fallback;
}

export function truncateMessagePreview(raw: string): string {
  const normalized = stripHtmlTags(raw).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New message';
  if (normalized.length <= CHAT_PREVIEW_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, CHAT_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

export interface ValidatedChatMessagePayload {
  type: ListingChatMessageType;
  body: string;
  offerPesewas?: number;
  senderName: string;
  previewText: string;
}

export function validateChatMessageInput(input: {
  type: ListingChatMessageType;
  body: string;
  offerGhs?: string;
  senderName: string;
  senderRole: ListingChatSenderRole;
}): {
  valid: boolean;
  errors: Record<string, string>;
  payload?: ValidatedChatMessagePayload;
} {
  const errors: Record<string, string> = {};
  const cleanSenderName = sanitizeParticipantName(
    input.senderName,
    input.senderRole === 'seller' ? 'Campus Seller' : 'Campus Buyer'
  );
  const cleanBody = stripHtmlTags(input.body);

  let offerPesewas: number | undefined;

  if (input.type === 'offer') {
    const parsed = ghsToPesewas(input.offerGhs ?? '');
    if (
      parsed === null ||
      !Number.isInteger(parsed) ||
      parsed < CHAT_OFFER_MIN_PESEWAS ||
      parsed > CHAT_OFFER_MAX_PESEWAS
    ) {
      errors.offerGhs = 'Enter a valid offer between GHS 1.00 and GHS 1,000,000.00.';
    } else {
      offerPesewas = parsed;
    }
  }

  const finalBody =
    cleanBody.length > 0
      ? cleanBody
      : input.type === 'offer' && offerPesewas !== undefined
        ? input.senderRole === 'seller'
          ? `Counter-offer: ${formatGhs(offerPesewas)}.`
          : `Offering ${formatGhs(offerPesewas)} for this item.`
        : '';

  if (finalBody.length < CHAT_MESSAGE_MIN_LENGTH) {
    errors.body = 'Write a message before sending.';
  } else if (finalBody.length > CHAT_MESSAGE_MAX_LENGTH) {
    errors.body = `Keep messages under ${CHAT_MESSAGE_MAX_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  const previewBase =
    input.type === 'offer' && offerPesewas !== undefined
      ? `${input.senderRole === 'seller' ? 'Counter-offer' : 'Offer'} ${formatGhs(offerPesewas)}: ${finalBody}`
      : finalBody;

  return {
    valid: true,
    errors: {},
    payload: {
      type: input.type,
      body: finalBody,
      ...(offerPesewas !== undefined ? { offerPesewas } : {}),
      senderName: cleanSenderName,
      previewText: truncateMessagePreview(previewBase),
    },
  };
}

export interface OfferPreset {
  label: string;
  discountPercent: number;
  pesewas: number;
}

export function buildQuickOfferPresets(askingPricePesewas: number): OfferPreset[] {
  if (!Number.isInteger(askingPricePesewas) || askingPricePesewas < 500) {
    return [];
  }

  const discounts = [5, 10, 15];
  const seen = new Set<number>();
  const presets: OfferPreset[] = [];

  for (const pct of discounts) {
    const raw = Math.round((askingPricePesewas * (100 - pct)) / 100);
    // Round to nearest whole GHS (100 pesewas) for listings >= GHS 10 so offers look natural
    const candidate =
      askingPricePesewas >= 1000 ? Math.max(CHAT_OFFER_MIN_PESEWAS, Math.round(raw / 100) * 100) : raw;

    if (
      candidate >= CHAT_OFFER_MIN_PESEWAS &&
      candidate < askingPricePesewas &&
      !seen.has(candidate)
    ) {
      seen.add(candidate);
      presets.push({
        label: `-${pct}%`,
        discountPercent: pct,
        pesewas: candidate,
      });
    }
  }

  return presets;
}

export function calculateOfferDeltaPercent(
  offerPesewas: number,
  askingPricePesewas: number
): number | null {
  if (
    !Number.isFinite(offerPesewas) ||
    !Number.isFinite(askingPricePesewas) ||
    askingPricePesewas <= 0
  ) {
    return null;
  }
  return Math.round(((offerPesewas - askingPricePesewas) / askingPricePesewas) * 100);
}

export function sortChatThreads(threads: ListingChatThread[]): ListingChatThread[] {
  return [...threads].sort((a, b) => {
    const timeA = (a.updatedAt ?? a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const timeB = (b.updatedAt ?? b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (timeB !== timeA) return timeB - timeA;
    return a.buyerId.localeCompare(b.buyerId);
  });
}

export function sortChatMessages(messages: ListingChatMessage[]): ListingChatMessage[] {
  return [...messages].sort((a, b) => {
    // Pending serverTimestamp() writes (null) stay pinned at the end of the timeline
    const timeA = a.createdAt ? a.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
}
