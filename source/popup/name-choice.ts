// 伺服器發現同名繪師時（HTTP 409 + error: 'NAME_EXISTS'），彈出視窗要讓使用者選「加到那張」或「另建新卡」。
// 這裡只放不依賴 DOM 與 chrome API 的純函式，好單獨測試。

export interface NameCandidate {
  id: string;
  name: string;
  avatarUrl: string;
  platforms: string[];
  accounts?: { url: string; platformName: string; name?: string }[];
  sharedLinks?: string[];
  /** 這位在網站上已公開的類型 id */
  types?: string[];
}

export type NameChoice = { mergeInto: string } | { forceNew: true };

export function parseNameExists(status: number, body: unknown): NameCandidate[] | null {
  if (status !== 409 || typeof body !== 'object' || body === null) return null;
  const b = body as { error?: unknown; candidates?: unknown };
  if (b.error !== 'NAME_EXISTS' || !Array.isArray(b.candidates)) return null;
  const list = b.candidates.filter((c): c is NameCandidate =>
    typeof c === 'object' && c !== null && typeof (c as NameCandidate).id === 'string' && typeof (c as NameCandidate).name === 'string');
  return list.length > 0 ? list : null;
}

export function candidateLabel(c: NameCandidate): string {
  const platforms = Array.isArray(c.platforms) && c.platforms.length > 0 ? c.platforms.join('、') : '尚無帳號';
  return `是同一位：加到「${c.name}」（已有 ${platforms}）`;
}

/** 為什麼認為可能是同一位：優先說共用連結，其次才是名稱相近。 */
export function candidateReason(c: NameCandidate): string {
  const shared = c.sharedLinks ?? [];
  if (shared.length === 0) return '名稱相近';
  const hosts = shared.map(u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } });
  return `共用 ${shared.length} 條連結（${[...new Set(hosts)].slice(0, 3).join('、')}）`;
}

export function withChoice<T extends object>(body: T, choice?: NameChoice): T & Partial<NameChoice> {
  return choice ? { ...body, ...choice } : { ...body };
}
