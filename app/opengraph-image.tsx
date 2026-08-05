import { ImageResponse } from 'next/og';

// Social share card (Open Graph / Twitter) — HELIX. wordmark + product name.
export const alt = 'HELIX SDR';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

const PRODUCT = 'SDR';

async function heebo(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Heebo:wght@${weight}`).then((r) => r.text());
    const url = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [black, semibold] = await Promise.all([heebo(900), heebo(600)]);
  const fonts = [
    ...(black ? [{ name: 'Heebo', data: black, weight: 900 as const, style: 'normal' as const }] : []),
    ...(semibold ? [{ name: 'Heebo', data: semibold, weight: 600 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          background: '#121413',
          padding: '0 96px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'Heebo', fontWeight: 900, fontSize: 200, letterSpacing: -8, color: '#FFFFFF' }}>
            HELIX
          </span>
          <span style={{ fontFamily: 'Heebo', fontWeight: 900, fontSize: 200, letterSpacing: -8, color: '#10B981' }}>
            .
          </span>
          <span style={{ fontFamily: 'Heebo', fontWeight: 600, fontSize: 56, color: '#9BA19E', marginLeft: 28 }}>
            {PRODUCT}
          </span>
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
