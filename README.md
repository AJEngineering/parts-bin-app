# Parts Bin

A component inventory for one workbench, in a single HTML file.

No server, no build step, no account, no dependencies. Open `inventory.html` in a browser and it
works — from a hard disk, from a USB stick, or from any address you serve it at. Type an LCSC part
code and the rest of the part fills itself in.

### ▶ [Try it in your browser](https://ajengineering.github.io/parts-bin-app/)

Nothing to install and nothing to sign up for. Press **Load the example bin** on the opening screen
and there is a made-up inventory to poke at — it goes no further than your browser, and your own
data is never involved.

[![The parts list](docs/Parts.png)](https://ajengineering.github.io/parts-bin-app/)

**MIT licensed** — use it, change it, build on it, sell what you make with it. Just keep the
copyright notice with the copies you pass on.

---

## Why

A drawer of components stops being searchable somewhere around the two-hundredth part. You end up
buying a reel of 10 kΩ 0603 you already own, or discovering halfway through a build that the one
regulator you needed went into the last board.

Parts Bin keeps the count, remembers which drawer holds what, tells you whether a board is
buildable before you start it, and works out what to reorder — with the LCSC codes already in the
format their bulk order box accepts.

It is deliberately small and deliberately boring: one file of plain HTML, CSS and JavaScript, with
no framework and nothing to keep up to date.

## Quick start

To keep an inventory rather than just look at one, run your own copy — the hosted page is fine for
that too, but the file is yours and needs nothing from anybody.

1. Download [`inventory.html`](../../releases/latest) — or clone the repo and open the file.
2. Open it in a browser.
3. Go to **Data** and either:
   - press **Connect a data file** and pick a `.json` file on disk — every edit is written to it
     from then on, with nothing to press; or
   - set up [**Sync across computers**](#syncing-through-github) with a private GitHub repository,
     so every machine you open it on shows the same bin.
4. Add your first part, or paste a delivery into **Order → Receive** to book several in at once.

The page ships with no inventory in it. The program and your stock are separate files on purpose —
you can replace either one without touching the other. There is a small
[`example-components.json`](example-components.json) to try it with.

> **Browser note:** the "connect a file" option uses the File System Access API, which currently
> means a Chromium browser (Chrome, Edge, Brave, Opera). Everything else works anywhere; on Firefox
> and Safari, use **Save a copy** / **Load a file**, or the GitHub sync.

## What's in it

| View | What it does |
| --- | --- |
| **Parts** | Search, filter and count what is on the shelf |
| **Boxes** | Which drawer holds what, plus the next free box number |
| **BOM** | Paste a bill of materials and see what you can build right now |
| **BOM → Take it off the shelf** | The picking walk: what to pull, drawer by drawer, then book it all out |
| **Order** | What has run low, ready to paste into the LCSC bulk order box |
| **Duplicates** | The same part entered twice under two different names |
| **Calc ↗** | A link. The bench calculators are their own page now — see below |
| **Log** | Every movement, stamped with the machine that made it |
| **Data** | The data file, GitHub sync, categories, and the LCSC settings |
| **About** | What this is, the licence, and where the source lives |
| **Scan** | An LCSC bag, a box label or a part code, from the camera, a handheld scanner or the clipboard |

**Boxes → Printable labels** lays the drawers out as a printable sheet, one card per box with what
is inside it and a QR code that opens the page on that box.

## Filling a part in from LCSC

Type an LCSC code (`C1779`) into the part editor and press **Fetch** — or just leave the field, and
it looks the part up on its own. The manufacturer part number, manufacturer, package, value,
description and category are read straight off LCSC.

![A part filled in from its LCSC code](docs/AddPart.png)

*Amber marks what the lookup just filled in, datasheet included. The stock and the price on the
line underneath are not written into your bin — they are there to tell you whether the part is
still worth ordering.*

- **Only empty fields are filled.** Anything you have already written is left exactly as it is, and
  what LCSC would have said appears underneath as one click per value, so you take it only if you
  want it.
- **Values follow your own conventions,** not LCSC's running order — a capacitor comes back as
  `25V 4.7uF X5R ±10%`, an inductor as `8.5A 3.3uH ±20% 22mΩ`, a resistor as `10kΩ`. Parts that do
  not have a value in the usual sense — an MCU, a regulator, a MOSFET — are left blank, on purpose.
- **Categories are matched onto the ones you already have.** A new category is never invented for
  you; an N-channel MOSFET lands in your `MOSFET N-CH` shelf if you have one, and nowhere if you
  don't.

### Finding the code from a part number

Plenty of parts were entered with only a manufacturer part number. **Find code** — the button beside
that field in the screenshot above — searches LCSC for it and offers what comes back.

The search is treated as a guess, because it is one. LCSC answers a part number it does not carry
with near neighbours: searching `0603SAF8204T5E` returns `0603WAF8204T5E`, a different tolerance
and the wrong part to write into a bin. So every candidate is read back through the part endpoint
and its real part number compared with the one asked for. Exact matches and near misses are listed
separately, nothing is written, and you pick.

**Data → Parts with a part number but no LCSC code** does the same for every such part in one pass.
Only exact part-number matches are offered, the supplier field is never touched (you may have bought
the part elsewhere), and nothing is written until you have seen the list.

### Catching up parts you already entered

![The data view](docs/Data.png)

**Data → Filling a part in from LCSC** counts how many parts carry an LCSC code but still have a
field blank, and **Read N parts off LCSC** goes through them in one pass, with a progress count
that can be stopped part-way.

Nothing is written until you have seen the list: the run only *proposes* fills, you look at the
table, and **Fill in N parts** applies them — with a single **Undo** that puts back exactly the
fields it changed. A part with no value is not treated as missing, since an MCU or a MOSFET has
none and never will.

The same pass keeps the datasheet link and the unit price at LCSC's smallest price break. The price
gives **Data** a stock value and the saved boards a cost per board; it can also be typed into the
part editor by hand.

### Pictures

Every part can show a photo, in a fixed square at the start of its row. **Fetch** in the part
editor saves the picture along with everything else when the part has none yet, and **Data →
Pictures → Fetch N pictures** does every part that carries an LCSC code but no picture, in one pass.

LCSC's photos are 900×900 with the part small in the middle, so each one is trimmed to the part,
drawn at the same fill into a 256×256 square on white, and saved as WebP (JPEG on Safari) — about
10 KB each. The picture is kept in two places:

- **this browser** (IndexedDB), so it shows at once and offline;
- **the repository**, as `images/C1779.webp` beside the inventory file, pushed as one commit per
  batch. Another machine reads it from there the first time it needs it, then keeps its own copy.

The part itself only carries the path in its `img` field. Without GitHub sync the pictures stay in
the browser that fetched them; **Data → Pictures** counts the ones not yet pushed and pushes them once
sync is set up. A part with no LCSC code can take any image link pasted into its **Picture** field.

The photo is fetched through the same relays as the lookup. A relay of your own needs
`assets.lcsc.com` on its list of allowed hosts — it is in the code below.

### About the relay

LCSC serves this data to anyone but does not send an `Access-Control-Allow-Origin` header, so a
browser will not hand the reply to a page at another address. The request therefore travels through
a relay. That is already arranged and needs nothing from you — **Data → Test it on C1779** names
whichever relay answered. A relay only ever sees the part code being looked up.

The [hosted demo](https://ajengineering.github.io/parts-bin-app/) uses a relay of the project's
own, so that trying it works first time. A copy you download falls back to free public relays,
which are slower and go quiet now and then.

### A relay of your own

If you are going to rely on this, five minutes and a free Cloudflare account gets you one that is
never busy — and it unlocks the better part-number search, because it can forward a `POST`.

Make a Worker at **Workers & Pages → Create → Create Worker**, paste this, deploy:

```js
export default {
  async fetch(req) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept",
      "Access-Control-Max-Age": "86400"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const target = new URL(req.url).searchParams.get("url");
    if (!target) return new Response("missing url", { status: 400, headers: cors });

    // Only these hosts. An open proxy is found and abused within days.
    let host;
    try { host = new URL(target).hostname; }
    catch { return new Response("bad url", { status: 400, headers: cors }); }
    if (!["wmsc.lcsc.com", "www.lcsc.com", "assets.lcsc.com", "jlcpcb.com"].includes(host))
      return new Response("host not allowed", { status: 403, headers: cors });

    const init = {
      method: req.method,
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json",
                 "Referer": "https://www.lcsc.com/" }
    };
    if (req.method === "POST") {
      init.body = await req.text();
      init.headers["Content-Type"] = "application/json";
    }
    const r = await fetch(target, init);
    return new Response(await r.arrayBuffer(), {
      status: r.status,
      headers: { ...cors, "Content-Type": r.headers.get("content-type") || "application/json" }
    });
  }
};
```

Then put its address into **Data → If the lookup ever stops working**, with `{url}` on the end:

```
https://your-worker.your-name.workers.dev/?url={url}
```

**Test it on C1779** should answer *“answered by your relay”*. The free tier is 100,000 requests a
day, which no bench will come close to.

> **Why part-number search prefers JLCPCB.** LCSC have no search endpoint open to anyone else, so
> the only way in is to render their search page and read the links off it — and a page assembled
> in the browser is a poor thing to scrape, since the relay hands back whatever it looked like when
> it stopped waiting. JLCPCB index the same catalogue and answer in JSON, which has no such failure
> mode. When a search does come back empty the message says the page may have been read too early,
> rather than claiming the part does not exist. Entering the code directly always works.

## Boxes and drawers

![The box wall](docs/Boxes.png)

The wall down the side is the drawers, sized by how full they are. Clicking one filters the list to
it; the dashed tile at the end is the first number not in use.

### Adding a whole drawer at once

Click that dashed **free** tile. The part editor opens with the box number already filled in, and
**Save and add another** keeps the box and the category while clearing the rest — so a new drawer
can be filled without the form closing once. Combined with the LCSC lookup, adding a part is:
paste code → **Fetch** → **Save and add another**.

### Labels with a QR code

Each printed card carries a QR code linking to `inventory.html#box=C7`. Scan it with **Scan** or
with any phone camera and the page opens on that drawer. The code holds the page's own address, so
print the labels from the copy you actually use (GitHub Pages, say). A page opened off the disk
has no web address to give; type the address into the field on the labels page and the codes use
that. The tick box there turns the codes off.

The same links work typed or bookmarked: `#box=C7` opens a drawer, `#part=12` opens a part,
`#q=10k 0603` runs a search.

## Scanning

**Scan**, next to the search box, takes whatever a scan produces:

- **An LCSC bag.** The QR code on the bag label carries the LCSC code, the part number, the
  quantity and the order number. A part already in the bin shows its drawer, its stock, what is on
  order and which saved boards use it, with **Book in** (the bag's quantity, editable) and
  **Take out** one press away, each with an Undo. A part not in the bin yet opens the part editor
  with the code, part number and quantity filled in, and reads the rest off LCSC.
- **One of your box labels.** Opens the parts list on that drawer.
- **A bare LCSC code, a box number, or anything else.** Looked up, or searched for.

The phone or laptop camera works where the browser can read codes (`BarcodeDetector`: Chrome on
Android, Chrome and Edge on macOS), and only on an `https://` or `localhost` address. A handheld
USB or Bluetooth scanner works in every browser: it types into the field and presses Enter, like a
keyboard. Pasting a label's text works too.

## Checking a bill of materials

![The BOM view](docs/Bom.png)

Paste a BOM straight out of KiCad, Altium or a spreadsheet — CSV, semicolons or tabs. A header row
is detected on its own. It tells you what is in stock, what is short, what is not in the bin at
all, and how many boards you could build right now.

### How a line is matched

A part number names one part. A value does not: the matcher reduces `25V 4.7uF X5R ±10%` to a
single magnitude before comparing, so the voltage, the tolerance and the dielectric fall out on the
way and a 50V ±20% part answers to a 25V ±10% line. On a decoupling cap that is nothing; on a
divider setting a feedback voltage it is the wrong part. So it is a choice, made above the results:

| Mode | What it does |
| --- | --- |
| **part number, then value + package** | Falls back to value and package when a line has no number |
| **part number only** | A line matches its own part number or LCSC code, or not at all — nothing is inferred from the shelf |

Where a match is still made on value, the matched part's own wording is shown in amber, so a
mismatch is visible rather than silent. And where several parts share a value and the line names no
footprint, nothing is matched at all — a bin holding 1kΩ in 0603, 1206 and 0805 would otherwise
hand back whichever was entered first, and the exported file would carry that part's number and
that footprint.

**What it landed on** is written under the matched part number: the package always, and the part's
own wording for the value in amber where that differs from the line's. The package is the half that
decides whether a match is the right one — an ambiguous value is refused *because* 1 kΩ comes in
0603, 0805 and 1206 — so when a line does match, the drawer it chose is worth seeing without
opening anything. The part's full description is on the cell as a tooltip, which costs no width in
a table that already runs to nine columns.

### Sending it to a board house

**Send it to a fab** exports the checked BOM for **JLCPCB**, **PCBWay**, **NextPCB** or **PCBGOGO**.
The column headings are taken from each house's own template, so the file goes up without being
rearranged first — NextPCB stars its required columns, PCBGOGO leads with the quantity and asks for
a buying link, which is filled with the part's LCSC page.

JLCPCB is the exception and the easiest of the four: it wants `Comment`, `Designator`, `Footprint`
and `LCSC Part #`, and picks the part out of its own library by that code — which is the one number
every part in this bin already carries. The other three source from the manufacturer's part number,
so for those a line holding only a supplier code has to be filled in first.

Files are written as real **`.xlsx`** workbooks, not CSV. A CSV is read back by Excel as numbers,
and `0402` loses its leading zero the moment the fab opens it; in a sheet the cell stays text.

A fab sources from the manufacturer's part number, not a supplier code, so a line carrying only
`C1779` is useless to them. **Fill N part numbers from LCSC** reads the missing ones off LCSC and
writes them onto the lines. Lines that matched something already on your shelf take the
manufacturer and description from there. Anything still without a number — a connector LCSC has
never heard of, a part from another supplier — gets a box under the buttons to type it into, and it
goes into the file.

Mounting type is only written where the package says so plainly. `TO-220` is through-hole and
`TO-252` is not; `DO-41` is through-hole and `DO-214` is not; `Plugin` is LCSC's word for
through-hole. Anything that does not say outright is left blank rather than guessed, because an SMD
part labelled through-hole costs a panel.

Footprints keep their leading zero. A spreadsheet treats `0402` as a number and hands back `402`,
which tells a fab nothing — so a three-digit footprint that is really a chip size is padded back
out, whether it arrives in a pasted BOM, gets typed into the editor, or is already sitting in your
data file.

### Holding parts for a board

A saved board can be **reserved** for a number of boards. Its parts stay on the shelf but stop
counting as free: every other BOM, the low-stock check and the Order list see only what is left,
and each part row shows how many pieces are held. Picking the board releases what it used, and
**release** gives the rest back.

### Which boards use a part

Every part a saved board calls for shows that board on its row, and the part editor lists each
board with how many go on one, and how many are held. Each name opens that board in the BOM tab.
Deleting such a part says which boards would lose a line first.

### Building it yourself — the picking walk

Sending the board out is one direction. **Take it off the shelf** is the other, and it sits under
the fab exports on the same tab: what to pick, drawer by drawer, for however many boards you set.

The list has **one row per drawer, not per line.** A part written `C1:150 + C2:100` and needed 200
times is two stops on the walk, not one, and the rows are sorted by box number so you go along the
shelf once and never double back. Lowest drawer first.

**Print the walk** prints that table and its counters alone — the pasted BOM, the fab panel and the
rest of the working material stay off the sheet you carry to the shelf.

Every row has a tick box, on screen and on paper, and **what you tick is what leaves the bin**. The
list starts empty because the printed sheet has to start empty: you tick a drawer once the part is
in your hand. A drawer you open and find empty is simply left unticked, and nothing is deducted for
it. The box at the head of the column ticks the whole walk at once, and shows a dash while you are
part-way through.

**Take N off the shelf** then books out exactly what is ticked:

- One movement per part in the log, not one per drawer. A part taken from two drawers left the
  shelf once.
- A line short of stock is picked as far as the shelf goes and marked with what is missing.
  Nothing is taken for a line that is not in the bin at all.
- Explicit box counts are rewritten. `C1:150 + C2:100` with 150 taken from C1 becomes
  `C1:0 + C2:100` — the drawer is kept at zero rather than dropped, because the part still lives
  there and will be refilled. A box written without a count says *where* the part is, not how many,
  so it is left exactly as it was.
- One **Undo**, which puts back the quantities and the box notation together.

## Reordering

![The order view](docs/Order.png)

**Order** gathers the shortfalls from the last BOM run and everything at or below its own alert
level — the part's own level, or its category's when it has none (set under **Data → Categories**,
with suggested starting levels one click away), or 2. **Copy for LCSC bulk order** puts it on the clipboard in the two-column form their bulk box
accepts, so reordering is a paste. Lines with no LCSC code are counted separately, since those have
to be ordered by part number.

**Order → Receive** takes the delivery note back: paste the supplier's CSV, check it, and book the
lot in at once. Parts already on the shelf have their quantity added; anything new is created and
only needs a box.

### Setting the quantity yourself

Every line's quantity is an editable box. The worked-out figure is only a suggestion, and it says so
when you order **less** than it proposed — **suggested 95** appears beside the line and puts it back
in one click. Ordering more says nothing, because buying a bigger reel than you strictly need is a
decision rather than a slip.

A line changed to **0** is left out of both exports and out of the piece count, which is how you say
*not this time* without deleting anything.

A **Description** column sits beside the value in both this list and the one below it, because a
part number alone is a poor way to recognise what you are about to buy. Where a part carries no
description its package stands in, and a line for something the bin has never seen has neither.

If what you order would still leave the part at or below its own alert level, the line says so with
the arithmetic rather than just a complaint:

> still low after this: 5 + 10 = 15, alert at 50

That test is against the shelf the delivery lands on, not against the number on its own — ordering
five when the alert level is fifty is perfectly sensible if fifty are already in the drawer.

### Ordered, not yet here

**Mark as ordered** moves the list to an **On order** panel and out of the shopping list, so the same
reel is not bought twice: anything already on its way is subtracted from what the list proposes next
time, and a line fully covered by an outstanding order disappears from it.

Each waiting line carries a **box** — where that part will go when it arrives. A part already on a
shelf offers the drawer it is in; one the bin has never seen starts blank, and the panel counts how
many are still unanswered.

The **Description** beside it is the one already on the part, which is what tells one bag of black
plastic from another when the envelope is opened. A part the bin has never seen has no description
to show, so its package stands in where one is known.

**Book in N pieces** puts the whole delivery on the shelf in one press: quantities added, boxes
applied, parts the bin had never seen created in the category the order carried. One movement per
part in the log, and a single **Undo** that takes it all back off again — the created parts included.

A line can be dropped from a waiting order, or the whole order cancelled, in which case its lines
return to the shopping list.

## Calculators — now their own project

![The calculators](docs/Calc.png)

Twenty-nine bench formulas — dividers, regulators, MOSFET losses, wire gauge, RC and LC, resistor
colour bands, SMD code decoding — each drawn as a schematic that updates as you type.

They used to live inside this file, where they were roughly a third of it and touched the inventory
exactly once. They are now **[Circuit Calcs](https://github.com/AJEngineering/circuit-calcs)**, a
single HTML file of their own:

**[ajengineering.github.io/circuit-calcs →](https://ajengineering.github.io/circuit-calcs/)**

The **Calc** tab is a link that opens it in a new tab. Nothing is loaded across, so this page still
makes no network request of its own — and if you work offline, download `calc.html` next to
`inventory.html` and both work with the wire pulled out.

The one thing the split cost: a computed value no longer tells you how many of that part are on
your shelf. That note needed a shelf to look at.

## The log

![The movement log](docs/Log.png)

Every add, edit, deletion and stock change, stamped with the machine that made it. Name each
machine under **Data → This computer**, and the log tells you which bench did what.

## Search

The field at the top filters as you type. Several words all have to match, in any field.

| Query | Meaning |
| --- | --- |
| `10k 0603` | both words, any field |
| `mfr:murata` | one field only — `mfr`, `box`, `cat`, `pkg`, `lcsc`, `mpn`, `val`, `desc`, `src` |
| `qty<10` | compare stock: `<` `>` `<=` `>=` `=` |
| `no:value` | the field is empty — also `no:box`, `no:lcsc`, `no:mfr`, `no:pkg`, `no:min` |
| `has:mfr` | the field is filled in |
| `cat:MCU qty<5` | mix them freely |
| `/` | jump to the search field from anywhere |

## Box notation

One box: `C7`. Two boxes with the quantity shared equally: `C1 + C6`. An exact split:
`C1:25 + C6:20`. The box view uses the same rules.

## Categories

Under **Data → Categories** a category can be dragged to where it belongs, nudged a step with the
arrows, or the whole list ordered in one click — alphabetically, or fullest first. Both are
undoable.

That order is the one used everywhere else: the rail down the side, the dropdown in the part
editor, and the parts list when it is sorted by category. Put the shelves you reach for most at the
top; a bench is not usually arranged alphabetically.

Each category also carries an **alert at** level, used for every part in it that has no alert level
of its own.

## Syncing through GitHub

If you use more than one machine — a bench PC and a laptop, say — a private GitHub repository can
hold the inventory file and every machine will show the same bin. Every save is an ordinary commit,
so you get the full history for free, and GitHub refuses a push that would overwrite a newer one.

### 1. Make a private repository for your data

This is **not** the repository the program lives in — it holds only your `components.json`. Create
an empty private repo, for example `yourname/my-parts`. You do not need to add any files to it;
the first push creates the file.

### 2. Make a fine-grained access token

On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token**.

| Field | Set it to |
| --- | --- |
| Repository access | **Only select repositories** → the one you just made |
| Permissions → Repository → **Contents** | **Read and write** |
| Expiration | your choice — you will need a new token when it lapses |

Contents is the only permission needed. Generate it and copy the token; GitHub shows it once.

### 3. Point the app at it

Open **Data → Sync across computers** and fill in:

| Field | Example |
| --- | --- |
| Repository | `yourname/my-parts` |
| File path | `components.json` |
| Branch | `main` |
| Access token | the token you just copied |

Then press **Pull from GitHub** once. A machine has to pull before it is allowed to push — that is
what stops a fresh browser with an empty bin from wiping the real one. If the file does not exist
yet you will be told so; press **Push to GitHub** to create it.

Tick **sync automatically** and every later change is pushed on its own.

### On the second machine

Open the same `inventory.html`, enter the same repository, path, branch and a token, and press
**Pull from GitHub**. The bin appears. From then on both machines stay level.

### How conflicts are handled

Each browser remembers when it holds changes GitHub has not seen yet, even across a closed tab or a
lost connection, and keeps the copy it last agreed with GitHub. A pull with changes outstanding is
then *merged* three ways instead of replacing them:

- a field changed on one machine only takes that machine's value;
- a quantity changed on both adds both movements up (100 → 90 here, 100 → 95 there, lands on 85);
- parts added or deleted on either side are kept added or deleted;
- a field changed differently on both keeps this machine's value and is listed under **Data**, one
  click to take GitHub's instead.

The movement log is always merged, so entries from another computer are never lost. If another
machine pushed first, the push merges and tries again on its own. **Force push** is still there
if you are certain yours is the copy to keep.

### Mixing versions

The data file records the version of the page that last saved it. From 2.3.0 on, a page that finds
its data saved by a *newer* version keeps every field it does not know, holds its automatic pushes,
and asks before a manual one; the chip at the top says **push held**. Reloading on a hosted copy
normally brings the newer page. A page older than 2.3.0 has no such check and drops fields it does
not know when it pushes, so update every machine that syncs to the same repository.

## Installing it as an app

Opened from an `https://` address such as GitHub Pages, the page can be installed: **Install** in
the address bar on Chrome and Edge, **Add to Home Screen** on a phone. It then opens in its own
window and starts without a network, from the last copy it saw. With a network it always loads the
newest page. Only the page's own files are kept for offline use; GitHub and LCSC are never cached,
and the inventory itself stays where it always was, in the browser and in your data file or
repository. Edits made offline wait as unpushed changes and go out when the connection returns.

The single downloaded `inventory.html` keeps working exactly as before. It needs none of the extra
files, which only matter when the page is served from a site.

## Staying up to date

Once a day the page asks GitHub for the latest release. When it is newer than the page, a bar along
the top says so: a copy opened from the disk offers that release's `inventory.html` to download, and
a copy served from a site offers **Reload to update** as soon as the site carries the newer page. A
tab left open for days asks the site again when it comes back into view, and the newer page is kept
for offline use on the way. **not now** hides the bar until the next version; **About → Check now**
asks straight away. Offline or refused, the check says nothing.

## Your data

The parts live in a `.json` file you control — on your disk, or in a private repository of your
own. Nothing is uploaded anywhere else and there is no analytics of any kind. The page reaches out
only for the LCSC lookup when you ask for it, to your own repository when sync is on, and once a day
to GitHub's public release list to see whether a newer version is out. That last request carries no
token and nothing about your bin, and **About → Tell me when a newer version is out** turns it off.

The access token is kept in that browser's local storage and is never written into the inventory
file, so it cannot leak through a synced or exported copy. Anyone using that computer profile can
read it, though — scope it to the one repository, and revoke it if the machine changes hands.

## Contributing

Issues and pull requests are welcome. It is one file — open it in an editor and the whole program
is in front of you, with the reasoning written in the comments.

The tests load the page in headless Chromium and check the parts that decide what ends up in your
data: value and BOM matching, the three-way sync merge, unknown fields and the version guard, scan
parsing, that every QR label decodes, that the page opens offline, and the update check. They run on every push.

```sh
npm install
npx playwright install chromium
npm test
```

## Licence

[MIT](LICENSE) © Abdullah Jalloul

Part data is read from [LCSC](https://www.lcsc.com/), who publish it. This project is not
affiliated with or endorsed by LCSC.
