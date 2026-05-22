// 共有定義: content script / service worker / options ページで共通利用。
// self はそれぞれの実行コンテキストのグローバルを指す。

// 利用可能な動作の一覧。local=content script 内で完結、それ以外は background で実行。
self.MG_ACTIONS = [
  { id: "none",          label: "なし",                 local: true },
  { id: "back",          label: "戻る",                 local: true },
  { id: "forward",       label: "進む",                 local: true },
  { id: "reload",        label: "再読み込み",           local: true },
  { id: "reloadHard",    label: "再読み込み(キャッシュ無視)", local: false },
  { id: "stop",          label: "読み込み停止",         local: true },
  { id: "scrollTop",     label: "ページ最上部へ",       local: true },
  { id: "scrollBottom",  label: "ページ最下部へ",       local: true },
  { id: "scrollUp",      label: "1画面上へ",            local: true },
  { id: "scrollDown",    label: "1画面下へ",            local: true },
  { id: "newTab",        label: "新しいタブ",           local: false },
  { id: "closeTab",      label: "タブを閉じる",         local: false },
  { id: "reopenTab",     label: "閉じたタブを復元",     local: false },
  { id: "duplicateTab",  label: "タブを複製",           local: false },
  { id: "nextTab",       label: "次のタブ",             local: false },
  { id: "prevTab",       label: "前のタブ",             local: false },
  { id: "firstTab",      label: "最初のタブ",           local: false },
  { id: "lastTab",       label: "最後のタブ",           local: false },
  { id: "pinTab",        label: "タブの固定切替",       local: false },
  { id: "muteTab",       label: "タブのミュート切替",   local: false },
  { id: "closeOtherTabs",label: "他のタブを閉じる",     local: false },
  { id: "closeRightTabs",label: "右側のタブを閉じる",   local: false },
  { id: "newWindow",     label: "新しいウィンドウ",     local: false },
  { id: "closeWindow",   label: "ウィンドウを閉じる",   local: false },
  { id: "openUrl",       label: "指定URLを新しいタブで開く", local: false, needsUrl: true },
  { id: "openLinkNewTab",    label: "リンクを新しいタブで開く",       local: false, needsLink: true },
  { id: "openLinkBgTab",     label: "リンクをバックグラウンドで開く", local: false, needsLink: true },
  { id: "openLinkNewWindow", label: "リンクを新しいウィンドウで開く", local: false, needsLink: true },
  { id: "copyLink",          label: "リンクのURLをコピー",            local: true,  needsLink: true }
];

// 既定のジェスチャー割り当て。キーは方向の並び (U/D/L/R)。
self.MG_DEFAULT_GESTURES = {
  "L":  "back",
  "R":  "forward",
  "U":  "scrollTop",
  "D":  "scrollBottom",
  "UD": "reload",
  "DR": "closeTab",
  "DL": "reopenTab",
  "RU": "newTab",
  "UR": "nextTab",
  "UL": "prevTab",
  "DU": "duplicateTab"
};

// リンクを起点にしたジェスチャーの既定割り当て（通常ジェスチャーより優先）。
// 値は文字列(動作id)または { action, url } 形式。
self.MG_DEFAULT_LINK_GESTURES = {
  "U": "openLinkNewTab",
  "D": "openLinkBgTab"
};

self.MG_DEFAULT_SETTINGS = {
  wheelTab: true,        // 右ボタン押下中のホイールでタブ移動
  wheelTabLoop: true,    // 端で反対側へループ
  sensitivity: 16,       // 方向確定に必要な移動量(px)
  trail: true,           // 軌跡を描画
  trailColor: "#2b88d8",
  trailWidth: 4,
  showLabel: true,       // 認識中のジェスチャー名を表示
  suppressMenu: true     // ジェスチャー後にコンテキストメニューを抑制
};

// 方向 → 矢印 表示用
self.MG_ARROW = { U: "↑", D: "↓", L: "←", R: "→" };
