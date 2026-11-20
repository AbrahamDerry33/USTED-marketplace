import { describe, expect, it } from 'vitest';
import {
  buildQuickOfferPresets,
  calculateOfferDeltaPercent,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_PREVIEW_MAX_LENGTH,
  sortChatMessages,
  sortChatThreads,
  truncateMessagePreview,
  validateChatMessageInput,
} from '../chat';
import type { ListingChatMessage, ListingChatThread } from '../../types/marketplace';

describe('validateChatMessageInput', () => {
  it('validates and strips HTML from standard text messages', () => {
    const result = validateChatMessageInput({
      type: 'text',
      body: '  <b>Is this laptop charger still available?</b>  ',
      senderName: 'Kwame Mensah',
      senderRole: 'buyer',
    });

    expect(result.valid).toBe(true);
    expect(result.payload).toEqual({
      type: 'text',
      body: 'Is this laptop charger still available?',
      senderName: 'Kwame Mensah',
      previewText: 'Is this laptop charger still available?',
    });
    expect(result.payload?.offerPesewas).toBeUndefined();
  });

  it('rejects empty or oversized text messages', () => {
    expect(
      validateChatMessageInput({
        type: 'text',
        body: '   ',
        senderName: 'Kwame',
        senderRole: 'buyer',
      }).valid
    ).toBe(false);

    expect(
      validateChatMessageInput({
        type: 'text',
        body: 'x'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
        senderName: 'Kwame',
        senderRole: 'buyer',
      }).valid
    ).toBe(false);
  });

  it('parses valid GHS price offers and supplies a default body when note is omitted', () => {
    const buyerOffer = validateChatMessageInput({
      type: 'offer',
      body: '',
      offerGhs: '185.50',
      senderName: 'Ama Boateng',
      senderRole: 'buyer',
    });

    expect(buyerOffer.valid).toBe(true);
    expect(buyerOffer.payload?.offerPesewas).toBe(18550);
    expect(buyerOffer.payload?.body).toBe('Offering GHS 185.50 for this item.');

    const sellerCounter = validateChatMessageInput({
      type: 'offer',
      body: 'Meet at Balme Library?',
      offerGhs: '200',
      senderName: 'Kofi Asante',
      senderRole: 'seller',
    });

    expect(sellerCounter.valid).toBe(true);
    expect(sellerCounter.payload?.offerPesewas).toBe(20000);
    expect(sellerCounter.payload?.body).toBe('Meet at Balme Library?');
    expect(sellerCounter.payload?.previewText).toContain('Counter-offer GHS 200.00');
  });

  it('rejects malformed, zero, negative, or out-of-range offers', () => {
    for (const invalid of ['', '0', '0.50', '-50', 'abc', '1000001']) {
      const res = validateChatMessageInput({
        type: 'offer',
        body: 'Offering this price',
        offerGhs: invalid,
        senderName: 'Ama',
        senderRole: 'buyer',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.offerGhs).toBeTruthy();
    }
  });
});

describe('buildQuickOfferPresets & calculateOfferDeltaPercent', () => {
  it('builds deduplicated rounded presets strictly below asking price', () => {
    const presets = buildQuickOfferPresets(20000); // GHS 200.00
    expect(presets).toEqual([
      { label: '-5%', discountPercent: 5, pesewas: 19000 },
      { label: '-10%', discountPercent: 10, pesewas: 18000 },
      { label: '-15%', discountPercent: 15, pesewas: 17000 },
    ]);
  });

  it('computes signed offer delta percent cleanly', () => {
    expect(calculateOfferDeltaPercent(18000, 20000)).toBe(-10);
    expect(calculateOfferDeltaPercent(20000, 20000)).toBe(0);
    expect(calculateOfferDeltaPercent(22000, 20000)).toBe(10);
    expect(calculateOfferDeltaPercent(1000, 0)).toBeNull();
  });
});

describe('truncateMessagePreview, sortChatThreads, and sortChatMessages', () => {
  it('truncates long preview strings within the 200-character blueprint limit', () => {
    const preview = truncateMessagePreview('a'.repeat(300));
    expect(preview.length).toBeLessThanOrEqual(CHAT_PREVIEW_MAX_LENGTH);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('sorts threads by latest update descending', () => {
    const threads: ListingChatThread[] = [
      {
        listingId: 'lst-1',
        buyerId: 'buyer-old',
        sellerId: 'seller-1',
        buyerName: 'Old Buyer',
        sellerName: 'Seller',
        lastMessageText: 'Hi',
        lastMessageSenderId: 'buyer-old',
        createdAt: new Date('2026-11-10T08:00:00Z'),
        updatedAt: new Date('2026-11-10T08:00:00Z'),
      },
      {
        listingId: 'lst-1',
        buyerId: 'buyer-new',
        sellerId: 'seller-1',
        buyerName: 'New Buyer',
        sellerName: 'Seller',
        lastMessageText: 'Offer GHS 150',
        lastMessageSenderId: 'buyer-new',
        createdAt: new Date('2026-11-12T08:00:00Z'),
        updatedAt: new Date('2026-11-12T09:00:00Z'),
      },
    ];

    expect(sortChatThreads(threads).map((t) => t.buyerId)).toEqual(['buyer-new', 'buyer-old']);
  });

  it('sorts messages chronologically and keeps pending null timestamps at the end', () => {
    const messages: ListingChatMessage[] = [
      {
        id: 'm-pending',
        listingId: 'lst-1',
        buyerId: 'b1',
        sellerId: 's1',
        senderId: 'b1',
        senderName: 'Buyer',
        senderRole: 'buyer',
        type: 'text',
        body: 'Just sent!',
        createdAt: null,
      },
      {
        id: 'm-2',
        listingId: 'lst-1',
        buyerId: 'b1',
        sellerId: 's1',
        senderId: 's1',
        senderName: 'Seller',
        senderRole: 'seller',
        type: 'text',
        body: 'Yes it is available.',
        createdAt: new Date('2026-11-17T10:05:00Z'),
      },
      {
        id: 'm-1',
        listingId: 'lst-1',
        buyerId: 'b1',
        sellerId: 's1',
        senderId: 'b1',
        senderName: 'Buyer',
        senderRole: 'buyer',
        type: 'text',
        body: 'Still available?',
        createdAt: new Date('2026-11-17T10:00:00Z'),
      },
    ];

    expect(sortChatMessages(messages).map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-pending']);
  });
});
