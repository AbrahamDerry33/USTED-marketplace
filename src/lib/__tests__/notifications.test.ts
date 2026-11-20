import { describe, it, expect } from 'vitest';
import {
  buildOrderNotificationPayloads,
  buildPaymentEmailDocuments,
  shouldTriggerOrderAlert,
  type OrderSnapshotData,
} from '../../../functions/src/notificationLogic';

describe('Cloud Function order notification logic', () => {
  const sampleOrder: OrderSnapshotData = {
    id: 'ord-1001',
    listingId: 'lst-2002',
    listingTitle: '<b>TI-84 Calculator</b>',
    buyerId: 'buyer-1',
    sellerId: 'seller-2',
    amountPesewas: 35000,
    sellerAmountPesewas: 33250,
    status: 'paid',
  };

  it('triggers only on real transitions into paid, shipped, completed, or cancelled', () => {
    expect(shouldTriggerOrderAlert('pending_payment', 'paid')).toBe(true);
    expect(shouldTriggerOrderAlert('paid', 'shipped')).toBe(true);
    expect(shouldTriggerOrderAlert('shipped', 'completed')).toBe(true);
    expect(shouldTriggerOrderAlert('paid', 'cancelled')).toBe(true);

    // Non-alertable or duplicate transitions must not trigger
    expect(shouldTriggerOrderAlert(undefined, 'pending_payment')).toBe(false);
    expect(shouldTriggerOrderAlert('paid', 'paid')).toBe(false);
    expect(shouldTriggerOrderAlert('shipped', 'disputed')).toBe(false);
  });

  it('builds deterministic buyer and seller notifications with sanitized titles and GHS amounts', () => {
    const paid = buildOrderNotificationPayloads(sampleOrder, 'paid');
    expect(paid.buyer.id).toBe('ord-1001_paid_buyer');
    expect(paid.buyer.userId).toBe('buyer-1');
    expect(paid.buyer.read).toBe(false);
    expect(paid.buyer.title).toBe('Payment confirmed for TI-84 Calculator');
    expect(paid.buyer.body).toContain('GHS 350.00');

    expect(paid.seller.id).toBe('ord-1001_paid_seller');
    expect(paid.seller.userId).toBe('seller-2');
    expect(paid.seller.body).toContain('GHS 332.50');

    const completed = buildOrderNotificationPayloads(sampleOrder, 'completed');
    expect(completed.seller.body).toContain('GHS 332.50');
    expect(completed.buyer.eventType).toBe('completed');
  });

  it('builds Trigger Email documents on payment success with escaped HTML', () => {
    const mailDocs = buildPaymentEmailDocuments({
      order: {
        ...sampleOrder,
        listingTitle: 'Calc <script>alert(1)</script> Pro',
      },
      buyerEmail: 'buyer@st.ug.edu.gh',
      sellerEmail: 'seller@st.ug.edu.gh',
    });

    expect(mailDocs).toHaveLength(2);
    expect(mailDocs[0].id).toBe('ord-1001_paid_buyer_mail');
    expect(mailDocs[0].to).toEqual(['buyer@st.ug.edu.gh']);
    expect(mailDocs[0].message.html).not.toContain('<script>');
    expect(mailDocs[1].message.text).toContain('GHS 332.50');
  });
});
