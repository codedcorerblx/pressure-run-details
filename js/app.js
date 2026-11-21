/* ============================================================
   PRESSURE RUN DETAILS (PRD) — app.js
   Same system as the original Modifier Console:
     data/versions.json, config_theme.json, config_migration.json,
     config_disable.json, and per version
     data/<version>/fields.json      (the fixed dropdown cards)
     data/<version>/dead-drops.json  (the Dead-Drop dropdowns)
   Every dropdown option gets a global sequential id (fields first,
   then dead-drops). A permalink is
     ?b=<bitset of chosen option ids, base64url>&cf=<version>
      &n=<integer values, base36, dot separated>&reader=true
   The URL stays clean during normal use; params only appear after
   "Copy Permalink" or when opening a shared link, and any later
   change clears them again. Data is fetched with cache: "no-store".
   ============================================================ */
(function () {
  "use strict";

  var DATA_DIR = "data/";
  var SELECTION_KEY_PREFIX = "prd_selection::";
  var LAST_VERSION_KEY = "prd_last_version";
  var THEME_KEY = "prd_theme";

  var versionsManifest = { default: "", versions: [] };
  var themesManifest = { default: "bloxy-red", themes: [{ slug: "bloxy-red", label: "Bloxy Red (Default)" }] };
  var configMigration = {};
  var disabledVersions = [];
  var currentVersion = "";
  var readerMode = false;
  var copyListFormat = "short";

  var fields = [];      // [{key,label,options,integer,base}]
  var dd = { items: [], statuses: [], slots: 3, batMax: 3, I: 0, Q: 1, S: 0, per: 0, base: 0, batBase: 0 };
  var state = { v: [], n: [], d: [] }; // option index per field / int per field / option index per drop
  var els = {};
  var defaultMeta = {};

  document.addEventListener("DOMContentLoaded", init);

  function $(id) { return document.getElementById(id); }

  function init() {
    ["version-select", "theme-select", "og-format-select", "reader-checkbox", "reader-banner",
     "reader-edit-link", "masthead-settings-group", "settings-anchor", "mobile-settings-btn",
     "permalink-btn", "reset-btn", "prd-grid", "drop-grid", "field-count", "selected-count",
     "summary-list", "copy-list-btn", "copy-list-format", "toast", "app-modal-backdrop",
     "app-modal-title", "app-modal-body", "app-modal-actions", "app-modal-close",
     "meta-description", "og-description", "twitter-description"
    ].forEach(function (id) { els[id] = $(id); });

    defaultMeta = {
      d: els["meta-description"].getAttribute("content"),
      o: els["og-description"].getAttribute("content"),
      t: els["twitter-description"].getAttribute("content")
    };

    detectReaderMode();
    bindUI();

    Promise.all([
      fetchJSON(DATA_DIR + "versions.json"),
      fetchJSONOptional(DATA_DIR + "config_migration.json"),
      fetchJSONOptional(DATA_DIR + "config_disable.json"),
      fetchJSONOptional(DATA_DIR + "config_theme.json")
    ]).then(function (r) {
      configMigration = (r[1] && typeof r[1] === "object" && !Array.isArray(r[1])) ? r[1] : {};
      disabledVersions = Array.isArray(r[2]) ? r[2] : [];
      if (r[3] && Array.isArray(r[3].themes) && r[3].themes.length) {
        themesManifest = { default: r[3].default || r[3].themes[0].slug, themes: r[3].themes };
      }
      populateThemes();
      var saved = lsGet(THEME_KEY);
      var slug = saved && themesManifest.themes.some(function (t) { return t.slug === saved; }) ? saved : themesManifest.default;
      document.documentElement.setAttribute("data-theme", slug);
      els["theme-select"].value = slug;

      versionsManifest = r[0];
      versionsManifest.versions = versionsManifest.versions.filter(function (v) { return disabledVersions.indexOf(v.slug) < 0; });
      versionsManifest.versions.forEach(function (v) {
        var o = document.createElement("option");
        o.value = v.slug; o.textContent = v.label;
        els["version-select"].appendChild(o);
      });
      return switchVersion(resolveVersion(), true);
    }).catch(function (err) {
      console.error(err);
      els["prd-grid"].innerHTML = '<p class="empty-state">Failed to load data. Check data/versions.json and data/&lt;version&gt;/*.json.</p>';
    });
  }

  /* ---------- helpers ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function fetchJSON(p) {
    return fetch(p, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(p + " " + res.status);
      return res.json();
    });
  }
  function fetchJSONOptional(p) { return fetchJSON(p).catch(function () { return null; }); }
  function migrate(slug) {
    var seen = {};
    while (configMigration[slug] && !seen[slug]) { seen[slug] = 1; slug = configMigration[slug]; }
    return slug;
  }
  function versionExists(s) { return versionsManifest.versions.some(function (v) { return v.slug === s; }); }
  function resolveVersion() {
    var cf = new URLSearchParams(location.search).get("cf");
    var s = cf && migrate(cf);
    if (s && versionExists(s)) return s;
    s = lsGet(LAST_VERSION_KEY);
    if (s && versionExists(migrate(s))) return migrate(s);
    return versionsManifest.default;
  }
  function populateThemes() {
    themesManifest.themes.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.slug; o.textContent = t.label;
      els["theme-select"].appendChild(o);
    });
  }
  function detectReaderMode() {
    readerMode = new URLSearchParams(location.search).get("reader") === "true";
    document.body.classList.toggle("is-reader-mode", readerMode);
    if (readerMode) {
      els["reader-banner"].hidden = false;
      var u = new URL(location.href); u.searchParams.delete("reader");
      els["reader-edit-link"].href = u.toString();
    }
  }

  /* ---------- version + data ---------- */
  function switchVersion(slug, fromURL) {
    var dir = DATA_DIR + encodeURIComponent(slug) + "/";
    return Promise.all([fetchJSON(dir + "fields.json"), fetchJSON(dir + "dead-drops.json")]).then(function (r) {
      currentVersion = slug;
      els["version-select"].value = slug;
      lsSet(LAST_VERSION_KEY, slug);
      var id = 0;
      fields = r[0].map(function (f) { f.base = id; id += f.options.length; return f; });
      dd = r[1];
      dd.batMax = dd.batteries;
      dd.I = dd.items.length + 1;
      dd.Q = Math.max.apply(null, dd.items.map(function (x) { return x.max; }));
      dd.S = dd.statuses.length;
      dd.per = dd.I + dd.Q + dd.S;
      dd.base = id; id += dd.per * dd.slots;
      dd.batBase = id; id += dd.batMax + 1;
      hydrate(slug, fromURL);
      buildGrid();
      render();
    });
  }

  function blank() {
    state = {
      v: fields.map(function () { return 0; }),
      n: fields.map(function () { return 1; }),
      d: [],
      bat: 0
    };
    for (var s = 0; s < dd.slots; s++) state.d.push({ item: 0, qty: 1, status: 0 });
  }

  function hydrate(slug, fromURL) {
    blank();
    var p = new URLSearchParams(location.search);
    var cf = p.get("cf") && migrate(p.get("cf"));
    if (fromURL && p.get("b") && cf === slug) {
      applyIds(decodeSequence(p.get("b")));
      var n = (p.get("n") || "").split(".");
      fields.forEach(function (f, i) {
        var x = parseInt(n[i], 36);
        if (x > 0) state.n[i] = x;
      });
      return;
    }
    try {
      var raw = lsGet(SELECTION_KEY_PREFIX + slug);
      if (raw) {
        var s = JSON.parse(raw);
        applyIds(s.b || []);
        (s.n || []).forEach(function (x, i) { if (i < state.n.length && x > 0) state.n[i] = x; });
      }
    } catch (e) { /* ignore */ }
  }

  // chosen option ids -> per-dropdown indices (first id found inside each dropdown's range)
  function pick(ids, base, count) {
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] >= base && ids[i] < base + count) return ids[i] - base;
    }
    return 0;
  }
  function applyIds(ids) {
    fields.forEach(function (f, i) { state.v[i] = pick(ids, f.base, f.options.length); });
    var used = {};
    for (var i = 0; i < dd.slots; i++) {
      var b = dd.base + i * dd.per;
      var it = pick(ids, b, dd.I);
      if (it && used[it]) it = 0;          // same item can't be taken twice
      if (it) used[it] = 1;
      var max = it ? dd.items[it - 1].max : 1;
      var q = Math.min(pick(ids, b + dd.I, dd.Q) + 1, max);
      state.d[i] = { item: it, qty: q, status: pick(ids, b + dd.I + dd.Q, dd.S) };
    }
    state.bat = pick(ids, dd.batBase, dd.batMax + 1);
  }
  function chosenIds() {
    var out = fields.map(function (f, i) { return f.base + state.v[i]; });
    state.d.forEach(function (s, i) {
      var b = dd.base + i * dd.per;
      out.push(b + s.item, b + dd.I + (s.qty - 1), b + dd.I + dd.Q + s.status);
    });
    out.push(dd.batBase + state.bat);
    return out;
  }
  function persist() {
    lsSet(SELECTION_KEY_PREFIX + currentVersion, JSON.stringify({ b: chosenIds(), n: state.n }));
  }

  /* ---------- UI build ---------- */
  function makeSelect(opts, value, onChange, label) {
    var s = document.createElement("select");
    s.className = "version-select";
    s.setAttribute("aria-label", label);
    opts.forEach(function (o, i) {
      var e = document.createElement("option");
      e.value = i; e.textContent = o;
      s.appendChild(e);
    });
    s.value = value;
    s.addEventListener("change", function () { onChange(parseInt(s.value, 10)); });
    return s;
  }
  function makeCell(label, child) {
    var c = document.createElement("div");
    c.className = "prd-cell";
    var l = document.createElement("span");
    l.className = "prd-cell-label"; l.textContent = label;
    c.appendChild(l); c.appendChild(child);
    return c;
  }
  var intInputs = [];
  var dropEls = [];
  function buildGrid() {
    els["prd-grid"].innerHTML = ""; els["drop-grid"].innerHTML = "";
    intInputs = [];
    fields.forEach(function (f, i) {
      var row = document.createElement("div");
      row.className = "prd-cell-row";
      row.appendChild(makeSelect(f.options, state.v[i], function (v) { state.v[i] = v; changed(); }, f.label));
      if (f.integer) {
        var inp = document.createElement("input");
        inp.type = "number"; inp.min = 1; inp.step = 1; inp.className = "prd-int";
        inp.value = state.n[i];
        inp.setAttribute("aria-label", f.label + " amount");
        inp.addEventListener("input", function () {
          state.n[i] = Math.max(1, parseInt(inp.value, 10) || 1);
          changed(true);
        });
        intInputs[i] = inp; row.appendChild(inp);
      }
      els["prd-grid"].appendChild(makeCell(f.label, row));
    });
    dropEls = [];
    state.d.forEach(function (s, i) {
      var item = document.createElement("select");
      item.className = "version-select";
      item.setAttribute("aria-label", "Dead-Drop " + (i + 1) + " item");
      item.addEventListener("change", function () {
        s.item = parseInt(item.value, 10);
        s.qty = 1;
        changed();
      });
      var qty = document.createElement("select");
      qty.className = "version-select prd-qty";
      qty.setAttribute("aria-label", "Dead-Drop " + (i + 1) + " amount");
      qty.addEventListener("change", function () { s.qty = parseInt(qty.value, 10); changed(); });
      var status = makeSelect(dd.statuses, s.status, function (v) { s.status = v; changed(); }, "Dead-Drop " + (i + 1) + " status");
      var row = document.createElement("div");
      row.className = "prd-cell-row";
      row.appendChild(qty); row.appendChild(status);
      var wrap = document.createElement("div");
      wrap.className = "prd-cell-stack";
      wrap.appendChild(item); wrap.appendChild(row);
      dropEls[i] = { item: item, qty: qty, status: status };
      els["drop-grid"].appendChild(makeCell("Dead-Drop " + (i + 1), wrap));
    });
    var bo = [];
    for (var n = 0; n <= dd.batMax; n++) bo.push(String(n));
    els["drop-grid"].appendChild(makeCell("Batteries (0–" + dd.batMax + ")",
      makeSelect(bo, state.bat, function (v) { state.bat = v; changed(); }, "Batteries")));
  }

  function fill(sel, pairs, value) {
    sel.innerHTML = "";
    pairs.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p[0]; o.textContent = p[1];
      sel.appendChild(o);
    });
    sel.value = String(value);
  }
  // Shared item list: an item already taken by another dead-drop is hidden here.
  function refreshDrops() {
    state.d.forEach(function (s, i) {
      var takenElsewhere = {};
      state.d.forEach(function (o, k) { if (k !== i && o.item) takenElsewhere[o.item] = 1; });
      var pairs = [[0, "None"]];
      dd.items.forEach(function (it, k) { if (!takenElsewhere[k + 1]) pairs.push([k + 1, it.name]); });
      var e = dropEls[i];
      fill(e.item, pairs, s.item);
      var max = s.item ? dd.items[s.item - 1].max : 1;
      s.qty = Math.min(s.qty, max);
      var qp = [];
      for (var q = 1; q <= max; q++) qp.push([q, "x" + q]);
      fill(e.qty, qp, s.qty);
      e.qty.hidden = max < 2;                 // single-copy items show no amount dropdown
      e.status.disabled = !s.item;
    });
  }

  function isInt(i) { return !!fields[i].integer && fields[i].options[state.v[i]] === fields[i].integer; }
  function valueOf(i) { return isInt(i) ? String(state.n[i]) : fields[i].options[state.v[i]]; }
  function rows() {
    return fields.map(function (f, i) { return [f.label, valueOf(i)]; })
      .concat(state.d.map(function (s, i) {
        if (!s.item) return ["Dead-Drop " + (i + 1), "None"];
        var it = dd.items[s.item - 1];
        return ["Dead-Drop " + (i + 1),
          it.name + (it.max > 1 ? " x" + s.qty : "") + " (" + dd.statuses[s.status] + ")"];
      }))
      .concat([["Batteries", String(state.bat)]]);
  }

  function changed(typing) {
    persist();
    clearURLParams();
    render(typing);
  }

  function render(typing) {
    intInputs.forEach(function (inp, i) {
      if (!inp) return;
      inp.hidden = !isInt(i);
      if (!typing) inp.value = state.n[i];
    });
    refreshDrops();
    els["field-count"].textContent = (fields.length + dd.slots + 1) + " fields";
    els["selected-count"].textContent = currentVersion.replace("_", ".");
    var box = els["summary-list"];
    box.innerHTML = "";
    rows().forEach(function (r) {
      var item = document.createElement("div");
      item.className = "summary-item";
      var n = document.createElement("div");
      n.className = "summary-item-name"; n.textContent = r[0];
      var h = document.createElement("div");
      h.className = "summary-item-how"; h.textContent = r[1];
      item.appendChild(n); item.appendChild(h);
      box.appendChild(item);
    });
  }

  /* ---------- copy list + OG preview ---------- */
  function buildShort() { return rows().map(function (r) { return r[1]; }).join(" | "); }
  function buildLong() {
    return "Pressure Run Details\n" + rows().map(function (r) { return r[0] + ": " + r[1]; }).join("\n");
  }
  function copyText(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(msg); }, function () { toast("Copy failed"); });
    } else { toast("Copy failed"); }
  }
  function applyOg(format) {
    var d = defaultMeta.d, o = defaultMeta.o, t = defaultMeta.t;
    if (format !== "none") {
      d = o = t = format === "long" ? buildLong() : buildShort();
    }
    els["meta-description"].setAttribute("content", d);
    els["og-description"].setAttribute("content", o);
    els["twitter-description"].setAttribute("content", t);
  }

  /* ---------- permalink ---------- */
  function setPermalinkURL(reader) {
    var u = new URL(location.href);
    u.searchParams.set("cf", currentVersion);
    u.searchParams.set("b", encodeSequence(chosenIds()));
    var ints = fields.map(function (f, i) { return state.n[i].toString(36); }).join(".");
    u.searchParams.set("n", ints);
    if (reader) u.searchParams.set("reader", "true"); else u.searchParams.delete("reader");
    history.replaceState({}, "", u.toString());
  }
  function clearURLParams() {
    var u = new URL(location.href);
    if (u.searchParams.has("b") || u.searchParams.has("cf") || u.searchParams.has("n") || u.searchParams.has("reader")) {
      ["b", "cf", "n", "reader"].forEach(function (k) { u.searchParams.delete(k); });
      history.replaceState({}, "", u.toString());
    }
    applyOg("none");
  }
  // Bitset: bit n set = option id n chosen. base64url, no padding.
  function encodeSequence(values) {
    if (!values.length) return "";
    var max = Math.max.apply(null, values.concat([0]));
    var bytes = new Uint8Array(Math.ceil((max + 1) / 8));
    values.forEach(function (n) { bytes[n >> 3] |= 1 << (n & 7); });
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeSequence(s) {
    try {
      var bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
      var out = [];
      for (var i = 0; i < bin.length; i++) {
        var b = bin.charCodeAt(i);
        for (var k = 0; k < 8; k++) if (b & (1 << k)) out.push(i * 8 + k);
      }
      return out;
    } catch (e) { return []; }
  }
  function copyPermalink() {
    var reader = els["reader-checkbox"].checked;
    setPermalinkURL(reader);
    applyOg(els["og-format-select"].value);
    copyText(location.href, reader ? "Read-only permalink copied" : "Permalink copied");
  }

  /* ---------- UI wiring ---------- */
  function bindUI() {
    els["version-select"].addEventListener("change", function () {
      var s = els["version-select"].value;
      if (s === currentVersion) return;
      clearURLParams();
      switchVersion(s, false);
    });
    els["theme-select"].addEventListener("change", function () {
      var s = els["theme-select"].value;
      document.documentElement.setAttribute("data-theme", s);
      lsSet(THEME_KEY, s);
    });
    els["permalink-btn"].addEventListener("click", copyPermalink);
    els["reset-btn"].addEventListener("click", function () {
      blank(); persist(); clearURLParams(); buildGrid(); render(); toast("Reset");
    });
    els["mobile-settings-btn"].addEventListener("click", openSettingsModal);
    els["copy-list-btn"].addEventListener("click", function () {
      copyText(copyListFormat === "long" ? buildLong() : buildShort(), "List copied");
    });
    var pills = Array.prototype.slice.call(els["copy-list-format"].querySelectorAll(".pill-btn"));
    pills.forEach(function (b) {
      b.addEventListener("click", function () {
        copyListFormat = b.getAttribute("data-format");
        pills.forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });
    els["app-modal-close"].addEventListener("click", closeModal);
    els["app-modal-backdrop"].addEventListener("click", function (e) {
      if (e.target === els["app-modal-backdrop"]) closeModal();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }

  /* ---------- modal (mobile settings) ---------- */
  function openSettingsModal() {
    els["app-modal-title"].textContent = "Settings";
    els["app-modal-body"].innerHTML = ""; els["app-modal-actions"].innerHTML = "";
    els["app-modal-body"].appendChild(els["masthead-settings-group"]);
    var done = document.createElement("button");
    done.type = "button"; done.className = "btn btn-ghost"; done.textContent = "Done";
    done.addEventListener("click", closeModal);
    els["app-modal-actions"].appendChild(done);
    els["app-modal-backdrop"].hidden = false;
  }
  function closeModal() {
    if (els["masthead-settings-group"].parentNode === els["app-modal-body"]) {
      els["settings-anchor"].insertAdjacentElement("afterend", els["masthead-settings-group"]);
    }
    els["app-modal-backdrop"].hidden = true;
  }

  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg; els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2400);
  }
})();
