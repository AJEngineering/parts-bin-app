# Parts Bin

A component inventory for one workbench, in a single HTML file.

No server, no build step, no account, no dependencies. Open `inventory.html` in a browser and it
works — from a hard disk, from a USB stick, or from any address you serve it at. Type an LCSC part
code and the rest of the part fills itself in.

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

1. Download [`inventory.html`](inventory.html).
2. Open it in a browser.
3. Go to **Data** and either:
   - press **Connect a data file** and pick a `.json` file on disk — every edit is written to it
     from then on, with nothing to press; or
   - set up [**Sync across computers**](#syncing-through-github) with a private GitHub repository,
     so every machine you open it on shows the same bin.
4. Add your first part, or paste a delivery into **Order → Receive** to book several in at once.

The page ships with no inventory in it. The program and your stock are separate files on purpose —
you can replace either one without touching the other.

> **Browser note:** the "connect a file" option uses the File System Access API, which currently
> means a Chromium browser (Chrome, Edge, Brave, Opera). Everything else works anywhere; on Firefox
> and Safari, use **Save a copy** / **Load a file**, or the GitHub sync.

## Filling a part in from LCSC

Type an LCSC code (`C1779`) into the part editor and press **Fetch** — or just leave the field, and
it looks the part up on its own. The manufacturer part number, manufacturer, package, value,
description and category are read straight off LCSC.

- **Only empty fields are filled.** Anything you have already written is left exactly as it is, and
  what LCSC would have said appears underneath as one click per value, so you take it only if you
  want it.
- **Values follow your own conventions,** not LCSC's running order — a capacitor comes back as
  `25V 4.7uF X5R ±10%`, an inductor as `8.5A 3.3uH ±20% 22mΩ`, a resistor as `10kΩ`. Parts that do
  not have a value in the usual sense — an MCU, a regulator, a MOSFET — are left blank, on purpose.
- **Categories are matched onto the ones you already have.** A new category is never invented for
  you; an N-channel MOSFET lands in your `MOSFET N-CH` shelf if you have one, and nowhere if you
  don't.

### Catching up parts you already entered

**Data → Filling a part in from LCSC** counts how many parts carry an LCSC code but still have a
field blank, and **Read N parts off LCSC** goes through them in one pass. It shows a progress
count and can be stopped part-way.

Nothing is written until you have seen the list: the run only *proposes* fills, you look at the
table, and **Fill in N parts** applies them — with a single **Undo** that puts back exactly the
fields it changed. A part with no value is not treated as missing, since an MCU or a MOSFET has
none and never will.

### About the relay

LCSC serves this data to anyone but does not send an `Access-Control-Allow-Origin` header, so a
browser will not hand the reply to a page at another address. The request therefore travels through
a relay. That is already arranged and needs nothing from you — **Data → Test it on C1779** names
whichever relay answered. If one ever goes quiet, you can paste a stand-in without editing the
file. A relay only ever sees the part code being looked up.

## What's in it

| View | What it does |
| --- | --- |
| **Parts** | Search, filter and count what is on the shelf |
| **Boxes** | Which drawer holds what, plus the next free box number |
| **BOM** | Paste a bill of materials and see what you can build right now |
| **Order** | What has run low, ready to paste into the LCSC bulk order box |
| **Duplicates** | The same part entered twice under two different names |
| **Calc** | Everyday bench formulas, each with its schematic drawn |
| **Log** | Every movement, stamped with the machine that made it |

### Adding a whole drawer at once

Click the dashed **free** tile at the end of the box wall. The part editor opens with that box
number already filled in, and **Save and add another** keeps the box and the category while
clearing the rest — so a new drawer can be filled without the form closing once. Combined with the
LCSC lookup, adding a part is: paste code → Fetch → Save and add another.

### Sending a BOM to a board house

After checking a BOM against the bin, **Send it to a fab** exports it for **PCBWay**, **NextPCB**
or **PCBGOGO**. The column headings are copied from each house's own template, so the file goes up
without being rearranged first — NextPCB stars its required columns, PCBGOGO leads with the
quantity and asks for a buying link, which is filled with the part's LCSC page.

A fab sources from the manufacturer's part number, not a supplier code, so a line carrying only
`C1779` is useless to them. **Fill N part numbers from LCSC** reads the missing ones off LCSC and
writes them onto the lines. Lines that matched something already on your shelf take the
manufacturer and description from there. Anything still without a number — a connector LCSC has
never heard of, a part from another supplier — gets a box under the buttons to type it into, and
it goes into the file.

Mounting type is only written where the package says so plainly. `TO-220` is through-hole and
`TO-252` is not; `DO-41` is through-hole and `DO-214` is not; `Plugin` is LCSC's word for
through-hole. Anything that does not say outright is left blank rather than guessed, because an
SMD part labelled through-hole costs a panel.

Footprints keep their leading zero. A spreadsheet treats `0402` as a number and hands back `402`,
which tells a fab nothing — so a three-digit footprint that is really a chip size is padded back
out, whether it arrives in a pasted BOM, gets typed into the editor, or is already sitting in your
data file.

### Search

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

### Box notation

One box: `C7`. Two boxes with the quantity shared equally: `C1 + C6`. An exact split:
`C1:25 + C6:20`. The box view uses the same rules.

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

Parts follow the last machine that pushed. The movement log is *merged* rather than replaced, so
entries made on another computer are never lost. If someone else pushed while your tab sat idle,
your push is refused and you are told to pull first — **Force push** is there if you are certain
yours is the copy to keep.

Give each machine a name under **Data → This computer**; every movement in the log is stamped with
it, so you can see which bench did what.

## Your data

The parts live in a `.json` file you control — on your disk, or in a private repository of your
own. Nothing is uploaded anywhere else and there is no analytics of any kind. The only outbound
request the page ever makes is the LCSC lookup, and only when you ask for it.

The access token is kept in that browser's local storage and is never written into the inventory
file, so it cannot leak through a synced or exported copy. Anyone using that computer profile can
read it, though — scope it to the one repository, and revoke it if the machine changes hands.

## Contributing

Issues and pull requests are welcome. It is one file — open it in an editor and the whole program
is in front of you, with the reasoning written in the comments.

## Licence

[MIT](LICENSE) © Abdullah Jalloul

Part data is read from [LCSC](https://www.lcsc.com/), who publish it. This project is not
affiliated with or endorsed by LCSC.
