/* Sporcu Pratik – Değişim tablosu <-> Yazılı menü eşitleme
 *  - "Örnek Değişim Dağıtımı" her basışta (hedeflere göre ölçeklenen) farklı bir örnek getirir.
 *  - Tablodaki değişim sayıları değişince alttaki yazılı menü (Yunus Aksu formatı) otomatik yeniden yazılır.
 *  - Menü elle düzenlenmişse üzerine yazılmaz; "Tablodan yeniden yaz" ile eşitlenir.
 */
(function () {
  "use strict";

  var GROUPS = { SUT0: 0, SUT1: 1, SUT2: 2, ET: 3, CHO: 4, SEBZE: 5, MEYVE: 6, YAG: 7, TOZ: 8 };
  var TIMES = ["08.00 - 09.00", "11.00 - 11.30", "13.30 - 14.30", "16.30 - 17.30", "19.30 - 20.30", "22.30 - 23.00"];
  var TITLES = ["Kahvaltı", "Ara Öğün", "Öğle Yemeği", "Ara Öğün", "Akşam Yemeği", "Ara Öğün"];
  var TYPE = ["k", "s", "m", "s", "m", "s"]; // kahvaltı / ara / ana
  var LS_LAST = "sp_menu_auto_last", LS_VAR = "sp_menu_variant";

  // Öğün başına ağırlıklar (toplam 1'e normalize edilir) ve sabit kalemler
  var PATTERNS = [
    { name: "Dengeli 6 öğün",
      sut: { idx: 1, cells: [0, 1, 0, 0, 0, 1] }, sebze: [1, 0, 1, 0, 1, 0], meyve: [0, 1, 0, 1, 0, 0], toz: [0, 0, 0, 0, 0, 0],
      etW: [0.25, 0, 0.375, 0, 0.375, 0], choW: [0.22, 0, 0.34, 0.10, 0.34, 0], yagW: [0.2, 0, 0.4, 0, 0.4, 0] },
    { name: "3 ana + 2 ara (hafif akşam)",
      sut: { idx: 1, cells: [1, 0, 0, 0, 0, 1] }, sebze: [1, 0, 1, 0, 1, 0], meyve: [0, 1, 0, 1, 0, 0], toz: [0, 0, 0, 0, 0, 0],
      etW: [0.25, 0.1, 0.35, 0, 0.3, 0], choW: [0.3, 0, 0.35, 0.1, 0.25, 0], yagW: [0.3, 0, 0.4, 0, 0.3, 0] },
    { name: "Antrenman odaklı (ara öğünde karbonhidrat + protein tozu)",
      sut: { idx: 2, cells: [0, 0, 0, 0, 0, 1] }, sebze: [1, 0, 1, 0, 1, 0], meyve: [0, 1, 0, 1, 0, 0], toz: [0, 0, 0, 25, 0, 0],
      etW: [0.25, 0, 0.4, 0, 0.35, 0], choW: [0.2, 0.1, 0.3, 0.2, 0.2, 0], yagW: [0.2, 0, 0.4, 0, 0.4, 0] },
    { name: "Akşam ağırlıklı (3 öğün + gece ara)",
      sut: { idx: 2, cells: [1, 0, 0, 0, 0, 1] }, sebze: [1, 0, 1, 0, 2, 0], meyve: [0, 1, 0, 0, 0, 1], toz: [0, 0, 0, 0, 0, 0],
      etW: [0.2, 0, 0.3, 0, 0.5, 0], choW: [0.25, 0, 0.3, 0.05, 0.4, 0], yagW: [0.25, 0, 0.35, 0, 0.4, 0] }
  ];

  function $(id) { return document.getElementById(id); }
  function timeOf(j) { var e = $("q_t" + j), v = e ? String(e.value).trim() : ""; return v || TIMES[j]; }
  function num(id) { var e = $(id); var v = e ? parseFloat(String(e.value).replace(",", ".")) : NaN; return isFinite(v) ? v : 0; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  // ---------------------------------------------------------------- hedefler
  function targets() {
    var kg = num("kg") || 50.6, cm = num("cm"), ya = num("ya"), bf = num("bf");
    var ffm = kg * (1 - bf / 100);
    var mif = 10 * kg + 6.25 * cm - 5 * ya + ($("sx") && $("sx").value === "1" ? -161 : 5);
    var cun = 500 + 22 * ffm;
    var tee = (($("eq") && $("eq").value === "0") ? mif : cun) * num("pal") + num("adj");
    var cho = kg * num("cg"), pro = kg * num("pg");
    if (!isFinite(tee) || tee < 800) tee = 2000;
    if (!(cho > 0)) cho = 250;
    if (!(pro > 0)) pro = kg * 1.6;
    var fat = Math.max(0, (tee - 4 * cho - 4 * pro) / 9);
    return { cho: cho, pro: pro, fat: fat };
  }

  // Toplamı 0.5 adımlarla ağırlıklara göre dağıt (en büyük kalan yöntemi)
  function distribute(total, weights, step) {
    step = step || 0.5;
    var units = Math.round(total / step), sw = weights.reduce(function (a, b) { return a + b; }, 0);
    var out = weights.map(function () { return 0; });
    if (units <= 0 || sw <= 0) return out;
    var raw = weights.map(function (w) { return units * w / sw; });
    var base = raw.map(Math.floor), left = units - base.reduce(function (a, b) { return a + b; }, 0);
    var order = raw.map(function (x, i) { return { i: i, f: x - Math.floor(x), w: weights[i] }; })
      .filter(function (o) { return o.w > 0; }).sort(function (a, b) { return b.f - a.f; });
    for (var k = 0; k < left && order.length; k++) base[order[k % order.length].i] += 1;
    return base.map(function (u) { return u * step; });
  }

  function buildMatrix(pi) {
    var P = PATTERNS[pi % PATTERNS.length], T = targets();
    var M = []; for (var i = 0; i < 9; i++) M.push([0, 0, 0, 0, 0, 0]);
    var sutServ = 0;
    P.sut.cells.forEach(function (c, j) { M[P.sut.idx][j] = c; sutServ += c; });
    P.sebze.forEach(function (c, j) { M[5][j] = c; });
    P.meyve.forEach(function (c, j) { M[6][j] = c; });
    P.toz.forEach(function (c, j) { M[8][j] = c; });
    var sebzeS = P.sebze.reduce(function (a, b) { return a + b; }, 0), meyveS = P.meyve.reduce(function (a, b) { return a + b; }, 0);
    var tozG = P.toz.reduce(function (a, b) { return a + b; }, 0);
    var baseCho = sutServ * 9 + sebzeS * 6 + meyveS * 15 + tozG * 0.05;
    var basePro = sutServ * 6 + sebzeS * 2 + tozG * 0.8;
    var grain = Math.max(0, Math.round(((T.cho - baseCho) / 15) * 2) / 2);
    var et = Math.max(0, Math.round(((T.pro - basePro - grain * 2) / 6) * 2) / 2);
    var fatBase = sutServ * (P.sut.idx === 0 ? 6 : P.sut.idx === 1 ? 3 : 0) + et * 5 + tozG * 0.03;
    var yag = Math.max(0, Math.round(((T.fat - fatBase) / 5) * 2) / 2);
    distribute(et, P.etW).forEach(function (v, j) { M[3][j] = v; });
    distribute(grain, P.choW).forEach(function (v, j) { M[4][j] = v; });
    distribute(yag, P.yagW).forEach(function (v, j) { M[7][j] = v; });
    return M;
  }

  // ---------------------------------------------------------------- tablo oku/yaz
  function readTable() {
    var M = [];
    for (var i = 0; i < 9; i++) { var row = []; for (var j = 0; j < 6; j++) row.push(num("m" + i + "_" + j)); M.push(row); }
    return M;
  }
  function writeTable(M) {
    M.forEach(function (row, i) { row.forEach(function (v, j) { var el = $("m" + i + "_" + j); if (el) el.value = v > 0 ? v : ""; }); });
  }

  // ---------------------------------------------------------------- menü metni
  function q(n) { return n === 0.5 ? "Yarım" : String(r1(n)); }
  function ri(n) { return String(Math.max(1, Math.round(n))); }
  var EXC = [], WARN = [];
  function tl0(x) { return String(x).toLocaleLowerCase("tr"); }
  function exclList() {
    var e = $("q_dislike"); if (!e || !String(e.value).trim()) return [];
    return e.value.split(/[,;\n]+/).map(function (x) { return tl0(x.trim()); }).filter(function (x) { return x.length >= 2; });
  }
  function isExcl(opt) { var o = tl0(opt); return EXC.some(function (k) { return o.indexOf(k) >= 0; }); }
  function pick(list, k) {
    var l = list.filter(function (o) { return !isExcl(o); });
    if (!l.length) return null;
    return l[((k % l.length) + l.length) % l.length];
  }
  // Birleşik satırlardan ("A veya B", "x, y, z") hariç tutulan besinleri ayıkla
  function applyExcl(line) {
    if (!EXC.length || !line) return line;
    if (!isExcl(line)) return line;
    var m = line.match(/^(\(?)(.*?)(\)?)$/), body = line;
    if (/\sveya\s/i.test(line)) {
      var parts = line.split(/\s+veya\s+/i).filter(function (x) { return !isExcl(x); });
      return parts.length ? parts.join(" veya ") : null;
    }
    if (line.indexOf(",") >= 0) {
      var lead = line.match(/^(Bol\s+)?/)[0], items = line.slice(lead.length).split(/\s*,\s*/).filter(function (x) { return !isExcl(x); });
      return items.length ? lead + items.join(", ") : null;
    }
    return null;
  }

  function linesFor(M, j, rot) {
    var t = TYPE[j], r = rot + j, out = [], yagNote = null;
    var n;
    EXC = exclList();
    function put(x) { if (x) out.push(x); }
    function warn(g) { WARN.push(TITLES[j] + " (" + g + ")"); }

    // Et / Peynir / Yumurta
    n = M[3][j];
    if (n > 0) {
      if (t === "k") {
        var eggs = Math.min(2, Math.floor(n)), cheese = n - eggs;
        if (eggs > 0) {
          var eo = pick([eggs + " Yumurtalı Omlet veya Haşlanmış Yumurta", eggs + " Yumurtalı Menemen (az yağlı)", eggs + " Yumurtalı Sebzeli Omlet veya Haşlanmış Yumurta"], r);
          if (eo) out.push(eo); else { cheese += eggs; eggs = 0; }
        }
        if (cheese > 0) {
          var o = pick(["Dilim Az Yağlı Beyaz Peynir", "Yemek Kaşığı Lor Peyniri", "Dilim Süzme Peynir", "Yemek Kaşığı Çökelek"], r + 1);
          if (o) out.push(q(/Yemek/.test(o) ? cheese * 2 : cheese) + " " + o); else warn("et/peynir/yumurta");
        }
      } else if (t === "m") {
        var s = pick(["Izgara Tavuk/Hindi", "Fırın Levrek/Çipura/Somon", "Izgara Az Yağlı Köfte/Biftek", "Fırında Tavuk Göğsü", "Haşlama Dana Eti/Kuşbaşı", "Izgara Alabalık/Ton Balığı"], r);
        if (s) out.push(Math.round(n * 30 / 5) * 5 + " Gram " + s); else warn("et/balık");
      } else {
        var p = pick(["Haşlanmış Yumurta", "Dilim Az Yağlı Beyaz Peynir", "Yemek Kaşığı Lor Peyniri", "Yemek Kaşığı Çökelek"], r);
        if (p) out.push(q(/Yemek/.test(p) ? n * 2 : n) + " " + p); else warn("et/peynir/yumurta");
      }
    }
    // Yağ (zeytin/kuruyemiş ya da zeytinyağı notu)
    n = M[7][j];
    var yagLine = null, yagExtra = null;
    if (n > 0) {
      if (t === "k") {
        var z = Math.min(n, 2), ex = n - z;
        yagLine = ri(z * 5) + " Tane Yeşil Zeytin";
        if (ex > 0) yagExtra = ri(ex * 6) + " Adet Çiğ Badem veya " + ri(ex * 2) + " Adet Ceviz İçi";
      } else if (t === "m") {
        var zy = Math.min(n, 2), exm = n - zy;
        yagNote = "(" + q(zy) + " Tatlı Kaşığı Zeytinyağı eklenecek)";
        if (exm > 0) yagExtra = ri(exm * 6) + " Adet Çiğ Badem veya " + ri(exm * 2) + " Adet Ceviz İçi";
      } else { yagLine = pick([ri(n * 6) + " Adet Çiğ Badem", ri(n * 2) + " Adet Ceviz İçi", q(n) + " Tatlı Kaşığı Şekersiz Fıstık Ezmesi"], r); if (!yagLine) warn("yağ"); }
    }
    if (t === "k" && yagLine) { out.push(yagLine); yagLine = null; }
    if (yagExtra) { out.push(yagExtra); yagExtra = null; }
    // Sebze
    n = M[5][j];
    if (n > 0) {
      if (t === "k") out.push((n >= 2 ? "Bol " : "") + "Domates, Salatalık, Yeşillik");
      else if (t === "m") {
        if (n >= 2) { out.push(ri(10 * (n - 1)) + " Yemek Kaşığı Zeytinyağlı Sebze Yemeği"); out.push("1 Kase Yeşillikli Salata"); }
        else put(pick([ri(10 * n) + " Yemek Kaşığı Zeytinyağlı Sebze Yemeği", q(n) + " Kase Yeşillikli Salata", q(n) + " Kase Mevsim Salata", ri(10 * n) + " Yemek Kaşığı Fırın Sebze (Kabak, Patlıcan, Biber)", q(n) + " Kase Roka-Marul Salata", q(n) + " Kase Çoban Salata"], r));
      } else out.push(q(n) + " Kase Çiğ Sebze (Havuç, Salatalık)");
    }
    // Karbonhidrat
    n = M[4][j];
    if (n > 0) {
      if (t === "k") {
        var b = Math.min(n, 3), yu = n - b;
        put(pick([q(b) + " Dilim Tam Buğday veya Çavdar Ekmeği", q(b) + " Dilim Tam Buğday Tost Ekmeği", q(b) + " Dilim Çavdar Ekmeği"], r));
        if (yu > 0) out.push(ri(yu * 3) + " Yemek Kaşığı Yulaf Ezmesi");
      } else if (t === "m") {
        var g1 = Math.min(n, 3), g2 = n - g1;
        var gp = pick(["Bulgur Pilavı", "Haşlanmış Kinoa/Esmer Pirinç", "Haşlanmış Kuru Baklagil", "Tam Buğday Makarna", "Esmer Pirinç Pilavı", "Haşlanmış Patates"], r);
        if (gp) out.push(ri(g1 * 3) + " Yemek Kaşığı " + gp); else warn("karbonhidrat");
        if (g2 > 0) out.push(q(g2) + " Dilim Tam Buğday Ekmeği");
      } else {
        var s1 = Math.min(n, 2), s2 = n - s1;
        put(pick([q(s1) + " Avuç Beyaz Leblebi", q(s1) + " Dilim Tam Buğday Ekmeği", ri(s1 * 3) + " Yemek Kaşığı Yulaf Ezmesi", q(s1) + " Dilim Çavdar Ekmeği", ri(s1 * 3) + " Yemek Kaşığı Granola (şekersiz)"], r));
        if (s2 > 0) out.push(q(s2) + " Dilim Tam Buğday Ekmeği");
      }
    }
    // Süt grubu (3 satır)
    [0, 1, 2].forEach(function (si) {
      var c = M[si][j]; if (c <= 0) return;
      var lbl = si === 0 ? "Tam Yağlı " : si === 1 ? "Az Yağlı " : "Yağsız ";
      var o = pick([q(c) + " Su Bardağı " + lbl + "Süt", q(c) + " Kase " + (si === 0 ? "Tam Yağlı " : si === 1 ? "Az Yağlı " : "Yağsız ") + "Yoğurt", q(c) + " Şişe " + (si === 0 ? "Tam Yağlı " : si === 2 ? "Yağsız " : "") + "Sade Kefir veya Ayran"], r + si);
      if (o) out.push(o.replace("  ", " ")); else warn("süt grubu");
    });
    // Meyve
    n = M[6][j];
    if (n > 0) put(pick([q(n) + " Orta Boy Elma", ri(n * 2) + " Mandalina veya " + q(n) + " Kivi", q(n) + " Orta Boy Portakal", q(n * 0.5) + " Orta Boy Muz", q(n) + " Orta Boy Armut", q(n) + " Kase Çilek"], r));
    // Protein tozu
    n = M[8][j];
    if (n > 0) out.push(r1(n) + " Gram Protein Tozu (Su veya Laktozsuz Süt ile)");
    if (yagLine) out.push(yagLine);
    if (yagNote) out.push(yagNote);
    return out.map(applyExcl).filter(Boolean);
  }

  function rotNum(j, rot) {
    if (Array.isArray(rot)) return rot[j] || 0;
    return (rot || 0) + (state.rots[j] || 0);
  }
  function blockFor(M, j, rot) {
    var l = linesFor(M, j, rotNum(j, rot));
    return l.length ? TITLES[j] + ": " + timeOf(j) + "\n" + l.join("\n") : "";
  }
  function buildMenuText(M, rot) {
    var blocks = []; WARN = [];
    for (var j = 0; j < 6; j++) {
      var ls_ = linesFor(M, j, rotNum(j, rot));
      if (!ls_.length) continue;
      blocks.push(TITLES[j] + ": " + timeOf(j) + "\n" + ls_.join("\n"));
    }
    return blocks.join("\n\n");
  }

  // ---------------------------------------------------------------- durum + eşitleme
  var state = { variant: parseInt(ls(LS_VAR) || "-1", 10), last: "", rots: [0, 0, 0, 0, 0, 0] };
  function getLast() { var e = $("menu_auto_last"); return e ? e.value : (state.last || ""); }
  function setLast(v) { var e = $("menu_auto_last"); if (e) e.value = v; state.last = v; }
  try { var rr = JSON.parse(ls("sp_menu_rots") || "null"); if (Array.isArray(rr) && rr.length === 6) state.rots = rr.map(function (x) { return parseInt(x, 10) || 0; }); } catch (e) {}
  if (!isFinite(state.variant)) state.variant = -1;

  function msg(t, cls) {
    var el = $("menu_sync_msg"); if (!el) return;
    el.textContent = t || ""; el.className = "text-[11px] font-semibold min-h-[16px] " + (cls || "text-emerald-700");
  }
  function persistApp() { try { if (typeof window.calc === "function") window.calc(); if (typeof window.sm === "function") window.sm(); if (typeof window.save === "function") window.save(); } catch (e) {} }

  function sync(source, force) {
    var ta = $("written_menu"); if (!ta) return;
    var M = readTable();
    var text = buildMenuText(M, Math.max(0, state.variant));
    var cur = ta.value.trim(), last = getLast().trim();
    var untouched = cur === "" || cur === last;
    if (force || untouched) {
      if (force && !untouched && !window.confirm("Elle yazdığınız / düzenlediğiniz menü silinip tablodaki değişimlere göre yeniden yazılacak. Devam edilsin mi?")) return;
      ta.value = text; setLast(text);
      var wn = WARN.length ? " ⚠️ Çıkarılan besinler nedeniyle şu satırlar yazılamadı, elle ekleyin: " + WARN.join(", ") + "." : "";
      msg(text ? "✔ Menü, değişim tablosuna göre güncellendi." + wn : "", wn ? "text-amber-700" : "text-emerald-700");
      try { if (typeof window.save === "function") window.save(); } catch (e) {}
    } else {
      msg("⚠️ Menü elle düzenlendiği için otomatik güncellenmedi. Tabloya göre yenilemek için \"Tablodan yeniden yaz\" butonuna basın.", "text-amber-700");
    }
  }

  function label() {
    var el = $("sample_variant_label"); if (!el) return;
    if (state.variant < 0) { el.textContent = ""; return; }
    var i = state.variant % PATTERNS.length;
    el.textContent = "Örnek " + (i + 1) + "/" + PATTERNS.length + " · " + PATTERNS[i].name + " — tekrar basınca bir sonraki örnek gelir.";
  }

  function nextExample() {
    state.variant += 1; ls(LS_VAR, String(state.variant));
    writeTable(buildMatrix(state.variant));
    label();
    persistApp();
    // Yeni örnek istendi: menü elle düzenlenmişse sormadan değil, onay ile yenilenir
    var ta = $("written_menu"), cur = ta ? ta.value.trim() : "", last = getLast().trim();
    sync("example", cur !== "" && cur !== last);
  }


  // ---------------------------------------------------------------- MENÜ -> TABLO (ters yön)
  function tl(x) { return String(x).toLocaleLowerCase("tr"); }
  function isL(c) { return /[a-zçğıöşü]/.test(c || ""); }
  function hasWord(t, w) {
    var i = -1;
    while ((i = t.indexOf(w, i + 1)) >= 0) { if (!isL(t[i - 1]) && !isL(t[i + w.length])) return true; }
    return false;
  }
  function has(t, list) { return list.some(function (w) { return t.indexOf(w) >= 0; }); }
  var FREE = ["su", "çay", "kahve", "papatya", "bitki çayı", "maden suyu", "soda", "tuz", "baharat", "limon", "tarçın", "zencefil", "nane", "diyet"];

  function qty(seg) {
    var t = seg.trim(), m;
    if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*/))) {
      return { n: (parseFloat(m[1].replace(",", ".")) + parseFloat(m[2].replace(",", "."))) / 2, rest: t.slice(m[0].length), has: true };
    }
    if ((m = t.match(/^(\d+)\s*\/\s*(\d+)\s*/))) return { n: parseInt(m[1], 10) / parseInt(m[2], 10), rest: t.slice(m[0].length), has: true };
    if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*/))) return { n: parseFloat(m[1].replace(",", ".")), rest: t.slice(m[0].length), has: true };
    if ((m = t.match(/^yarım\s*/i))) return { n: 0.5, rest: t.slice(m[0].length), has: true };
    if ((m = t.match(/^(bir|tek)\s+/i))) return { n: 1, rest: t.slice(m[0].length), has: true };
    return { n: 1, rest: t, has: false };
  }
  function unitOf(rest) {
    var r = tl(rest);
    if (/^(g|gr|gram)(?![a-zçğıöşü])/.test(r)) return "g";
    if (/^(ml|mL|litre|lt|l)(?![a-zçğıöşü])/.test(r)) return "ml";
    if (/^yemek\s*kaşığı/.test(r)) return "yk";
    if (/^tatlı\s*kaşığı/.test(r)) return "tk";
    if (/^çay\s*kaşığı/.test(r)) return "ck";
    if (/^su\s*bardağı/.test(r)) return "bardak";
    if (/^(kase|kâse)/.test(r)) return "kase";
    if (/^(dilim)/.test(r)) return "dilim";
    if (/^(avuç)/.test(r)) return "avuc";
    if (/^(şişe)/.test(r)) return "sise";
    if (/^(porsiyon)/.test(r)) return "por";
    if (/^(ölçek)/.test(r)) return "olcek";
    if (/^(adet|tane)/.test(r)) return "adet";
    return "";
  }

  // Bir satır parçasını [{g: grup, v: değişim}] listesine çevirir; tanınmazsa null
  function lineToExchanges(segRaw) {
    var seg = segRaw.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (!seg) return [];
    var q0 = qty(seg), n = q0.n, rest = q0.rest, t = tl(seg), u = unitOf(rest);
    var out = [];
    function add(g, v) { if (v > 0) out.push({ g: g, v: v }); }

    if (has(t, ["protein toz", "whey", "kazein", "izolat", "protein ölçek"])) {
      add(8, u === "g" ? n : u === "olcek" ? n * 30 : n * 30); return out;
    }
    if (has(t, ["yoğurt", "kefir", "ayran", "cacık"]) || hasWord(t, "süt") || has(t, ["süt "])) {
      if (!has(t, ["peynir", "tavuk", "süt tozu", "sütlaç"])) {
        var idx = has(t, ["yağsız", "light"]) ? 2 : has(t, ["tam yağlı"]) ? 0 : 1;
        var v = u === "g" ? n / 200 : u === "ml" ? n / 200 : (u === "yk" ? n / 12 : n);
        add(idx, v); return out;
      }
    }
    if (has(t, ["yumurta", "omlet", "menemen"]) && !has(t, ["yumurta akı"])) { add(3, u === "dilim" || u === "" || u === "adet" || !q0.has ? n : n); return out; }
    if (has(t, ["peynir", "lor", "çökelek", "labne"])) {
      add(3, u === "yk" ? n * 0.5 : u === "g" ? n / 30 : n); return out;
    }
    if (has(t, ["zeytinyağlı", "sebze", "salata", "domates", "salatalık", "yeşillik", "havuç", "marul", "roka", "brokoli", "kabak", "ıspanak", "patlıcan", "biber", "maydanoz", "kereviz", "karnabahar", "semizotu", "lahana", "turp", "söğüş"])) {
      add(5, u === "yk" ? n / 10 : u === "g" ? n / 200 : q0.has ? n : 1); return out;
    }
    if (has(t, ["tavuk", "hindi", "biftek", "köfte", "balık", "levrek", "çipura", "somon", "hamsi", "dana", "kuzu", "kıyma", "karides"]) || hasWord(t, "et") || hasWord(t, "ton")) {
      add(3, u === "g" ? n / 30 : u === "por" ? n * 4 : u === "dilim" ? n * 0.5 : n); return out;
    }
    if (has(t, ["kuru baklagil", "mercimek", "nohut", "fasulye", "barbunya", "bakla"])) {
      add(4, u === "yk" ? n / 3 : u === "bardak" ? n * 4 : u === "kase" ? n * 4 : u === "g" ? n / 45 : n); return out;
    }
    if (has(t, ["ekmek", "buğday", "çavdar", "bulgur", "pilav", "pirinç", "makarna", "yulaf", "kinoa", "leblebi", "simit", "patates", "mısır", "galeta", "granola", "müsli", "tahıl", "lavaş", "tortilla", "bisküvi", "kraker", "erişte", "cornflakes", "gevrek", "kuskus", "grissini"])) {
      add(4, u === "yk" ? n / 3 : u === "bardak" ? n * 3 : u === "kase" ? n * 3 : u === "g" ? n / 30 : n); return out;
    }
    if (has(t, ["elma", "armut", "portakal", "mandalina", "kivi", "muz", "üzüm", "çilek", "kiraz", "şeftali", "karpuz", "kavun", "incir", "hurma", "meyve", "nar", "ayva", "erik", "böğürtlen", "ananas", "greyfurt", "yaban", "dut", "kayısı", "vişne"])) {
      var f = 1;
      if (has(t, ["mandalina"])) f = 0.5; else if (has(t, ["muz"])) f = 2; else if (has(t, ["hurma"])) f = 1 / 3; else if (has(t, ["kayısı", "erik", "incir"])) f = 1 / 2;
      add(6, (u === "g" ? n / 100 : n) * f); return out;
    }
    if (has(t, ["zeytinyağ", "tereyağ", "zeytin", "badem", "ceviz", "fındık", "fıstık", "kaju", "susam", "tahin", "avokado", "ay çekirdeği", "kabak çekirdeği"]) || hasWord(t, "yağ")) {
      var v2;
      if (has(t, ["zeytinyağ", "tereyağ"]) || hasWord(t, "yağ")) v2 = u === "tk" ? n : u === "yk" ? n * 2 : u === "ck" ? n / 2 : n;
      else if (has(t, ["zeytin"]) && !has(t, ["zeytinyağ"])) v2 = n / 5;
      else if (has(t, ["badem", "fındık", "kaju", "yer fıstığı"])) v2 = u === "g" ? n / 10 : n / 6;
      else if (has(t, ["ceviz"])) v2 = u === "g" ? n / 8 : n / 2;
      else if (has(t, ["tahin", "ezmesi"])) v2 = u === "tk" ? n : u === "yk" ? n * 2 : n;
      else if (has(t, ["avokado"])) v2 = n * 4 * (n < 1 ? 1 : 1);
      else v2 = u === "g" ? n / 10 : n;
      add(7, v2); return out;
    }
    if (has(t, FREE) || FREE.some(function (w) { return hasWord(t, w); })) return [];
    return null;
  }

  function slotOf(head, order) {
    var h = tl(head), time = h.match(/(\d{1,2})\s*[.:]\s*(\d{2})/);
    if (has(h, ["uyanınca", "uyaninca", "sabah aç"])) return -1;
    if (has(h, ["kahvaltı", "kahvalti"])) return 0;
    if (has(h, ["öğle yemeği", "öğle", "ogle"])) return 2;
    if (has(h, ["akşam yemeği", "akşam"])) return 4;
    if (time) {
      var hr = parseInt(time[1], 10) + parseInt(time[2], 10) / 60;
      if (hr < 12.5) return 1; if (hr < 18) return 3; return 5;
    }
    var seq = [1, 3, 5][order.count % 3]; order.count++; return seq;
  }

  function menuToMatrix(text) {
    var M = []; for (var i = 0; i < 9; i++) M.push([0, 0, 0, 0, 0, 0]);
    var DP = window.DietPDF; if (!DP || !DP.parseMenu) return null;
    var els = DP.parseMenu(text), slot = -2, skip = false, order = { count: 0 };
    var recognized = 0, unknown = [], anyMeal = false;
    els.forEach(function (e) {
      if (e.k === "heading") { slot = slotOf(e.t, order); skip = false; anyMeal = anyMeal || slot >= 0; return; }
      if (e.k === "alt") { skip = true; return; }
      if (slot < 0 || skip) return;
      var line = e.k === "note" ? e.t.replace(/^\(\s*|\s*\)$/g, "").replace(/\s+(eklenecek|ilave edilecek|kullanılacak)\s*$/i, "") : e.t;
      line.split(/\s+\+\s+/).forEach(function (part) {
        var first = part.split(/\s+veya\s+|\s+\/\s+/i)[0];
        var ex = lineToExchanges(first);
        if (ex === null && first !== part) ex = lineToExchanges(part);
        if (ex === null) { unknown.push(part.trim()); return; }
        if (e.k === "note" && !ex.length) return;
        ex.forEach(function (x) { M[x.g][slot] += x.v; recognized++; });
      });
    });
    for (var g = 0; g < 9; g++) for (var j = 0; j < 6; j++) {
      M[g][j] = g === 8 ? Math.round(M[g][j]) : Math.round(M[g][j] * 2) / 2;
    }
    return { M: M, recognized: recognized, unknown: unknown, anyMeal: anyMeal };
  }

  var menuTimer = null;
  function menuToTable() {
    var ta = $("written_menu"); if (!ta) return;
    if (ta.value.trim() === "") return;
    var r = menuToMatrix(ta.value);
    if (!r || !r.anyMeal || r.recognized === 0) {
      msg("ℹ️ Menüdeki satırlardan değişim karşılığı çıkarılamadı; tablo değiştirilmedi. (Başlık satırı ve \"2 Dilim Ekmek\" gibi miktarlı satırlar kullanın.)", "text-slate-500");
      return;
    }
    writeTable(r.M);
    persistApp();
    var u = r.unknown.length ? " · Tanınmayan " + r.unknown.length + " satır tabloya yansımadı: " + r.unknown.slice(0, 3).join(" | ") + (r.unknown.length > 3 ? " …" : "") : "";
    msg("✔ Menüdeki değişiklikler değişim tablosuna işlendi." + u, r.unknown.length ? "text-amber-700" : "text-emerald-700");
  }


  // ---------------------------------------------------------------- MENÜ ÖNERİLERİ (bastıkça değişir)
  var MEAL_NAMES = ["Kahvaltı", "Ara 1", "Öğle", "Ara 2", "Akşam", "Ara 3"];
  function shMsg(t, cls) { var el = $("shuffle_msg"); if (el) { el.textContent = t || ""; el.className = "text-[11px] font-semibold min-h-[16px] " + (cls || "text-indigo-600"); } }
  function saveRots() { ls("sp_menu_rots", JSON.stringify(state.rots)); }
  function menuIsAuto() { var ta = $("written_menu"), cur = ta ? ta.value.trim() : "", last = getLast().trim(); return cur === "" || cur === last; }
  function headingLike(l) { return /(\d{1,2}\s*[.:]\s*\d{2})|:\s*$|kahvaltı|öğle|akşam|ara öğün/i.test(l || ""); }

  function replaceMealBlock(text, j, newBlock) {
    var blocks = text.split(/\n\s*\n/), order = { count: 0 }, slots = blocks.map(function (b) {
      var first = b.trim().split("\n")[0];
      return headingLike(first) && !/^\s*(ya da|yada|veya)\s*$/i.test(first) ? slotOf(first, order) : -3;
    });
    var idx = slots.indexOf(j);
    if (idx >= 0) blocks[idx] = newBlock;
    else {
      var at = blocks.length;
      for (var i = 0; i < slots.length; i++) if (slots[i] > j) { at = i; break; }
      blocks.splice(at, 0, newBlock);
    }
    return blocks.join("\n\n");
  }

  function shuffleMeal(j) {
    var ta = $("written_menu"); if (!ta) return;
    var M = readTable();
    var nb = blockFor(M, j, Math.max(0, state.variant));
    if (!nb) { shMsg("ℹ️ " + MEAL_NAMES[j] + " için tabloda değişim yok; önce tabloya değişim girin veya örnek dağıtım seçin.", "text-slate-500"); return; }
    state.rots[j] = (state.rots[j] || 0) + 1; saveRots();
    nb = blockFor(M, j, Math.max(0, state.variant));
    if (menuIsAuto()) sync("shuffle", false);
    else { ta.value = replaceMealBlock(ta.value, j, nb); try { if (typeof window.save === "function") window.save(); } catch (e) {} }
    shMsg("✔ " + MEAL_NAMES[j] + " için yeni öneri geldi — tekrar basarsanız bir sonraki öneri gelir.");
  }

  function shuffleAll() {
    var ta = $("written_menu"); if (!ta) return;
    var M = readTable();
    if (!buildMenuText(M, Math.max(0, state.variant))) { shMsg("ℹ️ Tabloda değişim yok; önce örnek dağıtım seçin veya değişim girin.", "text-slate-500"); return; }
    if (!menuIsAuto() && !window.confirm("Elle düzenlediğiniz menü silinip tüm öğünler için yeni öneri yazılacak. Devam edilsin mi?")) return;
    state.rots = state.rots.map(function (x) { return (x || 0) + 1; }); saveRots();
    sync("shuffle", true);
    shMsg("✔ Tüm menü için yeni öneri geldi — tekrar basarsanız bir sonraki öneri gelir.");
  }


  // ---------------------------------------------------------------- GERİ BİLDİRİMDEN YENİ DİYET
  function removeMealsFromTable(M, rem, log) {
    rem.forEach(function (j) {
      var moved = false;
      for (var g = 0; g < 9; g++) {
        var v = M[g][j]; if (!(v > 0)) continue;
        M[g][j] = 0;
        var targets = [0, 1, 2, 3, 4, 5].filter(function (k) { return rem.indexOf(k) < 0 && M[g][k] > 0; });
        if (!targets.length) targets = [0, 2, 4].filter(function (k) { return rem.indexOf(k) < 0; });
        if (!targets.length) targets = [0, 1, 2, 3, 4, 5].filter(function (k) { return rem.indexOf(k) < 0; });
        var w = [0, 0, 0, 0, 0, 0]; targets.forEach(function (k) { w[k] = Math.max(M[g][k], 1); });
        var d = distribute(v, w, g === 8 ? 5 : 0.5);
        d.forEach(function (x, k) { M[g][k] += x; });
        moved = true;
      }
      if (moved) log.push("• " + MEAL_NAMES[j] + " öğünü kaldırıldı, değişimleri diğer öğünlere dağıtıldı.");
      else log.push("• " + MEAL_NAMES[j] + " öğününde zaten değişim yoktu.");
    });
  }
  function firstFilled(M, g, order) { for (var i = 0; i < order.length; i++) if (M[g][order[i]] >= 1) return order[i]; return -1; }

  /** opts: {remove:[slot], change:[slot], hunger:"ac"|"tok"|""} -> günlük satırları */
  function applyFeedback(opts) {
    opts = opts || {}; var log = [], M = readTable(), rem = (opts.remove || []).map(Number);
    var any = M.some(function (r) { return r.some(function (v) { return v > 0; }); });
    if (!any) { log.push("ℹ️ Değişim tablosu boş; önce \"Örnek Değişim Dağıtımı\" ile bir dağıtım oluşturun ya da önceki görüşmeyi yükleyin."); }
    else {
      if (rem.length) removeMealsFromTable(M, rem, log);
      var mains = [2, 4].filter(function (k) { return rem.indexOf(k) < 0; });
      var snacks = [3, 1, 5].filter(function (k) { return rem.indexOf(k) < 0; });
      if (opts.hunger === "ac") {
        mains.forEach(function (k) { M[5][k] += 1; });
        if (mains.length) log.push("• Aç kalıyor: öğle/akşam öğünlerine 1'er sebze değişimi eklendi.");
        if (snacks.length) { M[1][snacks[0]] += 1; log.push("• Aç kalıyor: " + MEAL_NAMES[snacks[0]] + " öğününe 1 süt/yoğurt değişimi eklendi."); }
      } else if (opts.hunger === "tok") {
        var k1 = firstFilled(M, 4, snacks.concat([0, 2, 4].filter(function (k) { return rem.indexOf(k) < 0; })));
        if (k1 >= 0) { M[4][k1] -= 1; log.push("• Çok doygun: " + MEAL_NAMES[k1] + " öğününden 1 karbonhidrat değişimi azaltıldı."); }
        else log.push("• Çok doygun: azaltılabilecek bir karbonhidrat değişimi bulunamadı; tabloyu elle düzenleyin.");
      }
      writeTable(M);
    }
    (opts.change || []).map(Number).forEach(function (j) {
      if (rem.indexOf(j) >= 0) return;
      state.rots[j] = (state.rots[j] || 0) + 1; log.push("• " + MEAL_NAMES[j] + " öğünündeki besinler değiştirildi.");
    });
    saveRots();
    var ex = exclList(); if (ex.length) log.push("• Menüden çıkarılan besinler: " + ex.join(", ") + ".");
    persistApp();
    if (any) {
      var ta = $("written_menu"), manual = ta && ta.value.trim() !== "" && !menuIsAuto();
      if (!manual || window.confirm("Elle düzenlediğiniz menü, geri bildirimlere göre yeniden yazılacak. Devam edilsin mi?")) {
        sync("feedback", true); log.push("• Menü, değişim tablosuna göre yeniden yazıldı" + (WARN.length ? " (uyarı: " + WARN.join(", ") + " için satır yazılamadı)" : "") + ".");
      } else log.push("• Menü elle düzenlendiği için yazılmadı; \"Tablodan yeniden yaz\" ile yenileyebilirsiniz.");
    }
    return log;
  }

  function bind() {
    var tb = $("exchange-tbody");
    if (tb && !tb.dataset.menuSync) {
      tb.dataset.menuSync = "1";
      tb.addEventListener("input", function () { sync("table", false); });
    }
    var ta = $("written_menu");
    if (ta && !ta.dataset.toTable) {
      ta.dataset.toTable = "1";
      ta.addEventListener("input", function () { clearTimeout(menuTimer); menuTimer = setTimeout(menuToTable, 700); });
    }
    var sa = $("btn_shuffle_all");
    if (sa && !sa.dataset.bound) { sa.dataset.bound = "1"; sa.addEventListener("click", shuffleAll); }
    document.querySelectorAll("#shuffle_meals .shuf").forEach(function (b) {
      if (!b.dataset.bound) { b.dataset.bound = "1"; b.addEventListener("click", function () { shuffleMeal(parseInt(b.getAttribute("data-meal"), 10)); }); }
    });
    var rw = $("btn_menu_rewrite");
    if (rw && !rw.dataset.bound) { rw.dataset.bound = "1"; rw.addEventListener("click", function () { sync("button", true); }); }
    label();
  }

  window.ExchangeMenu = { applyFeedback: applyFeedback, menuIsAuto: menuIsAuto, shuffleMeal: shuffleMeal, shuffleAll: shuffleAll, menuToMatrix: menuToMatrix, menuToTable: menuToTable, nextExample: nextExample, sync: sync, buildMatrix: buildMatrix, buildMenuText: buildMenuText, readTable: readTable, writeTable: writeTable, PATTERNS: PATTERNS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
