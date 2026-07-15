/**
 * Wolf סל חכם — price refresh pipeline.
 * Downloads today's official price-transparency (שקיפות מחירים) PriceFull files
 * from 6 Israeli chains, cross-matches by barcode, and rebuilds ../index.html.
 *
 * Run:  node update.js   (from the pipeline/ directory; needs Node 18+)
 * On success prints "DONE <n> items" and rewrites ../index.html in place.
 * If fewer than 3 chains succeed the old index.html is kept and it exits 1.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

async function get(url, opts = {}) {
  const res = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, method: opts.method || "GET", body: opts.body, redirect: "follow" });
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  return res;
}
const cookieOf = res => (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean))
  .map(c => c.split(";")[0]).join("; ");

async function gunzipToText(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  return zlib.gunzipSync(buf).toString("utf8");
}

/* ---------- per-chain downloaders (each returns PriceFull XML text) ---------- */

async function shufersal() {
  const page = await (await get("https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0&sort=Time&sortdir=DESC")).text();
  const m = page.match(/href="(https:\/\/[^"]*pricefull[^"]*)"/i);
  if (!m) throw new Error("shufersal: no PriceFull link");
  return gunzipToText(await get(m[1].replace(/&amp;/g, "&")));
}

async function cerberus(user) {
  const login = await get("https://url.publishedprices.co.il/login");
  let cookie = cookieOf(login);
  const html = await login.text();
  const tok = (html.match(/name="csrftoken" content="([^"]+)"/) || [])[1];
  if (!tok) throw new Error(user + ": no csrf");
  const form = new URLSearchParams({ username: user, password: "", csrftoken: tok });
  // manual redirect: the auth session cookie is set on the 302 response itself
  const post = await fetch("https://url.publishedprices.co.il/login/user", {
    method: "POST", body: form.toString(), redirect: "manual",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
  });
  cookie = cookieOf(post) || cookie;
  const landing = await get("https://url.publishedprices.co.il/file", { headers: { Cookie: cookie } });
  cookie = cookieOf(landing) || cookie;
  const afterHtml = await landing.text();
  const tok2 = (afterHtml.match(/name="csrftoken" content="([^"]+)"/) || [])[1] || tok;
  const dtParams = "sEcho=1&iColumns=5&sColumns=,,,,&iDisplayStart=0&iDisplayLength=100&mDataProp_0=fname&bSearchable_0=true&bSortable_0=true&mDataProp_1=typeLabel&mDataProp_2=size&mDataProp_3=ftime&bSortable_3=true&mDataProp_4=&sSearch=PriceFull&bRegex=false&iSortingCols=1&iSortCol_0=3&sSortDir_0=desc&cd=%2F&csrftoken=" + encodeURIComponent(tok2);
  const dir = await (await get("https://url.publishedprices.co.il/file/json/dir", {
    method: "POST", body: dtParams,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
  })).json();
  if (!dir.aaData || !dir.aaData.length) throw new Error(user + ": empty dir");
  // largest file = fullest store
  const fname = dir.aaData.slice().sort((a, b) => b.size - a.size)[0].fname;
  return gunzipToText(await get("https://url.publishedprices.co.il/file/d/" + encodeURIComponent(fname), { headers: { Cookie: cookie } }));
}

async function superpharm() {
  const page = await (await get("https://prices.super-pharm.co.il/?Category-equals=PriceFull")).text();
  const m = page.match(/href="(\/Download\/PriceFull[^"]+)"/);
  if (!m) throw new Error("superpharm: no PriceFull link");
  return gunzipToText(await get("https://prices.super-pharm.co.il" + m[1].replace(/&amp;/g, "&")));
}

const CHAINS = [
  { key: "sh", name: "שופרסל", dl: shufersal },
  { key: "rl", name: "רמי לוי", dl: () => cerberus("RamiLevi") },
  { key: "tt", name: "טיב טעם", dl: () => cerberus("TivTaam") },
  { key: "yo", name: "יוחננוף", dl: () => cerberus("yohananof") },
  { key: "oa", name: "אושר עד", dl: () => cerberus("osherad") },
  { key: "sp", name: "סופר-פארם", dl: superpharm },
];

/* ---------- XML parsing + catalog build (same logic the app was built with) ---------- */

const tag = (block, t) => {
  const m = block.match(new RegExp("<" + t + ">([^<]*)</" + t + ">"));
  return m ? m[1].trim() : "";
};

function parseItems(xml) {
  return xml.split("<Item>").slice(1).map(raw => ({
    code: tag(raw, "ItemCode"),
    name: tag(raw, "ItemName").replace(/\s+/g, " ").trim(),
    price: parseFloat(tag(raw, "ItemPrice")),
    w: tag(raw, "bIsWeighted") === "1",
    qty: tag(raw, "Quantity"),
    uq: tag(raw, "UnitQty"),
  }));
}

const PRODUCE = [
  ["עגבניות", ["עגבני"]], ["מלפפונים", ["מלפפון"]], ["בצל יבש", ["בצל יבש", "בצל אדום"]],
  ["תפוחי אדמה", ["תפוח אדמה", 'תפו"א', "אדמה"]], ["גזר", ["גזר"]], ["פלפל אדום", ["פלפל אדום"]],
  ["בננות", ["בננה", "בננות"]], ["תפוחים", ["תפוח פינק", "תפוח גאלה", "תפוח זהוב", "תפוח גרנד", "תפוח עץ"]],
  ["תפוזים", ["תפוז"]], ["לימונים", ["לימון"]], ["אבוקדו", ["אבוקדו"]],
  ["כרוב", ["כרוב לבן", "כרוב אדום"]], ["חסה", ["חסה"]], ["קישואים", ["קישוא"]],
  ["חצילים", ["חציל"]], ["בטטה", ["בטטה"]], ["שום", ["שום "]], ["ענבים", ["ענבים"]],
  ["אבטיח", ["אבטיח"]], ["מלון", ["מלון"]], ["אגסים", ["אגס"]], ["כרובית", ["כרובית"]],
  ["ברוקולי", ["ברוקולי"]], ["פטריות", ["פטריות", "פטריה"]],
  // fresh meat / poultry / fish — also weighted with per-chain internal barcodes
  ["שוקיים עוף", ["שוקיים", "שוק עוף"]],
  ["כרעיים עוף", ["כרעיים", "כרע עוף"]],
  ["חזה עוף", ["חזה עוף"]],
  ["פרגית", ["פרגית"]],
  ["כנפיים עוף", ["כנפיים"]],
  ["עוף שלם", ["עוף שלם", "עוף טרי שלם"]],
  ["כבד עוף", ["כבד עוף"]],
  ["הודו טחון", ["הודו טחון", "טחון הודו"]],
  ["בשר בקר טחון", ["טחון בקר", "בקר טחון"]],
  ["אנטריקוט", ["אנטריקוט"]],
  ["צלעות בקר", ["צלעות בקר"]],
  ["שניצל עוף", ["שניצל עוף"]],
  ["סלמון", ["סלמון"]],
  ["דניס", ["דניס"]],
  ["לברק", ["לברק"]],
  ["אמנון", ["אמנון"]],
];

function build(chainData) {
  const index = new Map();
  for (const { key, items } of chainData) {
    for (const it of items) {
      if (!it.code || it.code.length < 8 || !it.name || it.name.length < 3 || !(it.price > 0) || it.price > 3000) continue;
      let rec = index.get(it.code);
      if (!rec) { rec = { names: [], p: {}, w: it.w, qty: it.qty, uq: it.uq }; index.set(it.code, rec); }
      if (rec.p[key] === undefined || it.price < rec.p[key]) rec.p[key] = Math.round(it.price * 100) / 100;
      rec.names.push(it.name);
    }
  }
  const bestName = names => {
    const f = {};
    for (const n of names) f[n] = (f[n] || 0) + 1;
    return Object.keys(f).sort((a, b) => f[b] - f[a] || a.length - b.length)[0];
  };
  let all = [];
  for (const rec of index.values()) {
    const chains = Object.keys(rec.p).length;
    const name = bestName(rec.names);
    if (/^\d+$/.test(name)) continue;
    let unit = "";
    if (rec.w) unit = 'לק"ג';
    else {
      const q = parseFloat(rec.qty);
      if (q > 0 && rec.uq && rec.uq !== "לא ידוע" && rec.uq.length < 12)
        unit = (q === Math.round(q) ? q : q.toFixed(1)) + " " + rec.uq;
    }
    all.push({ n: name, u: unit, ch: chains, p: rec.p });
  }
  const seen = new Map();
  for (const it of all) {
    const k = it.n.replace(/[^א-תa-z0-9]+/gi, "");
    const prev = seen.get(k);
    if (!prev || it.ch > prev.ch) seen.set(k, it);
  }
  all = [...seen.values()];
  all.sort((a, b) => b.ch - a.ch || Math.min(...Object.values(a.p)) - Math.min(...Object.values(b.p)));
  const picked = all; // full assortment — every product sold in any chain

  const produceOut = [];
  for (const [label, keys] of PRODUCE) {
    const prices = {};
    for (const { key, items } of chainData) {
      if (key === "sp") continue;
      const cands = items.filter(x => x.w && x.price > 0.5 && x.price < 200 &&
        keys.some(k => x.name.includes(k)) && !x.name.includes("קפוא") && !x.name.includes("מיובש") && !x.name.includes("מעושן"));
      if (cands.length) prices[key] = Math.min(...cands.map(x => x.price));
    }
    if (Object.keys(prices).length >= 2) produceOut.push({ n: label + " (טרי)", u: 'לק"ג', p: prices });
  }
  return [...produceOut, ...picked].map(it => [it.n, it.u, it.p]);
}

/* ---------- main ---------- */
(async () => {
  const chainData = [];
  for (const ch of CHAINS) {
    try {
      const xml = await ch.dl();
      const items = parseItems(xml);
      if (items.length < 50) throw new Error("only " + items.length + " items");
      chainData.push({ key: ch.key, items });
      console.log("OK  ", ch.name, items.length, "items");
    } catch (e) {
      console.error("FAIL", ch.name, "-", e.message);
    }
  }
  if (chainData.length < 3) {
    console.error("Fewer than 3 chains succeeded — keeping existing index.html");
    process.exit(1);
  }
  const out = build(chainData);
  const today = new Date().toISOString().slice(0, 10);
  // <-escape so no product name can ever close the inline <script> block
  const dataJs = 'const UPDATED="' + today + '";\nconst ITEMS=' + JSON.stringify(out).replace(/</g, "\\u003C") + ";";
  const dir = __dirname;
  const head = fs.readFileSync(path.join(dir, "app_head.html"), "utf8");
  const main = fs.readFileSync(path.join(dir, "app_main.js"), "utf8");
  const html = head + "\n<script>\n" + dataJs + "\n" + main + "\n</script>\n";
  fs.writeFileSync(path.join(dir, "..", "index.html"), html, "utf8");
  console.log("DONE", out.length, "items, updated", today, "(chains: " + chainData.map(c => c.key).join(",") + ")");
})();
