// Layer-1 provider — work-email permutation + verification (own source, cost 0).
// Net-new per spec §5. Generates candidate emails from name+domain, then verifies:
//   syntax → MX record (DNS) → [SMTP handshake = future]. Confidence scales with checks passed.
import { resolveMx } from 'node:dns/promises';
import type { Provider, WaterfallInput, FieldName, ProviderContext } from '../types';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');

/** Common corporate email patterns, ordered by real-world prevalence. */
function permutations(first: string, last: string, domain: string): string[] {
  const f = norm(first);
  const l = norm(last);
  const d = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!f || !d) return [];
  const local = [
    `${f}.${l}`, `${f}${l}`, `${f}`, `${f[0]}${l}`, `${f}_${l}`,
    `${f[0]}.${l}`, `${l}.${f}`, `${l}${f}`,
  ].filter((x) => x && !x.includes('undefined'));
  return Array.from(new Set(local)).map((lp) => `${lp}@${d}`);
}

const SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

export const emailVerifyProvider: Provider = {
  name: 'permutation+verify',
  layer: 1,
  cost: 0,
  fields: ['work_email'],

  isAvailable() {
    return true; // pure own-layer, no external key
  },

  async resolve(input: WaterfallInput, need: FieldName[], _ctx: ProviderContext) {
    if (!need.includes('work_email')) return {};
    const first = input.firstName || input.fullName?.split(/\s+/)[0];
    const last = input.lastName || input.fullName?.split(/\s+/).slice(1).join(' ');
    if (!first || !input.domain) return {};

    const domain = input.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

    // Gate the whole batch on MX once — no MX means no deliverable email at this domain.
    const hasMx = await domainHasMx(domain);
    if (!hasMx) return {};

    const candidates = permutations(first, last || '', domain).filter((e) => SYNTAX.test(e));
    if (candidates.length === 0) return {};

    // Best guess = most-prevalent pattern that passed syntax; MX confirmed for the domain.
    // Confidence: syntax(0.2) + MX(0.4) = 0.6. SMTP mailbox check would push to ~0.85 (future).
    const best = candidates[0];
    return {
      work_email: {
        value: best,
        confidence: 0.6,
        source: `permutation+MX(${domain})`,
      },
    };
  },
};
