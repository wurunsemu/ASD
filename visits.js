/* Sporcu Pratik – Görüşme geçmişi, geri bildirim soruları, not önerileri ve Drive otomatik senkron */
(function () {
  "use strict";

  var DRIVE_URL = "https://script.google.com/macros/s/AKfycbzCqlfTDz29K6B5YTmmn0OYP77WQxvYEq-nRbXwqu5byAORLuaH8rQ_0rItwopftFxWIA/exec";
  var MEALS = ["Kahvaltı", "Ara 1", "Öğle", "Ara 2", "Akşam", "Ara 3"];
  var GROUPS = ["Süt (tam)", "Süt (yarım)", "Süt (yağsız)", "Et/Peynir/Yumurta", "Ekmek/Tahıl", "Sebze", "Meyve", "Yağ", "Protein tozu (g)"];
  var CLEAR_ON_LOAD = ["pdf_notes", "pdf_notes_auto", "menu_auto_last", "visit_feedback", "visit_next_notes", "q_dislike", "q_hunger", "q_weight", "q_meals_change", "q_meals_remove", "q_t0", "q_t1", "q_t2", "q_t3", "q_t4", "q_t5"];

  function $(id) { return document.getElementById(id); }
  function num(id) { var e = $(id); var v = e ? parseFloat(String(e.value).replace(",", ".")) : NaN; return isFinite(v) ? v : 0; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function today() { return new Date().toLocaleDateString("tr-TR"); }
  function nowStr() { var d = new Date(); return today() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function txt(id) { var e = $(id); return e ? String(e.innerText || "").trim() : ""; }
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h); }
  function clients() { try { return typeof CL !== "undefined" ? CL : null; } catch (e) { return null; } }
  function persist() {
    try { localStorage.setItem("sp_c_v26", JSON.stringify(clients())); } catch (e) { return false; }
    try { if (typeof window.renderClientList === "function") window.renderClientList(); } catch (e) {}
    return true;
  }
  function snapshot() {
    var d = {};
    document.querySelectorAll("input:not([type=file]),select,textarea").forEach(function (e) { if (e.id) d[e.id] = e.value; });
    return d;
  }
  function curClient() {
    var cl = clients(), id = $("cid") ? $("cid").value : "";
    return cl && id ? (cl.find(function (x) { return x.id === id; }) || null) : null;
  }

  // ------------------------------------------------------------ danışan kaydı (sekme değiştirmeden)
  function ensureClient() {
    var c = curClient(); if (c) return c;
    var cl = clients(); if (!cl) return null;
    var ad = $("cn") ? $("cn").value.trim() : "";
    if (!ad) { return null; }
    var phone = $("cphone") ? $("cphone").value : "";
    var dup = null;
    try { dup = typeof window.findDup === "function" ? window.findDup(ad, phone, "") : null; } catch (e) {}
    if (dup) { c = dup; }
    else {
      c = { id: Date.now().toString(36), h: [] }; cl.push(c);
      try { c.kod = typeof window.nextKod === "function" ? window.nextKod() : ""; } catch (e) {}
    }
    try { c.pk = typeof window.contactKey === "function" ? window.contactKey(phone) : ""; } catch (e) {}
    c.ad = ad; c.u = Date.now(); c.tarih = today();
    c.sport = ($("cnt_sport") && $("cnt_sport").value) || "Sporcu";
    c.hedef = ($("cg2") && $("cg2").selectedOptions && $("cg2").selectedOptions.length) ? $("cg2").selectedOptions[0].text : "Performans";
    c.h = c.h || [];
    c.h.push({ t: today(), kg: num("kg"), tee: txt("tee") });
    $("cid").value = c.id; if ($("ckod")) $("ckod").value = c.kod || "";
    persist();
    return c;
  }

  // ------------------------------------------------------------ görüşme arşivi
  function exTotals(d) {
    var out = [];
    for (var g = 0; g < 9; g++) { var t = 0; for (var j = 0; j < 6; j++) t += parseFloat(d["m" + g + "_" + j]) || 0; out.push(Math.round(t * 10) / 10); }
    return out;
  }
  function summary(d) {
    return {
      kg: d.kg, pal: d.pal, adj: d.adj, eq: d.eq, cg: d.cg, pg: d.pg,
      tee: txt("tee"), cho: txt("c1"), pro: txt("p1"), fat: txt("f1"),
      ex: exTotals(d), hy: [txt("p1h"), txt("p2h"), txt("p3h"), txt("p4h")].filter(Boolean),
      menuLines: (d.written_menu || "").split("\n").filter(function (l) { return l.trim(); }).length
    };
  }
  function keyOf(d) {
    var keys = Object.keys(d).filter(function (k) { return !/^(visit_|q_|drive_|sheet_|form_|tanita|cid$|ckod$|pdf_notes_auto|menu_auto_last)/.test(k); }).sort();
    return hash(keys.map(function (k) { return k + "=" + d[k]; }).join("|"));
  }

  function archive(label) {
    var c = ensureClient();
    if (!c) { setMsg("⚠️ Görüşmeyi kaydetmek için önce Ad Soyad girin (1. Danışan Kayıtları).", true); return null; }
    var d = snapshot(); c.d = d; c.u = Date.now(); c.v = c.v || [];
    var rec = { id: Date.now().toString(36), ts: Date.now(), t: nowStr(), day: today(), lbl: label || "Görüşme", d: d, sum: summary(d), key: keyOf(d) };
    var last = c.v[c.v.length - 1];
    if (last && last.day === rec.day && last.key === rec.key) { last.ts = rec.ts; last.t = rec.t; last.d = d; last.sum = rec.sum; if (label && last.lbl !== label && !/PDF/.test(last.lbl)) last.lbl = label; rec = last; }
    else c.v.push(rec);
    if (c.v.length > 40) c.v.shift();
    persist(); renderHistory();
    setMsg("✔ Görüşme kaydedildi (" + rec.t + "): değişim dağılımı, menü, enerji/sıvı değerleri ve notlar arşivlendi.", false);
    return rec;
  }

  function setMsg(t, warn) {
    var el = $("vs_msg"); if (!el) return;
    el.textContent = t || ""; el.className = "text-xs font-semibold min-h-[16px] " + (warn ? "text-amber-700" : "text-emerald-700");
  }

  function numFrom(s) { var m = String(s || "").replace(/\./g, "").match(/-?\d+/); return m ? parseInt(m[0], 10) : NaN; }

  function renderHistory() {
    var box = $("vs_history"); if (!box) return;
    var c = curClient(), nameEl = $("vs_client");
    if (nameEl) nameEl.textContent = c ? c.ad + (c.kod ? " (" + c.kod + ")" : "") : ($("cn") && $("cn").value.trim() ? $("cn").value.trim() + " (henüz kaydedilmedi)" : "Danışan seçilmedi");
    var rem = $("vs_remind");
    if (rem) {
      if (c && c.remind && c.remind.txt) { rem.classList.remove("hidden"); rem.innerHTML = "<b>🔔 Geçen görüşmeden hatırlatma (" + esc(c.remind.t) + "):</b><br>" + esc(c.remind.txt).replace(/\n/g, "<br>"); }
      else rem.classList.add("hidden");
    }
    var v = c && c.v ? c.v : [];
    if (!v.length) { box.innerHTML = '<div class="text-xs text-slate-400 p-3">Henüz kayıtlı görüşme yok. "Görüşmeyi Kaydet" veya diyet PDF\'i indirince burada listelenir.</div>'; return; }
    box.innerHTML = v.slice().reverse().map(function (r, ri) {
      var idx = v.length - 1 - ri, prev = v[idx - 1], s = r.sum || {}, delta = "";
      if (prev && prev.sum) {
        var dk = parseFloat(s.kg) - parseFloat(prev.sum.kg), dt = numFrom(s.tee) - numFrom(prev.sum.tee);
        var parts = [];
        if (isFinite(dk) && dk !== 0) parts.push("Kilo " + (dk > 0 ? "+" : "") + Math.round(dk * 10) / 10 + " kg");
        if (isFinite(dt) && dt !== 0) parts.push("TEE " + (dt > 0 ? "+" : "") + dt + " kcal");
        delta = parts.length ? '<span class="text-[11px] text-indigo-600 font-semibold">Önceki görüşmeye göre: ' + parts.join(" · ") + "</span>" : "";
      }
      var ex = (s.ex || []).map(function (x, g) { return x ? GROUPS[g] + " " + x : ""; }).filter(Boolean).join(" · ");
      var d = r.d || {};
      return '<div class="border border-slate-200 rounded-xl p-3 space-y-1.5 bg-slate-50/60">' +
        '<div class="flex flex-wrap justify-between items-center gap-2"><div class="text-xs font-bold text-slate-800">' + esc(r.t) + ' <span class="font-normal text-slate-500">· ' + esc(r.lbl) + "</span></div>" +
        '<div class="flex gap-1.5"><button data-vact="load" data-vid="' + r.id + '" class="bg-emerald-50 text-emerald-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-emerald-200 hover:bg-emerald-100">Bu diyeti yükle</button>' +
        '<button data-vact="view" data-vid="' + r.id + '" class="bg-white text-slate-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100">Ayrıntı</button>' +
        '<button data-vact="del" data-vid="' + r.id + '" class="bg-rose-50 text-rose-700 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-rose-200 hover:bg-rose-100">Sil</button></div></div>' +
        '<div class="text-[11px] text-slate-600">' + (s.kg ? s.kg + " kg · " : "") + "TEE " + esc(s.tee || "–") + " · CHO " + esc(s.cho || "–") + " · Protein " + esc(s.pro || "–") + (s.fat ? " · Yağ " + esc(s.fat) : "") + (s.pal ? " · PAL " + esc(s.pal) : "") + (s.adj && s.adj !== "0" ? " · Ayar " + esc(s.adj) + " kcal" : "") + "</div>" +
        (ex ? '<div class="text-[11px] text-slate-500">Değişim: ' + esc(ex) + "</div>" : "") + delta +
        (d.visit_feedback ? '<div class="text-[11px] text-slate-700"><b>Danışan geri bildirimi:</b> ' + esc(d.visit_feedback) + "</div>" : "") +
        '<div id="vd_' + r.id + '" class="hidden pt-1.5 space-y-2 text-[11px]">' +
        (s.hy && s.hy.length ? '<div><b>Sıvı değerlendirmesi:</b> ' + esc(s.hy.join(" · ")) + "</div>" : "") +
        (d.client_notes ? '<div><b>Klinik notlar:</b><pre class="whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg p-2">' + esc(d.client_notes) + "</pre></div>" : "") +
        (d.visit_next_notes ? '<div><b>Sonraki görüşme için not:</b><pre class="whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg p-2">' + esc(d.visit_next_notes) + "</pre></div>" : "") +
        '<div><b>Menü:</b><pre class="whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg p-2">' + esc(d.written_menu || "(menü yok)") + "</pre></div>" +
        (d.pdf_notes ? '<div><b>PDF notları:</b><pre class="whitespace-pre-wrap font-mono bg-white border border-slate-200 rounded-lg p-2">' + esc(d.pdf_notes) + "</pre></div>" : "") +
        "</div></div>";
    }).join("");
  }

  function applySnapshot(d) {
    CLEAR_ON_LOAD.forEach(function (k) { if ($(k)) $(k).value = ""; });
    for (var k in d) { if (k === "cid" || k === "ckod" || k === "drive_webhook_url") continue; if ($(k)) $(k).value = d[k]; }
    try { if (typeof window.calc === "function") window.calc(); if (typeof window.sm === "function") window.sm(); if (typeof window.save === "function") window.save(); } catch (e) {}
    syncChips(); renderHistory();
  }

  function onHistoryClick(ev) {
    var b = ev.target.closest ? ev.target.closest("[data-vact]") : null; if (!b) return;
    var c = curClient(); if (!c || !c.v) return;
    var rec = c.v.find(function (x) { return x.id === b.getAttribute("data-vid"); }); if (!rec) return;
    var act = b.getAttribute("data-vact");
    if (act === "view") { var el = $("vd_" + rec.id); if (el) el.classList.toggle("hidden"); }
    else if (act === "del") { if (window.confirm(rec.t + " tarihli görüşme kaydı silinsin mi?")) { c.v = c.v.filter(function (x) { return x !== rec; }); persist(); renderHistory(); } }
    else if (act === "load") {
      if (!window.confirm(rec.t + " tarihli diyet (değişim dağılımı, menü, enerji ve notlar) ekrana yüklensin mi?\nŞu anki ekran bilgileri değişir (önce \"Görüşmeyi Kaydet\" ile saklayabilirsiniz).")) return;
      applySnapshot(rec.d);
      if (window.switchTab) window.switchTab("dg");
    }
  }

  // ------------------------------------------------------------ yeni görüşme + sorular
  function startNewVisit() {
    var c = ensureClient();
    if (!c) { setMsg("⚠️ Önce danışanın Ad Soyad bilgisini girip kaydedin.", true); return; }
    archive("Görüşme sonu");
    var nx = $("visit_next_notes") ? $("visit_next_notes").value.trim() : "";
    c.remind = nx ? { t: nowStr(), txt: nx } : null;
    ["visit_feedback", "visit_next_notes", "q_hunger", "q_weight", "q_meals_change", "q_meals_remove"].forEach(function (k) { if ($(k)) $(k).value = ""; });
    syncChips(); persist(); renderHistory();
    var lg = $("vs_log"); if (lg) lg.innerHTML = "";
    setMsg("✔ Yeni görüşme hazır. Önceki diyet korundu; aşağıdaki soruları yanıtlayıp \"Yeni diyeti hazırla\"ya basın.", false);
  }

  function chipVals(id) { var e = $(id); return e && e.value ? e.value.split(",").filter(Boolean).map(Number) : []; }
  function syncChips() {
    document.querySelectorAll("#vs_chips [data-chip]").forEach(function (b) {
      var on = chipVals(b.getAttribute("data-chip") === "remove" ? "q_meals_remove" : "q_meals_change").indexOf(parseInt(b.getAttribute("data-meal"), 10)) >= 0;
      b.className = "chipb px-3 py-1.5 rounded-lg text-xs font-semibold border transition " + (on ? (b.getAttribute("data-chip") === "remove" ? "bg-rose-600 text-white border-rose-600" : "bg-indigo-600 text-white border-indigo-600") : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50");
    });
  }
  function toggleChip(b) {
    var id = b.getAttribute("data-chip") === "remove" ? "q_meals_remove" : "q_meals_change", m = parseInt(b.getAttribute("data-meal"), 10);
    var v = chipVals(id), i = v.indexOf(m); if (i >= 0) v.splice(i, 1); else v.push(m);
    $(id).value = v.sort().join(","); syncChips();
    try { if (typeof window.save === "function") window.save(); } catch (e) {}
  }

  function applyAnswers() {
    if (!window.ExchangeMenu) { return; }
    var log = window.ExchangeMenu.applyFeedback({ remove: chipVals("q_meals_remove"), change: chipVals("q_meals_change"), hunger: $("q_hunger") ? $("q_hunger").value : "" });
    var w = $("q_weight") ? $("q_weight").value : "";
    if (w === "yavas") log.push("💡 Kilo/performans hedefe göre yavaş ilerliyor: 2. adımdaki \"Enerji Ayarı (kcal)\" veya PAL değerini gözden geçirebilirsiniz (karar sizde, otomatik değiştirilmedi).");
    if (w === "hizli") log.push("💡 İlerleme çok hızlı: Enerji Ayarı (kcal) ve karbonhidrat/protein hedeflerini gözden geçirmeniz önerilir (karar sizde, otomatik değiştirilmedi).");
    refreshNotes(false);
    log.push("• PDF notları önerisi güncellendi (elle düzenlediyseniz korunur).");
    var lg = $("vs_log"); if (lg) lg.innerHTML = log.map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("");
    autosave();
    setMsg("✔ Yanıtlar yeni diyete işlendi. Menü Planlama sekmesinden kontrol edip düzenleyebilirsiniz.", false);
  }

  // ------------------------------------------------------------ PDF notları: öneri (elle düzeltilirse korunur)
  function list(id) { var e = $(id); return e && e.value.trim() ? e.value.split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean) : []; }
  function r50(x) { return Math.round(x / 50) * 50; }
  function buildNotes() {
    var kg = num("kg"), L = [];
    L.push("Günde 2-3 fincan şekersiz filtre kahve veya çay içebilirsiniz.");
    if (kg > 0) {
      var a = Math.round(kg * 0.035 * 2) / 2, b = Math.round(kg * 0.045 * 2) / 2;
      L.push("Gün içinde yaklaşık " + a + " - " + b + " L su içelim; yanımızda her zaman su bulunduralım.");
    }
    var sport = $("cnt_sport") ? $("cnt_sport").value.trim() : "", dur = num("dur");
    if (kg > 0 && (sport || dur > 0)) {
      L.push("Antrenman/müsabakadan 2-4 saat önce " + r50(kg * 5) + " - " + r50(kg * 7) + " mL su içelim; antrenman sırasında 15-20 dakikada bir 150-250 mL sıvı alalım.");
    }
    var h1 = num("h1"), h2 = num("h2"), h3 = num("h3"), h4 = num("h4"), h5 = num("h5");
    if (h1 > 0 && h2 > 0 && h5 > 0) {
      var rate = ((h1 - h2) + h3 - h4) / h5;
      if (rate > 0.1 && rate < 4) L.push("Terleme testinize göre terleme hızınız yaklaşık " + (Math.round(rate * 100) / 100) + " L/saat; antrenman sırasında bu kaybı büyük ölçüde yerine koymaya çalışalım.");
    }
    var toz = 0; for (var j = 0; j < 6; j++) toz += num("m8_" + j);
    if (toz > 0) L.push("Protein tozunu antrenmandan sonraki ilk 1 saat içinde su veya süt ile tüketelim.");
    if ($("q_hunger") && $("q_hunger").value === "ac") L.push("Aç hissettiğinizde ara öğünlere çiğ sebze (havuç, salatalık) veya bir kase yoğurt ekleyebilirsiniz.");
    var dis = list("q_dislike");
    if (dis.length) L.push("Yemek istemediğiniz besinlere (" + dis.join(", ") + ") menüde yer verilmemiştir.");
    L.push("");
    L.push("Önümüzdeki süreçte;");
    L.push("Aşırı yağlı kızartmalar, ağır kebaplar ve işlenmiş etler (sucuk, salam, sosis)");
    L.push("Şeker, şekerli tatlılar, şerbetli soslar, dondurma");
    L.push("Cips, gofret, şekerleme, abur cubur, çikolata, tüm paketli atıştırmalıklar");
    L.push("Şekerli veya gazlı içecekler, hazır meyve suları, alkollü içecekler tüketmemeye çalışalım.");
    return L.join("\n");
  }

  function refreshNotes(force) {
    var ta = $("pdf_notes"), au = $("pdf_notes_auto"); if (!ta || !au) return;
    var cur = ta.value.trim(), last = au.value.trim(), msg = $("notes_msg");
    if (force) {
      if (cur && cur !== last && !window.confirm("Elle yazdığınız/düzelttiğiniz notlar silinip öneriyle değiştirilecek. Devam edilsin mi?")) return;
    } else {
      if (last === "__off__") return;
      if (!(cur === "" || cur === last)) { if (msg) msg.textContent = "Notlar elle düzenlendiği için öneri uygulanmadı (sizin metniniz korunuyor)."; return; }
    }
    var nw = buildNotes();
    ta.value = nw; au.value = nw;
    if (msg) msg.textContent = "✔ Notlar, danışan bilgilerine göre öneri olarak yazıldı. Düzenlerseniz sizin metniniz korunur.";
    try { if (typeof window.save === "function") window.save(); } catch (e) {}
  }

  // ------------------------------------------------------------ otomatik kayıt + Drive senkron
  var autoT = null;
  function autosave() {
    var c = curClient(); if (!c) return;
    c.d = snapshot(); c.u = Date.now(); persist();
  }
  function scheduleAutosave() { clearTimeout(autoT); autoT = setTimeout(autosave, 1800); }

  var syncBusy = false, driveT = null;
  function driveUrl() { var e = $("drive_webhook_url"); return (e && e.value.trim()) || DRIVE_URL; }
  function driveStatus(t, ok) { var e = $("sync_status_msg"); if (e) { e.innerText = t; } var f = $("vs_sync"); if (f) { f.textContent = t; f.className = "text-[11px] font-semibold " + (ok === false ? "text-amber-700" : "text-emerald-700"); } }
  async function driveSync(reason, force) {
    if (syncBusy) return;
    var chk = $("drive_auto_chk"); if (chk && !chk.checked && !force) return;
    var raw = ls("sp_c_v26"); if (!raw || raw === "[]") return;
    var h = hash(raw); if (!force && h === ls("sp_drive_last_hash")) return;
    var url = driveUrl(); if (!url) return;
    syncBusy = true;
    try {
      await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: raw, keepalive: raw.length < 60000 });
      ls("sp_drive_last_hash", h);
      var d = new Date(); driveStatus("✔ Google Drive'a " + (reason || "otomatik") + " senkronize edildi (" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ").", true);
    } catch (e) { driveStatus("⚠️ Senkron hatası: " + (e && e.message ? e.message : e) + " (internet bağlantısı gelince otomatik yeniden denenecek)", false); }
    syncBusy = false;
  }

  // ------------------------------------------------------------ kurulum
  function setup() {
    // Drive URL: gömülü varsayılan (kullanıcı değiştirirse o kalır)
    var du = $("drive_webhook_url");
    if (du) {
      du.value = ls("sp_drive_url_v31") || DRIVE_URL;
      du.addEventListener("input", function () { ls("sp_drive_url_v31", du.value.trim()); });
    }
    var chk = $("drive_auto_chk");
    if (chk) { chk.checked = ls("sp_drive_auto") !== "0"; chk.addEventListener("change", function () { ls("sp_drive_auto", chk.checked ? "1" : "0"); driveStatus(chk.checked ? "Otomatik senkron açık." : "Otomatik senkron kapalı.", true); }); }

    var hist = $("vs_history"); if (hist) hist.addEventListener("click", onHistoryClick);
    var bind = function (id, fn) { var e = $(id); if (e && !e.dataset.b) { e.dataset.b = "1"; e.addEventListener("click", fn); } };
    bind("btn_visit_save", function () { archive("Görüşme kaydı"); });
    bind("btn_visit_new", startNewVisit);
    bind("btn_visit_apply", applyAnswers);
    bind("btn_notes_suggest", function () { var au = $("pdf_notes_auto"); if (au && au.value === "__off__") au.value = ""; refreshNotes(true); });
    document.querySelectorAll("#vs_chips [data-chip]").forEach(function (b) { b.addEventListener("click", function () { toggleChip(b); }); });
    var pn = $("pdf_notes");
    if (pn) pn.addEventListener("input", function () { var au = $("pdf_notes_auto"); if (au && pn.value.trim() === "") au.value = "__off__"; });

    document.addEventListener("input", function (ev) {
      var id = ev.target && ev.target.id;
      scheduleAutosave();
      if (id && id !== "pdf_notes" && /^(kg|cnt_sport|dur|h[1-5]|q_dislike|q_hunger|m8_\d)$/.test(id)) { clearTimeout(refreshNotes._t); refreshNotes._t = setTimeout(function () { refreshNotes(false); }, 900); }
    });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") driveSync("kapanışta"); });
    window.addEventListener("pagehide", function () { driveSync("kapanışta"); });
    setInterval(function () { driveSync("otomatik"); }, 15000);

    syncChips(); renderHistory();
    refreshNotes(false);
    setTimeout(function () { driveSync("açılışta"); }, 4000);
  }

  window.Visits = {
    archive: archive, renderHistory: renderHistory, refreshNotes: refreshNotes, buildNotes: buildNotes, driveSync: driveSync,
    clearFields: function () { CLEAR_ON_LOAD.forEach(function (k) { if ($(k)) $(k).value = ""; }); },
    onClientLoaded: function () { syncChips(); renderHistory(); refreshNotes(false); }
  };
  window.__clearVisitFields = window.Visits.clearFields;

  // Ana betiğin window.onload işlemlerinden SONRA çalışsın
  window.addEventListener("load", function () { setTimeout(setup, 50); });
})();
