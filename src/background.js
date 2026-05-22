importScripts("defaults.js");

// 初回インストール時に既定値を保存
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(["gestures", "linkGestures", "settings"]);
  const toSet = {};
  if (!data.gestures) toSet.gestures = self.MG_DEFAULT_GESTURES;
  if (!data.linkGestures) toSet.linkGestures = self.MG_DEFAULT_LINK_GESTURES;
  if (!data.settings) toSet.settings = self.MG_DEFAULT_SETTINGS;
  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "action") return;
  const tab = sender.tab;
  if (!tab) return;
  handleAction(msg, tab).catch((e) =>
    console.error("[MouseGesture]", msg.action, e)
  );
});

async function handleAction(msg, tab) {
  const action = msg.action;
  const loop = msg.loop !== false;
  const windowId = tab.windowId;
  switch (action) {
    case "reloadHard":
      await chrome.tabs.reload(tab.id, { bypassCache: true });
      break;
    case "newTab":
      await chrome.tabs.create({ windowId });
      break;
    case "closeTab":
      await chrome.tabs.remove(tab.id);
      break;
    case "reopenTab":
      await chrome.sessions.restore();
      break;
    case "duplicateTab":
      await chrome.tabs.duplicate(tab.id);
      break;
    case "nextTab":
      await switchTab(windowId, +1, loop);
      break;
    case "prevTab":
      await switchTab(windowId, -1, loop);
      break;
    case "firstTab":
      await activateByIndex(windowId, 0);
      break;
    case "lastTab":
      await activateByIndex(windowId, -1);
      break;
    case "pinTab":
      await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
      break;
    case "muteTab":
      await chrome.tabs.update(tab.id, {
        muted: !(tab.mutedInfo && tab.mutedInfo.muted)
      });
      break;
    case "closeOtherTabs": {
      const tabs = await chrome.tabs.query({ windowId });
      const ids = tabs.filter((t) => t.id !== tab.id && !t.pinned).map((t) => t.id);
      if (ids.length) await chrome.tabs.remove(ids);
      break;
    }
    case "closeRightTabs": {
      const tabs = await chrome.tabs.query({ windowId });
      const ids = tabs
        .filter((t) => t.index > tab.index && !t.pinned)
        .map((t) => t.id);
      if (ids.length) await chrome.tabs.remove(ids);
      break;
    }
    case "newWindow":
      await chrome.windows.create({});
      break;
    case "closeWindow":
      await chrome.windows.remove(windowId);
      break;
    case "openUrl":
      if (msg && msg.url) await chrome.tabs.create({ windowId, url: msg.url });
      break;
    case "openLinkNewTab":
      if (msg && msg.url)
        await chrome.tabs.create({ windowId, url: msg.url, active: true, index: tab.index + 1 });
      break;
    case "openLinkBgTab":
      if (msg && msg.url)
        await chrome.tabs.create({ windowId, url: msg.url, active: false, index: tab.index + 1 });
      break;
    case "openLinkNewWindow":
      if (msg && msg.url) await chrome.windows.create({ url: msg.url });
      break;
  }
}

async function switchTab(windowId, delta, loop) {
  const tabs = await chrome.tabs.query({ windowId });
  if (tabs.length < 2) return;
  tabs.sort((a, b) => a.index - b.index);
  const cur = tabs.findIndex((t) => t.active);
  if (cur < 0) return;
  let next = cur + delta;
  if (loop) {
    next = (next + tabs.length) % tabs.length;
  } else {
    next = Math.max(0, Math.min(tabs.length - 1, next));
  }
  await chrome.tabs.update(tabs[next].id, { active: true });
}

async function activateByIndex(windowId, index) {
  const tabs = await chrome.tabs.query({ windowId });
  if (!tabs.length) return;
  tabs.sort((a, b) => a.index - b.index);
  const t = index < 0 ? tabs[tabs.length - 1] : tabs[index];
  if (t) await chrome.tabs.update(t.id, { active: true });
}
