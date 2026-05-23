(() => {
  "use strict";

  const LOCAL_ACTIONS = new Set(
    (self.MG_ACTIONS || []).filter((a) => a.local).map((a) => a.id)
  );
  const ARROW = self.MG_ARROW || { U: "↑", D: "↓", L: "←", R: "→" };

  let gestures = Object.assign({}, self.MG_DEFAULT_GESTURES);
  let linkGestures = Object.assign({}, self.MG_DEFAULT_LINK_GESTURES);
  let settings = Object.assign({}, self.MG_DEFAULT_SETTINGS);

  // ---- 設定の読み込み ----
  try {
    chrome.storage.sync.get(["gestures", "linkGestures", "settings"], (data) => {
      if (chrome.runtime.lastError) return;
      if (data.gestures) gestures = data.gestures;
      if (data.linkGestures) linkGestures = data.linkGestures;
      if (data.settings) settings = Object.assign({}, settings, data.settings);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.gestures) gestures = changes.gestures.newValue || {};
      if (changes.linkGestures) linkGestures = changes.linkGestures.newValue || {};
      if (changes.settings)
        settings = Object.assign({}, settings, changes.settings.newValue || {});
    });
  } catch (e) {
    /* 拡張機能コンテキスト無効化時は無視 */
  }

  // 動作割り当ての正規化（文字列 or {action,url} を {action,url} に揃える）
  function normalize(v) {
    return typeof v === "string" ? { action: v } : v || {};
  }

  // 方向列に対応する動作を解決。リンク起点ならリンク用を優先しフォールバック。
  function lookup(seq) {
    if (!seq) return null;
    if (onLink && linkGestures && linkGestures[seq]) return normalize(linkGestures[seq]);
    if (gestures[seq]) return normalize(gestures[seq]);
    return null;
  }

  // ---- 状態 ----
  let rightDown = false;
  let moved = false;
  let wheelUsed = false;
  let suppressMenu = false;
  let onLink = false; // ジェスチャー起点がリンク上か
  let gestureLinkUrl = null; // 起点リンクの URL
  let ref = null; // 方向判定の基準点
  const points = [];
  const dirs = [];
  let lastDir = "";

  // ---- 軌跡オーバーレイ (トップフレームのみ) ----
  const isTop = window.top === window;
  let canvas = null;
  let ctx = null;
  let label = null;

  function ensureOverlay() {
    if (!isTop || canvas) return;
    canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    (document.documentElement || document.body).appendChild(canvas);
    ctx = canvas.getContext("2d");

    label = document.createElement("div");
    label.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;padding:6px 12px;" +
      "background:rgba(32,32,32,.85);color:#fff;font:14px/1.4 system-ui,sans-serif;" +
      "border-radius:6px;display:none;white-space:nowrap;";
    (document.documentElement || document.body).appendChild(label);
  }

  function removeOverlay() {
    if (canvas) {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
    if (label) {
      label.remove();
      label = null;
    }
  }

  function drawTrail() {
    if (!ctx || !settings.trail || points.length < 2) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = settings.trailColor || "#2b88d8";
    ctx.lineWidth = settings.trailWidth || 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function updateLabel(x, y) {
    if (!label || !settings.showLabel) return;
    const seq = dirs.join("");
    if (!seq) {
      label.style.display = "none";
      return;
    }
    const arrows = dirs.map((d) => ARROW[d] || "").join("");
    const entry = lookup(seq);
    let actionLabel = entry ? actionName(entry.action) : "（未割当）";
    if (onLink && linkGestures[seq]) actionLabel = "🔗 " + actionLabel;
    label.textContent = `${arrows}  ${actionLabel}`;
    label.style.display = "block";
    label.style.left = Math.min(x + 16, window.innerWidth - label.offsetWidth - 8) + "px";
    label.style.top = Math.min(y + 16, window.innerHeight - 40) + "px";
  }

  function actionName(id) {
    const a = (self.MG_ACTIONS || []).find((x) => x.id === id);
    return a ? a.label : id;
  }

  // ---- 方向検出 ----
  function feedPoint(x, y) {
    if (!ref) {
      ref = { x, y };
      return;
    }
    const dx = x - ref.x;
    const dy = y - ref.y;
    const dist = Math.hypot(dx, dy);
    const th = settings.sensitivity || 16;
    if (dist < th) return;
    moved = true;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U";
    if (dir !== lastDir) {
      dirs.push(dir);
      lastDir = dir;
    }
    ref = { x, y };
  }

  function resetGesture() {
    rightDown = false;
    moved = false;
    onLink = false;
    gestureLinkUrl = null;
    ref = null;
    lastDir = "";
    points.length = 0;
    dirs.length = 0;
    removeOverlay();
  }

  // 起点要素から最も近いリンク URL を取得
  function linkUrlFromEvent(e) {
    const path = (e.composedPath && e.composedPath()) || [];
    for (const node of path) {
      if (node && node.tagName === "A" && node.href) return node.href;
    }
    const el = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    return el ? el.href : null;
  }

  // ---- 動作の実行 ----
  function runAction(entry) {
    if (!entry || !entry.action || entry.action === "none") return;
    const id = entry.action;
    if (LOCAL_ACTIONS.has(id)) {
      runLocal(id);
    } else {
      try {
        chrome.runtime.sendMessage({
          type: "action",
          action: id,
          url: entry.url || gestureLinkUrl || undefined
        });
      } catch (e) {
        /* ignore */
      }
    }
  }

  function runLocal(id) {
    const vh = window.innerHeight;
    switch (id) {
      case "back":
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "reload":
        location.reload();
        break;
      case "stop":
        window.stop();
        break;
      case "scrollTop":
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "scrollBottom":
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        break;
      case "scrollUp":
        window.scrollBy({ top: -vh * 0.9, behavior: "smooth" });
        break;
      case "scrollDown":
        window.scrollBy({ top: vh * 0.9, behavior: "smooth" });
        break;
      case "copyLink":
        if (gestureLinkUrl && navigator.clipboard) {
          navigator.clipboard.writeText(gestureLinkUrl).catch(() => {});
        }
        break;
    }
  }

  // ---- イベント ----
  window.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 2) return;
      rightDown = true;
      moved = false;
      wheelUsed = false;
      gestureLinkUrl = linkUrlFromEvent(e);
      onLink = !!gestureLinkUrl;
      ref = { x: e.clientX, y: e.clientY };
      lastDir = "";
      points.length = 0;
      dirs.length = 0;
      points.push({ x: e.clientX, y: e.clientY });
      ensureOverlay();
    },
    true
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!rightDown) return;
      points.push({ x: e.clientX, y: e.clientY });
      if (points.length > 1200) points.shift();
      feedPoint(e.clientX, e.clientY);
      drawTrail();
      updateLabel(e.clientX, e.clientY);
    },
    true
  );

  window.addEventListener(
    "mouseup",
    (e) => {
      if (e.button !== 2 || !rightDown) return;
      const seq = dirs.join("");
      const entry = lookup(seq);
      if (entry) {
        runAction(entry);
        suppressMenu = true;
      } else if (moved || wheelUsed) {
        suppressMenu = true; // 認識失敗でも誤メニューを防ぐ
      }
      resetGesture();
    },
    true
  );

  // 右ボタン押下中のホイールでタブ移動
  // rightDown は mousedown→mouseup の間しか true にならないため、
  // タブ切替後の新タブでは false になっている。実際の押下状態は
  // WheelEvent.buttons のビット2で判定できるので、これで連続切替を可能にする。
  window.addEventListener(
    "wheel",
    (e) => {
      if (!settings.wheelTab) return;
      const heldRight = rightDown || (e.buttons & 2) !== 0;
      if (!heldRight) return;
      e.preventDefault();
      e.stopPropagation();
      wheelUsed = true;
      suppressMenu = true; // 後で右ボタンを離したときのメニューを抑制
      const action = e.deltaY > 0 ? "nextTab" : "prevTab";
      try {
        chrome.runtime.sendMessage({ type: "action", action, loop: settings.wheelTabLoop });
      } catch (err) {
        /* ignore */
      }
    },
    { capture: true, passive: false }
  );

  window.addEventListener(
    "contextmenu",
    (e) => {
      if (suppressMenu && settings.suppressMenu) {
        e.preventDefault();
        e.stopPropagation();
      }
      suppressMenu = false;
    },
    true
  );

  // ボタンを離さずウィンドウ外へ出た場合などの保険
  window.addEventListener("blur", () => {
    if (rightDown) resetGesture();
  });

  window.addEventListener("resize", () => {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  });
})();
