declare const __API_BASE__: string;
const API_BASE = __API_BASE__;

// t.co 的目標網址無法從瀏覽器端取得：Fetch 規範明確禁止讀取跨網域重導向後的最終網址
// （見 whatwg/fetch#66、#601），所以改叫我們自己的後端 /api/resolve-redirect。
// 只接受本擴充功能自己的 content script 送來的、而且是 t.co 的網址；其他一律不轉給伺服器。
function isTcoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 't.co';
  } catch { return false; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'RESOLVE_TCO_URL' && isTcoUrl(message.url)) {
    fetch(`${API_BASE}/api/resolve-redirect?url=${encodeURIComponent(message.url)}`)
      .then(res => res.json())
      .then((data: { resolvedUrl: string | null }) => sendResponse({ resolvedUrl: data.resolvedUrl }))
      .catch(() => sendResponse({ resolvedUrl: null }));
    return true;
  }
  return false;
});
