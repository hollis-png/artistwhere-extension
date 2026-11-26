// 「同一個網站」的判斷：連結的主機和目前頁面屬於同一個網站（例如 home.gamer.com.tw 頁面裡的 user.gamer.com.tw、
// mailbox.gamer.com.tw 登入與導覽連結），就不是這個人的外部帳號，不能當成偵測到的連結。
const SECOND_LEVEL = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ne', 'or', 'ac']);

/** 主機所屬的網站（去掉子網域）：gamer.com.tw、pixiv.net。二級國碼網域（.com.tw、.co.jp）多留一段。 */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  return (last.length === 2 && SECOND_LEVEL.has(second) ? parts.slice(-3) : parts.slice(-2)).join('.');
}

export const sameSite = (a: string, b: string): boolean => siteOf(a) === siteOf(b);
