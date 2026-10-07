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
const os = require("os");
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

/* raw YUV 4:2:0 video, one still frame: the QR code black on white, 6 px a module */
function writeY4m(file, rows){
  const W = 640, H = 480, n = rows.length, s = 6, ox = Math.floor((W - n*s)/2), oy = Math.floor((H - n*s)/2);
  const y = Buffer.alloc(W*H, 235), uv = Buffer.alloc(W*H/2, 128);
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(rows[r][c]==="1")
    for(let dy=0;dy<s;dy++) y.fill(16, (oy+r*s+dy)*W + ox+c*s, (oy+r*s+dy)*W + ox+c*s+s);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]));
}

(async ()=>{
  const srv = await serve();
  const base = "http://localhost:" + srv.address().port + "/";
  /* a fake webcam that films an LCSC bag label: written below as raw video */
  const camFile = path.join(os.tmpdir(), "parts-bin-cam.y4m");
  const opts = {args:["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                      "--use-file-for-fake-video-capture=" + camFile]};
  if(process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(opts);
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

  const mg2 = await page.evaluate(() => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const p = id => x => x.parts.find(q => q.id === id);
    const out = {};
    let B = normalize(clone(db)), M = normalize(clone(db)), T = normalize(clone(db));
    M.parts = M.parts.filter(x => x.id !== 5); p(5)(T).qty = 7;                    /* deleted here, edited there */
    T.parts = T.parts.filter(x => x.id !== 6); p(6)(M).desc = "kept here";         /* deleted there, edited here */
    M.parts = M.parts.filter(x => x.id !== 7);                                       /* deleted here, untouched there */
    const nid = 1 + B.parts.reduce((n, x) => Math.max(n, x.id), 0);
    M.parts.push({id:nid, mpn:"ONLY-HERE", qty:3});                                  /* added here only */
    p(1)(B).qty = 10; p(1)(M).qty = 0; p(1)(T).qty = 5;                             /* took more than there was */
    M.categories = M.categories.concat("Mine-Cat").filter(c => c !== "Inductors");
    T.categories = T.categories.concat("Their-Cat");
    M.boms[0].boards = 4; T.boms.push({id:99, name:"theirs", text:"", boards:1});
    M.log = [{t:"2026-01-02T00:00:00Z", dev:"a", id:1, k:"qty", d:-1}];
    T.log = [{t:"2026-01-01T00:00:00Z", dev:"b", id:2, k:"qty", d:1}, {t:"2026-01-02T00:00:00Z", dev:"a", id:1, k:"qty", d:-1}];
    let r = merge3(B, M, T).db;
    out.p5 = p(5)(r) && p(5)(r).qty; out.p6 = p(6)(r) && p(6)(r).desc; out.p7 = !!p(7)(r);
    out.here = !!r.parts.find(x => x.mpn === "ONLY-HERE"); out.q1 = p(1)(r).qty;
    out.cats = ["Mine-Cat", "Their-Cat", "Inductors"].map(c => r.categories.includes(c));
    out.bom = r.boms.find(b => b.id === M.boms[0].id).boards; out.bom99 = !!r.boms.find(b => b.id === 99);
    out.log = r.log.map(l => l.dev);
    /* the first pull: no base, so every difference is a clash and this machine wins */
    M = normalize(clone(db)); T = normalize(clone(db));
    p(2)(M).box = "A1"; p(2)(T).box = "B1"; p(3)(T).desc = "theirs";
    const nb = merge3(null, M, T);
    out.nb = [p(2)(nb.db).box, p(3)(nb.db).desc === p(3)(M).desc, nb.conflicts.map(c => c.id + ":" + c.k).sort()];
    /* nothing changed anywhere: the parts come back as they were */
    B = normalize(clone(db));
    out.same = JSON.stringify(merge3(B, clone(B), clone(B)).db.parts) === JSON.stringify(B.parts);
    return out;
  });
  check("an edit there beats a delete here", mg2.p5 === 7, mg2.p5);
  check("an edit here beats a delete there", mg2.p6 === "kept here", mg2.p6);
  check("a part deleted here and untouched there stays deleted", mg2.p7 === false);
  check("a part added here only is kept", mg2.here === true);
  check("a quantity never merges below zero", mg2.q1 === 0, mg2.q1);
  check("categories: added on either side kept, removed here removed", eq(mg2.cats, [true, true, false]), mg2.cats);
  check("a board edited here keeps this machine's edit, one added there arrives", mg2.bom === 4 && mg2.bom99, mg2);
  check("the log is the union of both, oldest first, each movement once", eq(mg2.log, ["b", "a"]), mg2.log);
  check("without a base every difference is a clash and this machine's value is kept",
        eq(mg2.nb, ["A1", true, ["2:box", "3:desc"]]), mg2.nb);
  check("merging three equal copies changes no part", mg2.same === true);

  console.log("changes to the data");
  const ac = await page.evaluate(() => {
    const clone = o => JSON.parse(JSON.stringify(o));
    const state = () => JSON.stringify(Object.assign({}, db, {log:null, updated:null}));
    const out = {};
    /* each change does what it says, and its undo puts db back exactly */
    const tryOne = (name, run, effect) => {
      const before = state();
      const r = run();
      const did = effect(r);
      if(r && r.undo) r.undo();
      out[name] = [did, state() === before];
    };
    out.snap = JSON.stringify(db);
    /* saving under a name already there, in another case, replaces that board */
    const s1 = bomSave("Test board", "R1,10k,0402", 3), s2 = bomSave("TEST BOARD", "R1,10k,0402", "x");
    out.bomSave = [s1.updated, s2.updated, db.boms.filter(b => /test board/i.test(b.name)).map(b => b.boards)];
    db.boms = db.boms.filter(b => !/test board/i.test(b.name));
    const b0 = db.boms[0];
    tryOne("bomReserve", () => bomReserve(b0, 2), () => b0.reserve === 2);
    tryOne("bomDelete", () => bomDelete(b0), () => !db.boms.includes(b0));
    tryOne("orderReceive", () => orderReceive([{part:findPart(1), qty:10, lcsc:"", mpn:""},
                                               {part:null, qty:5, lcsc:"c99", mpn:"NEW-ONE"}]),
           r => findPart(1).qty === 490 && r.added === 1 && !!db.parts.find(p => p.lcsc === "C99" && p.id === 30));
    tryOne("partsMerge", () => partsMerge([findPart(1), findPart(2)]),
           r => r.keep.qty === 492 && !findPart(2));
    tryOne("partsSetMfr", () => partsSetMfr([findPart(1), findPart(6)], "ACME"),
           () => findPart(1).mfr === "ACME" && findPart(6).mfr === "ACME");
    tryOne("mfrRename", () => mfrRename("UNI-ROYAL", "Uniroyal"),
           r => r.n > 0 && !db.parts.some(p => p.mfr === "UNI-ROYAL"));
    tryOne("catMoveParts", () => catMoveParts("Resistors", "Capacitors"),
           r => r.n > 0 && !db.parts.some(p => p.cat === "Resistors"));
    tryOne("catDelete", () => catDelete("Resistors"), r => r.err === "Move its parts out first");
    tryOne("catSort", () => catSort(true), () => db.categories[0] !== undefined);
    tryOne("catMoveTo", () => catMoveTo("Diodes", "Resistors", false), () => db.categories[0] === "Diodes");
    tryOne("catMinFill", () => catMinFill(), r => r.n === db.categories.length);
    out.dropNone = catMoveTo("Resistors", "Capacitors", false) === null;   /* it is already above it */
    out.shift = [catShift(db.categories[0], -1), catShift(db.categories[0], 1) && db.categories[1]];
    catShift(db.categories[1], -1);
    out.addTwice = [catAdd("Zeta").err, catAdd("Zeta").err];
    out.rename = [catRename("Zeta", "Resistors").err, catRename("Zeta", "Omega").err, db.categories.includes("Omega")];
    out.del = catDelete("Omega").err === undefined && !db.categories.includes("Omega");
    db = normalize(JSON.parse(out.snap)); delete out.snap; render();
    return out;
  });
  for(const k of Object.keys(ac).filter(k => Array.isArray(ac[k]) && ac[k].length === 2 && typeof ac[k][0] === "boolean" && typeof ac[k][1] === "boolean"))
    check(k + " does its change and undoes it exactly", ac[k][0] && ac[k][1], ac[k]);
  check("saving a board under a name already there, in any case, replaces it",
        eq(ac.bomSave, [false, true, [1]]), ac.bomSave);
  check("a drop where the category already is is no change", ac.dropNone === true);
  check("the first category cannot move up; moving it down moves it", ac.shift[0] === false && !!ac.shift[1], ac.shift);
  check("a category name is refused the second time", eq(ac.addTwice, [undefined, "That category already exists"]), ac.addTwice);
  check("a rename onto an existing name is refused", eq(ac.rename, ["That category already exists", undefined, true]), ac.rename);
  check("an empty category can be deleted", ac.del === true);

  const clicks = await page.evaluate(async () => {
    const out = {};
    const tap = id => document.getElementById(id).click();
    ui.view = "data"; render();
    const was = db.categories.slice();
    tap("catSortAz");
    out.sorted = db.categories.join() === was.slice().sort((x, y) => x.localeCompare(y)).join();
    document.querySelector("#toast .undo").click();
    out.undone = db.categories.join() === was.join();
    ui.view = "bom"; render();
    document.getElementById("bomName").value = "Clicked board";
    document.getElementById("bomText").value = "Designator,Value,Footprint\nR1,10k,0402";
    tap("bomSave");
    const b = db.boms.find(x => x.name === "Clicked board");
    out.saved = !!b && /Saved Clicked board/.test(document.getElementById("toast").textContent);
    if(b){ db.boms = db.boms.filter(x => x !== b); ui.bomName = ""; ui.bomText = ""; }
    ui.view = "parts"; render();
    return out;
  });
  check("Sort A to Z from the Data tab sorts, and its Undo puts the order back", clicks.sorted && clicks.undone, clicks);
  check("Save board from the BOM tab saves it and says so", clicks.saved, clicks);

  const pv = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const av = await page.evaluate(() => APP_VERSION);
  check("package.json and the page carry the same version", pv === av, {package:pv, page:av});

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
    parseScan("c3"), parseScan("C2040"), parseScan("ams1117"), parseScan("C251155 30")
  ]);
  check("an LCSC bag label gives code, part number, quantity and order",
        eq(sc[0], {kind:"lcsc", lcsc:"C25744", mpn:"0402WGF1002TCE", qty:100, order:"SO2309120012"}), sc[0]);
  check("a box label link opens the box", eq(sc[1], {kind:"box", v:"C7"}), sc[1]);
  check("a bare box number opens the box", eq(sc[2], {kind:"box", v:"C3"}), sc[2]);
  check("a bare LCSC code is looked up", sc[3].kind === "lcsc" && sc[3].lcsc === "C2040", sc[3]);
  check("anything else is a search", eq(sc[4], {kind:"q", v:"ams1117"}), sc[4]);
  check("a code typed with the bag's quantity keeps both", sc[5].lcsc === "C251155" && sc[5].qty === 30, sc[5]);
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

  console.log("camera");
  /* the label is drawn by the page's own encoder, so the reader is tested on
     the codes this app prints and on the bags LCSC ships alike             */
  const BAG = "{pbn:PICK2309120041,on:SO2309120012,pc:C25744,pm:0402WGF1002TCE,qty:100,mc:,cc:1,pdi:93118125,hp:0,wc:JS}";
  const bagRows = await page.evaluate(t => qrEncode(t).map(r => r.map(b => b ? "1" : "0").join("")), BAG);
  writeY4m(camFile, bagRows);
  const cam = async (pg) => {
    await pg.evaluate(() => { openScan(); document.getElementById("scanCam").click(); });
    await pg.waitForSelector("#scanIn", {timeout:15000}).catch(() => {});
    const r = await pg.evaluate(() => ({
      found: !!document.getElementById("scanIn"),
      how: (document.getElementById("scanHow") || {}).textContent || "",
      cams: document.querySelectorAll("#scanCamSel option").length,
      text: document.getElementById("scanOut").textContent.replace(/\s+/g, " ").trim()
    }));
    await pg.evaluate(() => closeEditor());
    r.stopped = await pg.evaluate(() => scanStream === null);
    return r;
  };
  const c1 = await cam(page);
  check("a webcam with no BarcodeDetector reads an LCSC bag through jsQR", c1.found && /0402WGF1002TCE/.test(c1.text), c1);
  check("the reader in use is named (" + c1.how.replace(/.*· /, "") + "), and the camera list is filled", /jsQR|built-in/.test(c1.how) && c1.cams >= 1, c1);
  check("closing the sheet stops the camera", c1.stopped);

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
  const ex2 = JSON.parse(fs.readFileSync(path.join(ROOT, "example-components.json"), "utf8"));
  await fp.evaluate(d => { db = normalize(d); render(); }, ex2);
  const c2 = await cam(fp);
  check("the webcam works on a copy opened from the disk, reader loaded from vendor/", c2.found, c2);
  await uctx.close();

  await browser.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
