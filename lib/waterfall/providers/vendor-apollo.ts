// Layer-2 provider — Apollo.io (BYO-key, charge-on-hit). OPTIONAL fallback for the hard
// fields our own layer can't reach (verified mobile / direct-dial). Spec §4 + own-vs-vendor.
//
// BYO-key: uses the CUSTOMER'S Apollo key (ctx.byoKeys.apollo), so WE don't carry the cost
// or become a data broker — we're a pass-through (spec §5/§134). Skipped entirely when the
// customer hasn't connected a key.
import type { Provider, WaterfallInput, FieldName, ProviderContext } from '../types';

export const apolloProvider: Provider = {
  name: 'apollo',
  layer: 2,
  cost: 1, // 1 credit charged on hit (against the customer's own Apollo balance)
  fields: ['work_email', 'mobile'],

  isAvailable(ctx: ProviderContext) {
    return Boolean(ctx.byoKeys?.apollo);
  },

  async resolve(input: WaterfallInput, need: FieldName[], ctx: ProviderContext) {
    const apiKey = ctx.byoKeys?.apollo;
    if (!apiKey) return {}; // no BYO key → skip, never error
    if (!need.some((f) => this.fields.includes(f))) return {};

    const first = input.firstName || input.fullName?.split(/\s+/)[0];
    const last = input.lastName || input.fullName?.split(/\s+/).slice(1).join(' ');
    const domain = input.domain?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!first || !domain) return {};

    try {
      const res = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({
          first_name: first,
          last_name: last,
          domain,
          reveal_personal_emails: false,
        }),
      });
      if (!res.ok) return {};
      const data = await res.json();
      const person = data?.person;
      if (!person) return {};

      const out: Partial<Record<FieldName, { value: string | null; confidence: number; source?: string }>> = {};
      if (need.includes('work_email') && person.email) {
        out.work_email = { value: person.email, confidence: 0.85, source: 'apollo' };
      }
      if (need.includes('mobile')) {
        const phone = person.phone_numbers?.[0]?.raw_number ?? person.mobile_phone;
        if (phone) out.mobile = { value: phone, confidence: 0.8, source: 'apollo' };
      }
      return out;
    } catch (e) {
      console.warn('[waterfall/apollo] lookup failed:', e);
      return {};
    }
  },
};
