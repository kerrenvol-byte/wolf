"use strict";
/* ITEMS = [[name, unit, {chainKey:price}]] injected above; UPDATED = date string */

const CHAINS = {
  sh:{name:"שופרסל", url:"https://www.shufersal.co.il/online/"},
  rl:{name:"רמי לוי", url:"https://www.rami-levy.co.il/"},
  tt:{name:"טיב טעם", url:"https://www.tivtaam.co.il/"},
  yo:{name:"יוחננוף", url:"https://yochananof.co.il/"},
  oa:{name:"אושר עד", url:"https://osherad.co.il/"},
  sp:{name:"סופר-פארם", url:"https://shop.super-pharm.co.il/"},
};
const CHAIN_KEYS = Object.keys(CHAINS);

document.getElementById("updDate").textContent = ITEMS.length.toLocaleString("he-IL") + " מוצרים · עודכן " + UPDATED.split("-").reverse().join(".");

/* ---------- state ---------- */
const LS = "wolfcart_v2";
let state = { list: [], history: [], diet: null };
let storageOK = true;
try {
  localStorage.setItem("__wolf_test", "1"); localStorage.removeItem("__wolf_test");
  const s = JSON.parse(localStorage.getItem(LS));
  if (s && Array.isArray(s.list)) state = Object.assign(state, s);
} catch (e) { storageOK = false; }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { storageOK = false; } };
if (!storageOK) {
  const w = document.createElement("div");
  w.style.cssText = "background:var(--peach-soft);color:var(--peach);padding:9px 16px;font-size:12px;line-height:1.5;border-bottom:1px solid var(--line)";
  w.textContent = "שימו לב: הדפדפן חוסם שמירה בדף הזה, ולכן הרשימה תישמר רק כל עוד הדף פתוח. לשמירה קבועה שלחו את הרשימה לוואטסאפ לפני סגירה.";
  document.querySelector(".bar").after(w);
}

/* ---------- utils ---------- */
const S = x => String(x).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const fmt = n => "₪" + n.toFixed(2).replace(/\.00$/, "");
const norm = t => String(t).replace(/["'׳״`]/g, "").replace(/\s+/g, " ").trim();
function minPrice(p) { let k = null; for (const c in p) if (k === null || p[c] < p[k]) k = c; return { k, v: p[k] }; }

/* ---------- search index ---------- */
const NORMS = ITEMS.map(it => norm(it[0]));
function search(q, limit) {
  q = norm(q); if (q.length < 2) return [];
  const toks = q.split(" ").filter(t => t.length >= 1);
  const scan = requireAll => {
    const res = [];
    for (let i = 0; i < ITEMS.length; i++) {
      const n = NORMS[i];
      let hit = 0, score = 0;
      for (const t of toks) {
        const pos = n.indexOf(t);
        if (pos === -1) { if (requireAll) { hit = 0; break; } continue; }
        hit++;
        score += pos === 0 ? 30 : (n[pos - 1] === " " ? 18 : 6);
      }
      if (!hit) continue;
      score += hit * 40; // more matched words first
      score -= n.length * 0.08;
      score += Object.keys(ITEMS[i][2]).length * 2.5; // prefer items sold in more chains
      res.push([score, i]);
    }
    res.sort((a, b) => b[0] - a[0]);
    return res;
  };
  // strict first (all words); if nothing, forgive missing words
  let res = scan(true);
  if (!res.length && toks.length > 1) res = scan(false);
  return res.slice(0, limit || 8).map(r => r[1]);
}

/* ---------- toast / sheet ---------- */
let toastT;
function toast(msg) {
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400);
}
const overlay = document.getElementById("overlay"), sheet = document.getElementById("sheet");
overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("show"); });
function showSheet(html) { sheet.innerHTML = html; overlay.classList.add("show"); }

/* ---------- add items ---------- */
function addItem(idx, qty) {
  const ex = state.list.find(i => i.idx === idx);
  if (ex) ex.qty += (qty || 1); else state.list.push({ idx, qty: qty || 1, n: ITEMS[idx][0] });
  save(); renderAll();
}
function addFreeText(text) {
  const parts = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  let added = 0, missed = [];
  for (const part of parts) {
    let qty = 1, t = part;
    const m = part.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (m) { qty = Math.min(50, parseFloat(m[1])) || 1; t = m[2]; }
    const hits = search(t, 1);
    if (hits.length) { addItem(hits[0], qty); added++; }
    else { state.list.push({ note: part, qty: 1 }); missed.push(part); }
  }
  save(); renderAll();
  if (parts.length > 1) toast(missed.length ? added + " נוספו · " + missed.length + " לא נמצאו" : "נוספו " + added + " מוצרים");
}

/* ---------- search UI ---------- */
const qEl = document.getElementById("q"), suggEl = document.getElementById("sugg");
let debT;
qEl.addEventListener("input", () => { clearTimeout(debT); debT = setTimeout(renderSugg, 110); });
qEl.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const v = qEl.value.trim();
    if (!v) return;
    if (v.includes(",") || v.includes("\n")) { addFreeText(v); }
    else { const hits = search(v, 1); if (hits.length) { addItem(hits[0], 1); toast("נוסף: " + ITEMS[hits[0]][0]); } else { state.list.push({ note: v, qty: 1 }); save(); renderAll(); toast("נשמר כהערה — לא נמצא במאגר"); } }
    qEl.value = ""; suggEl.classList.add("hidden");
  }
  if (e.key === "Escape") { suggEl.classList.add("hidden"); }
});
document.addEventListener("click", e => { if (!e.target.closest(".searchwrap")) suggEl.classList.add("hidden"); });
function renderSugg() {
  const v = qEl.value.trim();
  if (v.length < 2 || v.includes(",")) { suggEl.classList.add("hidden"); return; }
  const hits = search(v, 8);
  if (!hits.length) {
    suggEl.innerHTML = '<button disabled style="color:var(--ink2)"><span class="sn">לא נמצא "' + S(v) + '" — נסו מילה אחת קצרה, למשל שם המוצר בלי המותג</span></button>';
    suggEl.classList.remove("hidden");
    return;
  }
  suggEl.innerHTML = hits.map(i => {
    const it = ITEMS[i], mp = minPrice(it[2]);
    return `<button data-i="${i}"><span class="sn">${S(it[0])}</span><span class="su">${S(it[1] || "")}</span><span class="spr num">מ־${fmt(mp.v)}</span></button>`;
  }).join("");
  suggEl.classList.remove("hidden");
  suggEl.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
    addItem(+b.dataset.i, 1); qEl.value = ""; suggEl.classList.add("hidden"); qEl.focus();
  }));
}

/* ---------- list ---------- */
function renderList() {
  const wrap = document.getElementById("listItems");
  document.getElementById("emptyList").classList.toggle("hidden", state.list.length > 0);
  wrap.innerHTML = state.list.map((it, i) => {
    if (it.note !== undefined) {
      return `<div class="row note"><div class="ri"><div class="rn">${S(it.note)}</div><div class="rm">הערה חופשית — לא נמצא במאגר</div></div><button class="rx" data-del="${i}" aria-label="הסרה">✕</button></div>`;
    }
    const item = ITEMS[it.idx], mp = minPrice(item[2]);
    return `<div class="row">
      <div class="ri"><div class="rn">${S(item[0])}</div>
      <div class="rm num">${item[1] ? S(item[1]) + " · " : ""}<b>${fmt(mp.v)}</b> ב${S(CHAINS[mp.k].name)}</div></div>
      <div class="step"><button data-q="${i}:1" aria-label="הוספה">+</button><span class="num">${it.qty}</span><button data-q="${i}:-1" aria-label="הפחתה">−</button></div>
      <div class="rp"><div class="v num">${fmt(mp.v * it.qty)}</div></div>
      <button class="rx" data-del="${i}" aria-label="הסרה">✕</button>
    </div>`;
  }).join("");
  wrap.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { state.list.splice(+b.dataset.del, 1); save(); renderAll(); }));
  wrap.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
    const [i, d] = b.dataset.q.split(":").map(Number);
    state.list[i].qty = Math.max(1, state.list[i].qty + d); save(); renderAll();
  }));
  const badge = document.getElementById("countBadge");
  badge.classList.toggle("hidden", !state.list.length); badge.textContent = state.list.length;
}

/* ---------- compare ---------- */
function totals() {
  const real = state.list.filter(i => i.idx !== undefined);
  return CHAIN_KEYS.map(k => {
    let sum = 0, have = 0;
    for (const it of real) {
      const p = ITEMS[it.idx][2][k];
      if (p !== undefined) { sum += p * it.qty; have++; }
    }
    return { k, sum, have, total: real.length };
  }).filter(t => t.have > 0)
    .sort((a, b) => b.have - a.have || a.sum - b.sum)
    .sort((a, b) => {
      // full-coverage (or max coverage) first, then price
      const maxHave = Math.max(a.have, b.have);
      if (a.have !== b.have) return b.have - a.have;
      return a.sum - b.sum;
    });
}
function renderCompare() {
  const wrap = document.getElementById("vendors");
  const real = state.list.filter(i => i.idx !== undefined);
  if (!real.length) {
    wrap.innerHTML = `<div class="empty">הוסיפו מוצרים לרשימה כדי לראות איזו רשת הכי זולה עבורכם.</div>`;
    document.getElementById("srcNote").textContent = ""; updateTotal(); return;
  }
  const ts = totals();
  const bestSum = ts[0].sum;
  wrap.innerHTML = ts.map((t, idx) => {
    const cov = Math.round(100 * t.have / t.total);
    return `<button class="vrow ${idx === 0 ? "best" : ""}" data-v="${t.k}">
      <span class="vrank num">${idx + 1}</span>
      <span class="vi"><span class="vn">${S(CHAINS[t.k].name)}${idx === 0 ? '<span class="tag">הזול ביותר</span>' : ""}</span>
      <span class="vm num">${t.have}/${t.total} מוצרים${cov < 100 ? " · חסרים " + (t.total - t.have) : ""}</span>
      <span class="covbar"><i style="width:${cov}%"></i></span></span>
      <span class="vt"><span class="v num">${fmt(t.sum)}</span>${idx > 0 && t.have === ts[0].have ? `<span class="d num">+${fmt(t.sum - bestSum)}</span>` : `<span class="d">לפרטים ←</span>`}</span>
    </button>`;
  }).join("");
  wrap.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => chainSheet(b.dataset.v)));
  document.getElementById("srcNote").textContent =
    "המחירים מקבצי שקיפות המחירים הרשמיים של הרשתות (עודכן " + UPDATED.split("-").reverse().join(".") + ", סניף מדגמי לכל רשת). מחירי מבצע ומועדון עשויים להוזיל עוד.";
  updateTotal();
}
function chainSheet(k) {
  const real = state.list.filter(i => i.idx !== undefined);
  const rows = [], missing = [];
  let sum = 0;
  for (const it of real) {
    const item = ITEMS[it.idx], p = item[2][k];
    if (p === undefined) { missing.push(item[0]); continue; }
    sum += p * it.qty;
    rows.push(`<div class="sheetrow"><span>${S(item[0])}${it.qty > 1 ? ` <span class="mi num">×${it.qty}</span>` : ""}</span><span class="num">${fmt(p * it.qty)}</span></div>`);
  }
  showSheet(`<h3>${S(CHAINS[k].name)} — ${fmt(sum)}</h3>
    <p class="sub">פירוט הסל שלך לפי מחירי ${S(CHAINS[k].name)}</p>
    ${rows.join("")}
    ${missing.length ? `<div class="sheetrow"><span class="mi">לא נמצאו ברשת זו: ${S(missing.join(", "))}</span></div>` : ""}
    <div class="sheetbtns">
      <button class="btn" id="shGo">העתקה ומעבר לאתר</button>
      <button class="btn ghost" id="shWA">שיתוף בוואטסאפ</button>
    </div>`);
  const txt = "הסל שלי (Wolf סל חכם):\n" + real.map(it => ITEMS[it.idx][0] + (it.qty > 1 ? " ×" + it.qty : "")).join("\n") +
    "\nסה\"כ ב" + CHAINS[k].name + ": " + fmt(sum);
  document.getElementById("shGo").addEventListener("click", () => {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.resolve()).finally(() => {
      window.open(CHAINS[k].url, "_blank", "noopener"); toast("הרשימה הועתקה");
    });
  });
  document.getElementById("shWA").addEventListener("click", () => {
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank", "noopener");
  });
}
function updateTotal() {
  const card = document.getElementById("totalCard");
  const real = state.list.filter(i => i.idx !== undefined);
  if (!real.length) { card.classList.add("hidden"); return; }
  const t = totals()[0];
  card.classList.remove("hidden");
  document.getElementById("totalVal").textContent = fmt(t.sum);
  document.getElementById("totalChain").textContent = "הסל הזול ביותר — ב" + CHAINS[t.k].name + " (" + t.have + "/" + t.total + " מוצרים)";
}
document.getElementById("goCompare").addEventListener("click", () => switchTab("compare"));

/* purchased -> habits */
document.getElementById("markPurchased").addEventListener("click", () => {
  const real = state.list.filter(i => i.idx !== undefined);
  if (!real.length) { toast("הרשימה ריקה"); return; }
  state.history.push({ ts: Date.now(), items: real.map(i => ({ idx: i.idx, qty: i.qty, n: i.n || ITEMS[i.idx][0] })) });
  if (state.history.length > 80) state.history = state.history.slice(-80);
  state.list = []; save(); renderAll(); switchTab("list");
  toast("נשמר — נלמד מזה להמלצות הבאות");
});

/* ---------- smart: swaps ---------- */
function tokens(name) { return norm(name).split(" ").filter(t => t.length > 1 && !/^\d/.test(t)); }
function unitComparable(u1, u2) {
  if (!u1 || !u2) return u1 === u2;
  if (u1 === u2) return true;
  const a = u1.split(" "), b = u2.split(" ");
  const wa = a.length > 1 ? a.slice(1).join(" ") : a[0];
  const wb = b.length > 1 ? b.slice(1).join(" ") : b[0];
  if (wa !== wb) return false;
  const qa = parseFloat(a[0]), qb = parseFloat(b[0]);
  if (qa > 0 && qb > 0) { const r = qa > qb ? qa / qb : qb / qa; if (r > 2.5) return false; }
  return true;
}
function renderSwaps() {
  const wrap = document.getElementById("swaps");
  const real = state.list.filter(i => i.idx !== undefined);
  if (!real.length) { wrap.innerHTML = `<div class="muted" style="padding:4px 16px 14px">הוסיפו מוצרים כדי לקבל הצעות חיסכון.</div>`; return; }
  const best = totals()[0];
  const found = [];
  for (const it of real) {
    const item = ITEMS[it.idx], cur = item[2][best.k];
    if (cur === undefined) continue;
    const tks = tokens(item[0]);
    if (!tks.length) continue;
    const first = tks[0];
    let alt = null, gain = 0;
    const hits = search(first, 40);
    for (const h of hits) {
      if (h === it.idx) continue;
      const cand = ITEMS[h], cp = cand[2][best.k];
      if (cp === undefined) continue;
      if (!unitComparable(item[1], cand[1])) continue;
      const ctks = tokens(cand[0]);
      const shared = tks.filter(t => ctks.includes(t)).length;
      if (shared < Math.min(2, tks.length)) continue;
      const g = (cur - cp) * it.qty;
      if (g > gain + 0.3) { alt = h; gain = g; }
    }
    if (alt !== null) found.push({ it, item, alt, gain });
  }
  found.sort((a, b) => b.gain - a.gain);
  wrap.innerHTML = found.length ? found.slice(0, 6).map(f => `
    <div class="srow">
      <div class="si"><div class="sn1">במקום: ${S(f.item[0])}</div><div class="sn2">${S(ITEMS[f.alt][0])}</div></div>
      <span class="sgain num">−${fmt(f.gain)}</span>
      <button class="btn sm" data-swap="${f.it.idx}:${f.alt}">החלפה</button>
    </div>`).join("")
    : `<div class="muted" style="padding:4px 16px 14px">לא נמצאו תחליפים זולים יותר — הסל שלך יעיל.</div>`;
  wrap.querySelectorAll("[data-swap]").forEach(b => b.addEventListener("click", () => {
    const [from, to] = b.dataset.swap.split(":").map(Number);
    const it = state.list.find(i => i.idx === from);
    if (it) { it.idx = to; it.n = ITEMS[to][0]; save(); renderAll(); toast("הוחלף — הסל הוזל"); }
  }));
}

/* ---------- smart: diet ---------- */
const DIETS = [
  { id: "prot", label: "עשיר בחלבון", kw: ["חלבון", "פרוטאין", "קוטג", "טונה ", "טופו", "סקיר", "יוגורט יווני", "ביצים ט", "חזה עוף"] },
  { id: "low", label: "דל קלוריות / לייט", kw: ["לייט", "דל שומן", "דל קלוריות", "0%", "1%", " דיאט", "זירו"] },
  { id: "gf", label: "ללא גלוטן", kw: ["ללא גלוטן", "קמח אורז", "קינואה", "פריכיות אורז", "כוסמת"] },
  { id: "vegan", label: "טבעוני", kw: ["טבעוני", "משקה סויה", "טופו", "משקה שקדים", "משקה שיבולת", "עדשים ", "חומוס ", "טחינה"] },
  { id: "nosugar", label: "ללא סוכר", kw: ["ללא סוכר", "ללא תוספת סוכר", "זירו", "סוכרזית", "סטיביה"] },
];
function renderDiet() {
  const chips = document.getElementById("dietChips");
  chips.innerHTML = DIETS.map(d => `<button class="chip ${state.diet === d.id ? "on" : ""}" data-d="${d.id}">${d.label}</button>`).join("");
  chips.querySelectorAll("[data-d]").forEach(b => b.addEventListener("click", () => {
    state.diet = state.diet === b.dataset.d ? null : b.dataset.d; save(); renderDiet();
  }));
  const res = document.getElementById("dietResults");
  if (!state.diet) { res.innerHTML = `<div class="muted">בחרו העדפה — נציג מוצרים מתאימים מהמאגר, מהזול ליקר.</div>`; return; }
  const d = DIETS.find(x => x.id === state.diet);
  const inList = new Set(state.list.filter(i => i.idx !== undefined).map(i => i.idx));
  const matches = [];
  for (let i = 0; i < ITEMS.length; i++) {
    if (d.kw.some(k => NORMS[i].includes(norm(k)))) matches.push(i);
    if (matches.length > 400) break;
  }
  matches.sort((a, b) => minPrice(ITEMS[a][2]).v - minPrice(ITEMS[b][2]).v);
  res.innerHTML = matches.slice(0, 8).map(i => {
    const it = ITEMS[i], mp = minPrice(it[2]);
    return `<div class="srow" style="padding-inline:0">
      <div class="si"><div class="sn2">${S(it[0])}</div><div class="sn1 num">${it[1] ? S(it[1]) + " · " : ""}${fmt(mp.v)} ב${S(CHAINS[mp.k].name)}</div></div>
      ${inList.has(i) ? `<span class="sgain">ברשימה ✓</span>` : `<button class="btn sm" data-add="${i}">הוספה</button>`}
    </div>`;
  }).join("");
  res.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => {
    addItem(+b.dataset.add, 1); renderDiet(); toast("נוסף לרשימה");
  }));
}

/* ---------- smart: habits ---------- */
function renderHabits() {
  const wrap = document.getElementById("habits");
  if (!state.history.length) {
    wrap.innerHTML = `<div class="muted" style="padding:4px 16px 14px">אחרי שתסמנו "סיימתי לקנות" בטאב ההשוואה, נזהה מה אתם קונים באופן קבוע ונזכיר כשמשהו כנראה נגמר.</div>`; return;
  }
  const freq = {}, last = {};
  for (const h of state.history) for (const it of h.items) {
    freq[it.idx] = (freq[it.idx] || 0) + 1;
    last[it.idx] = Math.max(last[it.idx] || 0, h.ts);
  }
  const inList = new Set(state.list.filter(i => i.idx !== undefined).map(i => i.idx));
  const now = Date.now();
  const sugg = Object.keys(freq).map(Number).filter(i => !inList.has(i) && ITEMS[i])
    .map(i => ({ i, n: freq[i], days: Math.floor((now - last[i]) / 864e5) }))
    .sort((a, b) => b.n - a.n || b.days - a.days).slice(0, 7);
  wrap.innerHTML = sugg.length ? sugg.map(s => {
    const it = ITEMS[s.i], mp = minPrice(it[2]);
    return `<div class="srow">
      <div class="si"><div class="sn2">${S(it[0])}</div>
      <div class="sn1 num">נקנה ${s.n}× · לפני ${s.days === 0 ? "פחות מיום" : s.days + " ימים"} · ${fmt(mp.v)} ב${S(CHAINS[mp.k].name)}</div></div>
      <button class="btn sm" data-add="${s.i}">הוספה</button></div>`;
  }).join("") : `<div class="muted" style="padding:4px 16px 14px">הכל כבר ברשימה.</div>`;
  wrap.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => { addItem(+b.dataset.add, 1); toast("נוסף לרשימה"); }));
}

/* ---------- tabs ---------- */
function switchTab(id) {
  document.querySelectorAll("main").forEach(m => m.classList.toggle("hidden", m.id !== "tab-" + id));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  window.scrollTo({ top: 0 });
  if (id === "compare") renderCompare();
  if (id === "smart") { renderSwaps(); renderDiet(); renderHabits(); }
}
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

function renderAll() { renderList(); updateTotal(); renderCompare(); }

/* re-anchor saved items by name — the catalog order changes on every daily price refresh */
(function reconcile() {
  const fix = it => {
    if (it.idx === undefined) return;
    if (!ITEMS[it.idx] || (it.n && ITEMS[it.idx][0] !== it.n)) {
      const h = it.n ? search(it.n, 1) : [];
      if (h.length) { it.idx = h[0]; it.n = ITEMS[h[0]][0]; }
      else { it.note = it.n || "פריט מגרסה קודמת"; delete it.idx; }
    } else if (!it.n) it.n = ITEMS[it.idx][0];
  };
  state.list.forEach(fix);
  for (const h of state.history) h.items.forEach(fix);
  save();
})();
renderAll();
