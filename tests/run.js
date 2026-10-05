/* Parts Bin tests: loads inventory.html in headless Chromium from a local
   server and checks the logic that decides what ends up in the data file -
   value matching, BOM parsing, the three-way sync merge, unknown fields,
   the version guard, scan parsing - plus that every QR label decodes and
   that the page opens offline once it has been seen.

     npm install && npx playwright install chromium && npm test

   CHROMIUM_PATH points at a browser already on the machine instead.     */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const jsQR = require("jsqr");

const ROOT = path.resolve(__dirname, "..");
const TYPES = {".html":"text/html", ".js":"text/javascript", ".json":"application/json",
               ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".png":"image/png"};

let failed = 0, passed = 0;
function check(name, ok, detail){
  if(ok){ passed++; console.log("  ok    " + name); }
  else  { failed++; console.log("  FAIL  " + name + (detail!==undefined ? "\n        " + JSON.stringify(detail) : "")); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function serve(){
  const srv = http.createServer((req, res)=>{
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if(p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, {"Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control":"no-store"});
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r=>srv.listen(0, "127.0.0.1", ()=>r(srv)));
}

/* a QR matrix drawn as pixels, 4 px per module, quiet zone included, read back with jsQR */
function decodeMatrix(rows){
  const n = rows.length, q = 4, s = 4, w = (n + q*2) * s;
  const px = new Uint8ClampedArray(w*w*4).fill(255);
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(rows[y][x]==="1")
    for(let dy=0;dy<s;dy++) for(let dx=0;dx<s;dx++){
      const i = (((y+q)*s+dy)*w + (x+q)*s+dx)*4; px[i]=px[i+1]=px[i+2]=0;
    }
  const r = jsQR(px, w, w, {inversionAttempts:"dontInvert"});
  return r ? r.data : null;
}

(async ()=>{
  const srv = await serve();
  const base = "http://localhost:" + srv.address().port + "/";
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const ctx = await browser.newContext();
  /* nothing leaves the machine: GitHub and LCSC are not part of these tests */
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(base + "inventory.html");
  await page.waitForFunction(() => typeof db === "object" && db !== null);
  const example = JSON.parse(fs.readFileSync(path.join(ROOT, "example-components.json"), "utf8"));
  await page.evaluate(d => { db = normalize(d); render(); }, example);

  console.log("values and BOMs");
  const vals = await page.evaluate(() => ["10k","4k7","10kΩ","100nF","0.1uF","4.7µF","1R2","2.2MEG","47pF","1M"].map(normValue));
  check("normValue reads the usual spellings", eq(vals,
    ["1.0000e+4","4.7000e+3","1.0000e+4","1.0000e-7","1.0000e-7","4.7000e-6","1.2000e+0","2.2000e+6","4.7000e-11","1.0000e+6"]), vals);
  const bom = await page.evaluate(() => parseBom("Designator,Value,Footprint,MPN\nR1 R2 R3,10k,0402,\nC1,100nF,0402,GRM155R71H104KE14D\nU1,,,C8734"));
  check("parseBom counts designators when there is no quantity column", bom[0].need === 3, bom[0]);
  check("parseBom moves an LCSC code out of the part number column", bom[2].lcsc === "C8734" && bom[2].mpn === "", bom[2]);
  const m = await page.evaluate(() => {
    const a = matchBom({mpn:"0402WGF1002TCE"}), b = matchBom({val:"10k", pkg:"0402"});
    prefs.bomMatch = "exact"; const c = matchBom({val:"10k", pkg:"0402"}); prefs.bomMatch = "value";
    return [a.how, !!b.p, c.p];
  });
  check("matchBom: part number first, value + package as a fallback, nothing in exact mode",
        m[0] === "part number" && m[1] === true && m[2] === null, m);

  console.log("three-way merge");
  const mg = await page.evaluate(() => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const B = normalize(clone(db)), M = normalize(clone(db)), T = normalize(clone(db));
    const p = id => x => x.parts.find(q => q.id === id);
    p(1)(B).qty = 100; p(1)(M).qty = 90; p(1)(T).qty = 95;          /* both took some */
    p(2)(M).desc = "mine";                                          /* one side only */
    p(3)(M).box = "C9"; p(3)(T).box = "C10";                         /* a real clash */
    T.parts = T.parts.filter(x => x.id !== 4);                       /* deleted there */
    const nid = 1 + B.parts.reduce((n, x) => Math.max(n, x.id), 0);
    M.parts.push({id:nid, mpn:"MINE-NEW", qty:1}); T.parts.push({id:nid, mpn:"THEIRS-NEW", qty:1});
    M.catMin = {Resistors:50}; T.catMin = {Capacitors:20};
    const r = merge3(B, M, T), out = r.db;
    return {q1:p(1)(out).qty, d2:p(2)(out).desc, b3:p(3)(out).box, clash:r.conflicts.map(c => c.k),
            has4:!!p(4)(out), news:out.parts.filter(x => /-NEW$/.test(x.mpn)).map(x => x.mpn).sort(),
            ids:new Set(out.parts.map(x => x.id)).size === out.parts.length, catMin:out.catMin};
  });
  check("a quantity changed on both sides adds both movements (100 to 90 and 95 is 85)", mg.q1 === 85, mg.q1);
  check("a field changed on one side takes that side", mg.d2 === "mine", mg.d2);
  check("a clash keeps this machine's value and is listed", mg.b3 === "C9" && eq(mg.clash, ["box"]), mg);
  check("a part deleted on the other side stays deleted", mg.has4 === false);
  check("two parts that took the same new id are both kept, under different ids",
        eq(mg.news, ["MINE-NEW","THEIRS-NEW"]) && mg.ids, mg.news);
  check("category alert levels merge key by key", mg.catMin.Capacitors === 20 && mg.catMin.Resistors === 50 &&
        Object.keys(mg.catMin).length === 2, mg.catMin);

  console.log("fields from a newer page");
  const uk = await page.evaluate(() => {
    const d = normalize({app:"2.3.0", future:{x:1}, parts:[{id:1, mpn:"A", qty:"5", spice:"r.lib"}],
      boms:[{id:7, name:"b", text:"", panel:3}], pending:[{id:2, at:"", supplier:"LCSC", lines:[{pid:1, qty:2, note:"tape"}]}]});
    return {top:d.future, part:d.parts[0].spice, qty:d.parts[0].qty, bom:d.boms[0].panel,
            ord:d.pending[0].supplier, line:d.pending[0].lines[0].note};
  });
  check("normalize keeps fields it does not know, at every level",
        eq(uk.top, {x:1}) && uk.part === "r.lib" && uk.bom === 3 && uk.ord === "LCSC" && uk.line === "tape", uk);
  check("normalize still cleans the fields it does know", uk.qty === 5, uk.qty);

  const vg = await page.evaluate(async () => {
    const out = {};
    out.cmp = [verCmp("2.10.0","2.9.9"), verCmp("2.3.0","2.3.0"), verCmp("2.2.1","2.3")];
    db = normalize({app:"99.0.0", parts:[{id:1, mpn:"A", qty:1}]});
    out.newer = newerData;
    save(); out.keptStamp = db.app;
    /* an automatic push is held; nothing reaches the network */
    let puts = 0; const realFetch = window.fetch;
    window.fetch = async (u, o) => { if(o && o.method === "PUT") puts++; return new Response("{}", {status:500}); };
    const g = {repo:gh.repo, token:gh.token}; gh.repo = "me/data"; gh.token = "t"; ghPulled = true;
    await ghPush(true); out.puts = puts;
    out.chip = document.getElementById("storageChip").textContent;
    window.fetch = realFetch; gh.repo = g.repo; gh.token = g.token; ghPulled = false; gh.dirty = false; ghSave();
    db = normalize({app:"2.2.0", parts:[{id:1, mpn:"A", qty:1}]});
    out.older = newerData; save(); out.stamp = db.app;
    return out;
  });
  check("verCmp orders versions numerically", eq(vg.cmp, [1, 0, -1]), vg.cmp);
  check("data from a newer page is noticed", vg.newer === "99.0.0", vg.newer);
  check("saving does not restamp it with this older version", vg.keptStamp === "99.0.0", vg.keptStamp);
  check("an automatic push of it is held", vg.puts === 0, vg.puts);
  check("the storage chip says why", /push held/.test(vg.chip), vg.chip);
  check("data from an older page is stamped with this version on save",
        vg.older === "" && vg.stamp === await page.evaluate(() => APP_VERSION), vg);
  await page.evaluate(d => { db = normalize(d); render(); }, example);

  console.log("used in, scanning, links");
  const ui1 = await page.evaluate(() => ({
    used: usedIn(findPart(1)).map(u => u.name + ":" + u.per),
    row: !!document.querySelector('.row[data-id="1"] .usetag')
  }));
  check("a part on a saved board lists the board and how many per board", eq(ui1.used, ["Sensor board rev B:2"]), ui1.used);
  check("its row carries the tag", ui1.row);
  const sc = await page.evaluate(() => [
    parseScan("{pbn:PICK2309120041,on:SO2309120012,pc:C25744,pm:0402WGF1002TCE,qty:100,mc:,cc:1,pdi:93118125,hp:0,wc:JS}"),
    parseScan("https://example.github.io/parts-bin-app/inventory.html#box=C7"),
    parseScan("c3"), parseScan("C2040"), parseScan("ams1117")
  ]);
  check("an LCSC bag label gives code, part number, quantity and order",
        eq(sc[0], {kind:"lcsc", lcsc:"C25744", mpn:"0402WGF1002TCE", qty:100, order:"SO2309120012"}), sc[0]);
  check("a box label link opens the box", eq(sc[1], {kind:"box", v:"C7"}), sc[1]);
  check("a bare box number opens the box", eq(sc[2], {kind:"box", v:"C3"}), sc[2]);
  check("a bare LCSC code is looked up", sc[3].kind === "lcsc" && sc[3].lcsc === "C2040", sc[3]);
  check("anything else is a search", eq(sc[4], {kind:"q", v:"ams1117"}), sc[4]);
  const bag = await page.evaluate(() => {
    openScan(); scanHandle("{on:SO1,pc:C25744,pm:0402WGF1002TCE,qty:100}");
    const before = findPart(1).qty;
    document.getElementById("scanIn").click();
    const after = findPart(1).qty; closeEditor();
    return {before, after, open: !document.getElementById("overlay").hidden};
  });
  check("booking in a scanned bag adds the bag's quantity", bag.after === bag.before + 100, bag);
  check("closing the scan sheet closes it", bag.open === false);
  const rt = await page.evaluate(async () => {
    location.hash = "#box=C5"; await new Promise(r => setTimeout(r, 50));
    return {view:ui.view, box:ui.box, hash:location.hash};
  });
  check("#box=C5 opens the parts list on box C5 and clears the address",
        rt.view === "parts" && rt.box === "C5" && rt.hash === "", rt);

  console.log("QR codes");
  const texts = ["C7", base + "inventory.html#box=C12",
                 "https://ajengineering.github.io/parts-bin-app/inventory.html#box=" + "X".repeat(60),
                 "https://example.org/" + "a".repeat(180)];
  const mats = await page.evaluate(ts => ts.map(t => qrEncode(t).map(r => r.map(b => b ? "1" : "0").join(""))), texts);
  mats.forEach((rows, i) => {
    const v = (rows.length - 17) / 4;
    check(`version ${v} (${texts[i].length} bytes) decodes back to its text`, decodeMatrix(rows) === texts[i], decodeMatrix(rows));
  });
  /* the label as drawn: SVG to canvas to pixels, read like a camera would */
  const drawn = await page.evaluate(async t => {
    const svg = qrSvg(t, 300).replace('class="qr" ', "");
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 300;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, 300, 300);
    return Array.from(g.getImageData(0, 0, 300, 300).data);
  }, texts[1]);
  const read = jsQR(new Uint8ClampedArray(drawn), 300, 300);
  check("the SVG drawn on a label decodes, quiet zone and all", read && read.data === texts[1], read && read.data);
  const labels = await page.evaluate(async () => {
    ui.view = "labels"; render();
    const svgs = [...document.querySelectorAll(".label .qr")];
    return {cards: document.querySelectorAll(".label").length, codes: svgs.length};
  });
  check("every box label carries a code", labels.cards > 0 && labels.cards === labels.codes, labels);
  await page.evaluate(() => { ui.view = "parts"; render(); });

  console.log("installable, offline");
  const sw = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]);
    return {reg: !!reg, manifest: !!document.querySelector('link[rel="manifest"]')};
  });
  check("the service worker registers and the manifest is linked", sw.reg && sw.manifest, sw);
  /* reload once so the worker controls the page and has kept a copy */
  await page.reload(); await page.waitForFunction(() => typeof db === "object" && db !== null);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout:8000}).catch(()=>{});
  await ctx.setOffline(true);
  let offline = false;
  try{ await page.reload(); offline = await page.evaluate(() => typeof APP_VERSION === "string"); }catch(e){}
  await ctx.setOffline(false);
  check("the page opens with the network off", offline);

  check("no script errors on the page", errors.length === 0, errors);

  console.log("update check");
  /* a context of its own with no service worker, so every request is seen here */
  const uctx = await browser.newContext({serviceWorkers:"block"});
  let release = {status:200, tag:"v99.0.0"}, sitePage = null, apiCalls = 0;
  await uctx.route(u => !u.href.startsWith(base) && u.protocol !== "file:", async r => {
    if(!/api\.github\.com\/repos\/AJEngineering\/parts-bin-app\/releases\/latest/.test(r.request().url())) return r.abort();
    apiCalls++;
    if(release.status !== 200) return r.fulfill({status:release.status, body:"{}"});
    return r.fulfill({status:200, contentType:"application/json", body:JSON.stringify({
      tag_name:release.tag, html_url:"https://github.com/AJEngineering/parts-bin-app/releases/tag/"+release.tag,
      assets:[{name:"inventory.html", browser_download_url:"https://example.invalid/inventory.html"}]})});
  });
  await uctx.route(base + "inventory.html", async r => {
    if(!sitePage) return r.continue();
    const real = fs.readFileSync(path.join(ROOT, "inventory.html"), "utf8");
    return r.fulfill({status:200, contentType:"text/html", body:real.replace(/const APP_VERSION = "[\d.]+"/, 'const APP_VERSION = "'+sitePage+'"')});
  });
  const up = await uctx.newPage();
  const uerr = []; up.on("pageerror", e => uerr.push(String(e)));
  await up.goto(base + "inventory.html");
  await up.waitForFunction(() => typeof db === "object" && db !== null);
  const bar = () => up.evaluate(() => { const b = document.getElementById("updBar");
    return {shown:!b.hidden, text:b.textContent.replace(/\s+/g," ").trim(), reload:!!document.getElementById("updReload")}; });

  await up.evaluate(() => updCheck(true));
  let b1 = await bar();
  check("a newer release shows the update bar", b1.shown && /99\.0\.0/.test(b1.text), b1);
  check("a served page points at the site, not a download, when the site has not caught up", /not caught up/.test(b1.text), b1.text);
  await up.evaluate(() => document.getElementById("updLater").click());
  check("not now hides it for that version", !(await bar()).shown);
  const calls = apiCalls;
  await up.evaluate(() => updCheck(false));
  check("the release list is asked at most once a day", apiCalls === calls, {apiCalls, calls});

  sitePage = "99.1.0";
  await up.evaluate(() => updCheckPage(true));
  const b2 = await bar();
  check("a newer page on the same site offers Reload to update", b2.shown && b2.reload && /99\.1\.0/.test(b2.text), b2);

  sitePage = null; release = {status:200, tag:"v" + await up.evaluate(() => APP_VERSION)};
  await up.evaluate(() => { localStorage.removeItem(UPD_KEY); upd = {at:0, latest:"", url:"", notes:"", dismissed:"", pageAt:0, page:""}; });
  await up.evaluate(async () => { await updCheck(true); await updCheckPage(true); });
  check("the same version shows nothing", !(await bar()).shown);

  release = {status:403};
  await up.evaluate(() => updCheck(true));
  check("a refused check shows nothing", !(await bar()).shown);
  await uctx.setOffline(true);
  await up.evaluate(async () => { await updCheck(true); await updCheckPage(true); });
  await uctx.setOffline(false);
  check("offline, the check fails silently", !(await bar()).shown && uerr.length === 0, uerr);

  release = {status:200, tag:"v99.0.0"};
  const off = await up.evaluate(async () => { prefs.updCheck = false; await updCheck(true); prefs.updCheck = true;
    return document.getElementById("updBar").hidden; });
  const before = apiCalls;
  await up.evaluate(async () => { prefs.updCheck = false; await updCheck(true); prefs.updCheck = true; });
  check("switched off, nothing is asked", off && apiCalls === before, {apiCalls, before});
  /* a copy opened off the disk has no site to reload from: it offers the download */
  const fp = await uctx.newPage();
  await fp.goto("file://" + path.join(ROOT, "inventory.html"));
  await fp.waitForFunction(() => typeof db === "object" && db !== null);
  const fb = await fp.evaluate(async () => { await updCheck(true); const a = document.getElementById("updGet");
    return {shown:!document.getElementById("updBar").hidden, href:a && a.href}; });
  check("a copy opened from the disk offers the release's inventory.html", fb.shown && fb.href === "https://example.invalid/inventory.html", fb);
  await uctx.close();

  await browser.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
