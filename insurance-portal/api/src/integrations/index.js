/**
 * External services behind small interfaces. Phase 1 ships mock providers so the
 * whole journey runs end to end; replace each with the real provider
 * (payment gateway, sanctions screening, SMS/email, geocoding, licence lookup)
 * without touching business code.
 */
const crypto = require('crypto');

const mockPayments = {
  name: 'mock',
  /** Test cards: any number ending 0002 is declined; everything else succeeds. */
  async charge({ amount, currency, method, card, token }) {
    if (method === 'card' && card?.number && String(card.number).replace(/\s/g, '').endsWith('0002')) {
      return { status: 'failed', reason: 'CARD_DECLINED' };
    }
    if (method === 'card_token' && (!token || token.includes('_0002_'))) {
      return { status: 'failed', reason: 'CARD_DECLINED' };
    }
    return { status: 'succeeded', reference: `PAY-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, amount, currency };
  },
  /** Stores the card with the gateway and returns a token; the portal never keeps card numbers. */
  async tokenize({ card }) {
    const digits = String(card?.number || '').replace(/\D/g, '');
    return { token: `tok_${digits.slice(-4)}_${crypto.randomBytes(6).toString('hex')}`, last4: digits.slice(-4) };
  },
  async refund({ amount, currency, reference }) {
    return { status: 'refunded', reference: `RF-${reference || crypto.randomBytes(4).toString('hex')}`, amount, currency };
  },
};

const mockSanctions = {
  name: 'mock',
  /** Flags any party name containing "sanction" so the referral path can be tested. */
  async screen({ names = [] }) {
    const hit = names.some((n) => /sanction/i.test(String(n || '')));
    return { hit, provider: 'mock', checkedAt: new Date().toISOString() };
  },
};

/** Email / SMS / WhatsApp: rendered from Admin templates, sent via SMTP when enabled, always kept in the outbox. */
const messaging = require('../lib/messaging');

const mockNotifications = {
  name: 'messaging',
  sent: messaging.sent,
  async send({ to, channel, template, data, locale }) {
    return messaging.deliver({ to, channel, template, data, locale });
  },
};

const mockGeo = {
  name: 'mock',
  /** Returns the natural-catastrophe zone for an address. Real provider: map pin + hazard layers. */
  async zoneFor(address = {}) {
    const text = `${address.area || ''} ${address.city || ''}`.toLowerCase();
    if (/flood|wadi/.test(text)) return 'high';
    if (/creek|corniche|coast|marina/.test(text)) return 'medium';
    return 'low';
  },
};

const mockLicences = {
  name: 'mock',
  async verify({ number }) {
    return { verified: /^[A-Z]{2,5}-\d{5,9}$/.test(String(number || '')), provider: 'mock' };
  },
};

const mockVessels = {
  name: 'mock',
  /**
   * Vessel register lookup by IMO number or name (age, class). Test data: a name containing
   * "OLD" was built in 1995; "UNCLASSED" is not IACS-classed; "UNKNOWN" is not found.
   */
  async lookup({ name = '', imo = '' }) {
    const key = `${name} ${imo}`.toUpperCase();
    if (!key.trim() || key.includes('UNKNOWN')) return { found: false };
    const built = key.includes('OLD') ? 1995 : 2015;
    return { found: true, name: name || null, imo: imo || null, built, age: new Date().getUTCFullYear() - built, iacs: !key.includes('UNCLASSED'), provider: 'mock' };
  },
};

const mockPermits = {
  name: 'mock',
  /** Municipality permit lookup. Test data: numbers like BP-2026-1188 verify; anything else does not. */
  async verify({ permitNo }) {
    return { verified: /^BP-\d{4}-\d{3,}$/.test(String(permitNo || '').trim()), provider: 'mock' };
  },
};

/** Antivirus hook. Mock: flags the standard EICAR test string. Replace with ClamAV or a cloud scanner. */
const mockAntivirus = {
  name: 'mock',
  async scan(buffer) {
    return { clean: !buffer.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'), engine: 'mock' };
  },
};

module.exports = {
  antivirus: mockAntivirus,
  permits: mockPermits,
  vessels: mockVessels,
  payments: mockPayments,
  sanctions: mockSanctions,
  notifications: mockNotifications,
  geo: mockGeo,
  licences: mockLicences,
};
