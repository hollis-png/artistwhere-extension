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

// ── 預覽階段：先決定「加到哪張」，送出時就不必再問一次 ──

/** 這個頁面的網址本身已在候選卡上，等於確定是同一位（不是只有名稱相近）。 */
export function isSameArtist(c: NameCandidate, profileUrl: string, norm: (u: string) => string): boolean {
  const key = norm(profileUrl);
  return (c.sharedLinks ?? []).some(u => norm(u) === key);
}

/** 預設選擇：確定是同一位就預選那張；只有名稱相近則不預選，讓使用者自己決定。 */
export function defaultChoice(cands: readonly NameCandidate[], profileUrl: string, norm: (u: string) => string): NameChoice | undefined {
  const sure = cands.find(c => isSameArtist(c, profileUrl, norm));
  return sure ? { mergeInto: sure.id } : undefined;
}

/** 目前的選擇還能不能用（候選卡重新查詢後可能消失）。 */
export function choiceStillValid(choice: NameChoice | undefined, cands: readonly NameCandidate[]): boolean {
  if (!choice) return false;
  return 'forceNew' in choice || cands.some(c => c.id === choice.mergeInto);
}

export interface MergePlan {
  /** 勾選的連結中站上已經有的 */
  existing: string[];
  /** 勾選的連結中站上還沒有的（加入後會新增） */
  added: string[];
  /** 站上已公開的類型裡，使用者這次也勾了的 */
  knownTypes: string[];
  /** 使用者勾了、站上還沒有的類型 */
  newTypes: string[];
}

export function planMerge(c: NameCandidate, checkedUrls: readonly string[], picked: readonly string[], norm: (u: string) => string): MergePlan {
  const have = new Set((c.accounts ?? []).map(a => norm(a.url)));
  const existing = checkedUrls.filter(u => have.has(norm(u)));
  const added = checkedUrls.filter(u => !have.has(norm(u)));
  const onSite = new Set(c.types ?? []);
  return { existing, added, knownTypes: picked.filter(t => onSite.has(t)), newTypes: picked.filter(t => !onSite.has(t)) };
}

/** 主按鈕文字；undefined 的 disabled 表示可按。有候選卡但還沒選時要求先選。 */
export function submitLabel(cands: readonly NameCandidate[], choice: NameChoice | undefined): { text: string; disabled: boolean } {
  if (choice && 'mergeInto' in choice) {
    const c = cands.find(x => x.id === choice.mergeInto);
    return { text: c ? `補充到「${c.name}」` : '加入觀測', disabled: false };
  }
  if (choice) return { text: '另建新卡並加入觀測', disabled: false };
  if (cands.length > 0) return { text: '請先選擇是不是同一位', disabled: true };
  return { text: '加入觀測', disabled: false };
}
