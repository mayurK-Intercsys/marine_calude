'use client';

import { useI18n } from '@/lib/i18n/client';
import { useSession } from '@/lib/session';
import { Field } from '@/components/ui';

/** Payment choice for additional premium on a policy change. */
export default function PaymentFields({ value, onChange, hasSavedCard }) {
  const { t } = useI18n();
  const { user } = useSession();
  const methods = user?.isBroker ? ['broker_credit', 'card'] : [...(hasSavedCard ? ['saved_card'] : []), 'card', 'wallet'];
  const method = methods.includes(value.method) ? value.method : methods[0];
  const card = value.card || { number: '', expiry: '', cvc: '' };
  const set = (patch) => onChange({ method, card, ...patch });
  const label = (m) => (m === 'saved_card' ? t('endorse.paySaved') : t(`fire.methods.${m}`));
  return (
    <div className="stack-sm">
      <div className="choices">
        {methods.map((m) => <label className="choice" key={m}><input type="radio" name="endorse-pay" checked={method === m} onChange={() => set({ method: m })} />{label(m)}</label>)}
      </div>
      {method === 'card' ? (
        <div className="grid-3">
          <Field id="ecn" label={t('fire.cardNumber')}><input id="ecn" className="input num" inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => set({ card: { ...card, number: e.target.value } })} required /></Field>
          <Field id="ece" label={t('fire.cardExpiry')}><input id="ece" className="input num" autoComplete="cc-exp" value={card.expiry} onChange={(e) => set({ card: { ...card, expiry: e.target.value } })} required /></Field>
          <Field id="ecv" label={t('fire.cardCvc')}><input id="ecv" className="input num" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => set({ card: { ...card, cvc: e.target.value } })} required /></Field>
        </div>
      ) : null}
    </div>
  );
}

/** What the API expects for the chosen method. */
export const paymentBody = (p, hasSavedCard, isBroker) => {
  const fallback = isBroker ? 'broker_credit' : (hasSavedCard ? 'saved_card' : 'card');
  const method = p.method || fallback;
  return method === 'card' ? { method, card: p.card } : { method };
};
