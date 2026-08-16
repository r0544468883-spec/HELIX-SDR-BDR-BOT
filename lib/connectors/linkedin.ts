// LinkedIn posting connector — publish a text share AS the connected member, so the
// SDR department's social touch is a real action (not just a drafted suggestion).
// PUBLISH is a gray-path: callers must route it through the autonomy switch (the
// outreach-critic can downgrade autopilot → approve) before calling this.
import { getConnection } from './store';
import { connectedMember } from './linkedin-oauth';

/**
 * Publish a plain-text post on the member's feed. Returns the post id (URN) or null.
 * Reads the long-lived LinkedIn token from the per-workspace connection store.
 */
export async function shareText(workspaceId: string, text: string): Promise<string | null> {
  const conn = await getConnection(workspaceId, 'linkedin');
  if (!conn) return null;

  const me = await connectedMember(conn.access_token);
  if (!me) return null;
  const author = `urn:li:person:${me.sub}`;

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${conn.access_token}`,
      'content-type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string };
  return j.id ?? null;
}
