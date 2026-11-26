# 繪師去哪了 助手（瀏覽器擴充功能）

在繪師的個人頁一鍵偵測名稱、頭像與簡介裡的其他平台連結，確認後加入「[繪師去哪了](https://artistwhere.com)」資料庫。繪師的帳號被停權、刪除或搬家時，你還能找到他。

- 網站：<https://artistwhere.com>
- Chrome 商店：<https://chromewebstore.google.com/detail/clilipmdghipcmgfmgmaonoihlmaonij>
- 隱私權政策：<https://artistwhere.com/privacy.html>
- 功能說明：<https://artistwhere.com/about.html>

## 安裝

**Chrome：直接到 [Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/clilipmdghipcmgfmgmaonoihlmaonij) 安裝**，之後會自動更新，這是最簡單的方式。

Edge、Brave 或想自己從原始碼安裝的人，用下面的手動安裝（Chromium 系列瀏覽器都可以）：

1. 到 [Releases](../../releases/latest) 下載 `deadlive-extension-tester-1.1.1.zip`。
2. **解壓縮**到一個固定的資料夾（例如 `文件/deadlive-extension`）。安裝後不要刪除或移動這個資料夾，瀏覽器是直接從這裡讀檔案的。
3. 網址列輸入 `chrome://extensions`（Brave 是 `brave://extensions`，Edge 是 `edge://extensions`）。
4. 打開右上角的「**開發人員模式**」。
5. 按左上角「**載入未封裝項目**」，選剛才解壓縮出來的資料夾（裡面直接看得到 `manifest.json` 的那一層）。
6. 按網址列右邊的拼圖圖示，找到「繪師去哪了 助手」，按旁邊的圖釘，之後就能一鍵點開。

## 使用

1. 先到 https://artistwhere.com 用 Google 或 Discord 登入。擴充功能沿用網站的登入狀態，沒登入就無法送出。
2. 打開某位繪師的個人頁（X、Pixiv、Facebook、Instagram、BOOTH 等都可以）。
3. 點工具列的擴充功能圖示，彈出視窗會顯示讀到的名稱、頭像與其他平台連結。
4. 逐條勾選要加入哪些連結，確認後按「加入觀測」。送出前不會有任何資料傳到伺服器。
5. 網站上已經有同一位繪師時，彈出視窗會顯示現有的卡片，讓你選補上新連結或另建一張。

## 它會讀取什麼

- 只有在你點開圖示的那一刻，才會讀取你目前所在分頁的公開個人檔案資訊（名稱、頭像網址、頁面上可見的連結）。
- 不會在背景執行，不收集瀏覽紀錄，也不會讀你沒有點開擴充功能的頁面。
- 只有你按下「加入觀測」才會把資料送到 artistwhere.com。

## 更新版本

1. 從 Releases 下載新的 zip，解壓縮並**覆蓋**舊資料夾的內容。
2. 回到 `chrome://extensions`，在「繪師去哪了 助手」卡片按重新整理圖示（↻）。
3. 已經開著的網頁要重新整理一次，新版才會生效。

手動安裝的版本不會自動更新。想改用商店版（Chrome 會自動更新），請先在 `chrome://extensions` 移除手動安裝的版本，再到商店安裝。

## 意見回饋

遇到問題、有功能建議，或想要求移除、更正站上的資料，歡迎到 [Issues](../../issues/new/choose) 留言（需要 GitHub 帳號）。這裡是公開的；涉及個人資料的事，請登入網站後用首頁右上角的「意見」按鈕，只有管理員看得到。

## 原始碼

`source/` 資料夾是這個擴充功能的完整原始碼（TypeScript），Releases 裡的 zip 就是用它建置出來的，可以自行比對。

建置需要 Node.js 與 esbuild（`npm i -D esbuild`）：

```
cd source
esbuild background.ts --bundle --outfile=background.js --target=chrome120 --define:__API_BASE__='"https://artistwhere.com"'
esbuild popup/popup.ts --bundle --outfile=popup/popup.js --target=chrome120 --define:__API_BASE__='"https://artistwhere.com"'
for f in twitter facebook pixiv instagram generic; do esbuild content/$f.ts --bundle --outfile=content/$f.js --target=chrome120; done
```

## 常見問題

- **找不到「載入未封裝項目」：** 右上角「開發人員模式」沒開。
- **載入時說「找不到資訊清單」：** 選到上一層資料夾了，要選裡面直接有 `manifest.json` 的那一層。
- **按送出出現網路或權限錯誤：** 先確認網站已登入，再確認用的是這個 repo 的 zip。
- **圖示點了沒反應：** 瀏覽器內建頁面（`chrome://`、商店頁）不允許擴充功能執行，換到一般網站再試。
- **頭像沒出現：** 部分網站的頭像要經過伺服器轉送才顯示，稍等一下或重新開啟彈出視窗。

## 解除安裝

`chrome://extensions` 找到「繪師去哪了 助手」，按「移除」。擴充功能不會在你的電腦留下其他資料。

## 問題回報

登入網站後按右上角的「意見」，或在這個 repo 開 Issue。
