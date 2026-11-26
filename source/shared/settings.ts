// 使用者在擴充彈窗裡的個人設定。存取介面用最小的 get/set（chrome.storage.local 就符合），方便測試。
export interface KeyValueStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const AUTO_DETECT_KEY = 'autoDetect';

/** 開啟彈窗時是否自動「偵測全部」。沒設定過、或存的值不是布林時預設關閉：自動偵測會在使用者沒按任何按鈕時連到第三方網站，要使用者自己打開。 */
export async function loadAutoDetect(store: KeyValueStore): Promise<boolean> {
  try {
    const value = (await store.get(AUTO_DETECT_KEY))[AUTO_DETECT_KEY];
    return typeof value === 'boolean' ? value : false;
  } catch {
    return false;
  }
}

export async function saveAutoDetect(store: KeyValueStore, on: boolean): Promise<void> {
  await store.set({ [AUTO_DETECT_KEY]: on });
}
