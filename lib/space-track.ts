export interface SpaceTrackSession {
  cookie: string;
}

export async function loginSpaceTrack(): Promise<string> {
  const login = process.env.SPACE_TRACK_LOGIN;
  const password = process.env.SPACE_TRACK_PASSWORD;

  if (!login || !password) {
    throw new Error('SPACE_TRACK_LOGIN and SPACE_TRACK_PASSWORD are not configured');
  }

  const res = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `identity=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`,
  });

  if (!res.ok) {
    throw new Error(`Space-Track.org login failed: HTTP ${res.status}`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/chocolatechip=[^;]+/);
  if (!cookieMatch) {
    throw new Error('Space-Track.org did not return a valid session cookie');
  }

  return cookieMatch[0];
}

export async function fetchSpaceTrack(cookie: string, path: string): Promise<any[]> {
  const res = await fetch(`https://www.space-track.org${path}`, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) {
    throw new Error(`Space-Track.org API error: HTTP ${res.status} for ${path}`);
  }

  return res.json();
}

export function buildGPQuery(noradIds?: number[]): string {
  const base = '/basicspacedata/query/class/gp';
  const filter = '/decay_date/null-val/epoch/%3Enow-10';
  const idFilter = noradIds ? `/NORAD_CAT_ID/${noradIds.join(',')}` : '';
  return `${base}${idFilter}${filter}/orderby/NORAD_CAT_ID/format/json`;
}

export function buildCDMQuery(): string {
  return '/basicspacedata/query/class/cdm_public/orderby/TCA%20asc/limit/1000/format/json';
}

export function buildSATCATQuery(noradIds?: number[]): string {
  const base = '/basicspacedata/query/class/satcat';
  const idFilter = noradIds ? `/NORAD_CAT_ID/${noradIds.join(',')}` : '';
  return `${base}${idFilter}/orderby/NORAD_CAT_ID/format/json`;
}

export function buildDecayQuery(): string {
  return '/basicspacedata/query/class/decay/MSG_EPOCH/%3Enow-1/format/json';
}

export function buildTIPQuery(): string {
  return '/basicspacedata/query/class/tip/INSERT_EPOCH/%3Enow-0.042/format/json';
}

export function buildDecay60Query(): string {
  return '/basicspacedata/query/class/decay/DECAY_EPOCH/%3Enow/format/json';
}
