(() => {
  "use strict";
  const ACTIONS = self.MG_ACTIONS;
  const ARROW = self.MG_ARROW;
  const $ = (id) => document.getElementById(id);

  const rowsEl = $("rows");
  const rowsLinkEl = $("rowsLink");

  function normalize(v) {
    return typeof v === "string" ? { action: v } : v || {};
  }

  function actionSelect(selected, onChange) {
    const sel = document.createElement("select");
    for (const a of ACTIONS) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      if (a.id === selected) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", onChange);
    return sel;
  }

  function arrowsFor(seq) {
    return (seq || "")
      .toUpperCase()
      .split("")
      .map((d) => ARROW[d] || "?")
      .join("");
  }

  function addRow(tbody, seq, entry) {
    entry = normalize(entry);
    const tr = document.createElement("tr");

    const tdArrow = document.createElement("td");
    tdArrow.className = "arrows";
    tdArrow.textContent = arrowsFor(seq);

    const tdInput = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = seq || "";
    input.placeholder = "例: DR";
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^UDLR]/g, "");
      tdArrow.textContent = arrowsFor(input.value);
    });
    tdInput.appendChild(input);

    const tdUrl = document.createElement("td");
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.style.width = "240px";
    urlInput.style.textTransform = "none";
    urlInput.placeholder = "https://example.com";
    urlInput.value = entry.url || "";

    const tdAction = document.createElement("td");
    const syncUrl = () => {
      urlInput.style.display = sel.value === "openUrl" ? "" : "none";
    };
    const sel = actionSelect(entry.action || "none", syncUrl);
    tdAction.appendChild(sel);
    tdUrl.appendChild(urlInput);
    syncUrl();

    const tdDel = document.createElement("td");
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "削除";
    del.addEventListener("click", () => tr.remove());
    tdDel.appendChild(del);

    tr.append(tdArrow, tdInput, tdAction, tdUrl, tdDel);
    tbody.appendChild(tr);
  }

  function renderGestures(tbody, gestures, allowEmpty) {
    tbody.innerHTML = "";
    const keys = Object.keys(gestures).sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    for (const k of keys) addRow(tbody, k, gestures[k]);
    if (!keys.length && !allowEmpty) addRow(tbody, "", "none");
  }

  function renderSettings(s) {
    $("wheelTab").checked = !!s.wheelTab;
    $("wheelTabLoop").checked = !!s.wheelTabLoop;
    $("trail").checked = !!s.trail;
    $("trailColor").value = s.trailColor || "#2b88d8";
    $("trailWidth").value = s.trailWidth || 4;
    $("trailWidthVal").textContent = s.trailWidth || 4;
    $("showLabel").checked = !!s.showLabel;
    $("suppressMenu").checked = !!s.suppressMenu;
    $("sensitivity").value = s.sensitivity || 16;
    $("sensitivityVal").textContent = s.sensitivity || 16;
  }

  function collect(tbody) {
    const out = {};
    const dupes = [];
    for (const tr of tbody.querySelectorAll("tr")) {
      const seq = tr.querySelector("input").value.trim().toUpperCase();
      const action = tr.querySelector("select").value;
      if (!seq || action === "none") continue;
      let val = action;
      if (action === "openUrl") {
        const url = tr.querySelectorAll("input")[1].value.trim();
        val = { action: "openUrl", url };
      }
      if (out[seq]) dupes.push(seq);
      out[seq] = val;
    }
    return { out, dupes };
  }

  function collectSettings() {
    return {
      wheelTab: $("wheelTab").checked,
      wheelTabLoop: $("wheelTabLoop").checked,
      trail: $("trail").checked,
      trailColor: $("trailColor").value,
      trailWidth: Number($("trailWidth").value),
      showLabel: $("showLabel").checked,
      suppressMenu: $("suppressMenu").checked,
      sensitivity: Number($("sensitivity").value)
    };
  }

  function flash(msg, ok = true) {
    const el = $("status");
    el.textContent = msg;
    el.style.color = ok ? "#2a8a3e" : "#c33";
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---- 初期化 ----
  chrome.storage.sync.get(["gestures", "linkGestures", "settings"], (data) => {
    renderGestures(rowsEl, data.gestures || self.MG_DEFAULT_GESTURES, false);
    renderGestures(rowsLinkEl, data.linkGestures || self.MG_DEFAULT_LINK_GESTURES, true);
    renderSettings(Object.assign({}, self.MG_DEFAULT_SETTINGS, data.settings || {}));
  });

  $("add").addEventListener("click", () => addRow(rowsEl, "", "none"));
  $("addLink").addEventListener("click", () => addRow(rowsLinkEl, "", "none"));

  $("trailWidth").addEventListener("input", (e) => ($("trailWidthVal").textContent = e.target.value));
  $("sensitivity").addEventListener("input", (e) => ($("sensitivityVal").textContent = e.target.value));

  $("save").addEventListener("click", () => {
    const g = collect(rowsEl);
    const lg = collect(rowsLinkEl);
    const dupes = [...new Set([...g.dupes, ...lg.dupes])];
    if (dupes.length) {
      flash("方向が重複しています: " + dupes.join(", "), false);
      return;
    }
    chrome.storage.sync.set(
      { gestures: g.out, linkGestures: lg.out, settings: collectSettings() },
      () => {
        if (chrome.runtime.lastError) flash("保存に失敗しました", false);
        else flash("保存しました");
      }
    );
  });

  $("reset").addEventListener("click", () => {
    renderGestures(rowsEl, self.MG_DEFAULT_GESTURES, false);
    renderGestures(rowsLinkEl, self.MG_DEFAULT_LINK_GESTURES, true);
    renderSettings(self.MG_DEFAULT_SETTINGS);
    flash("既定値を読み込みました（保存で確定）");
  });
})();
