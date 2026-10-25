# bookshelf for Goodreads (Firefox extension)

An **Add to bookshelf** button on Goodreads book pages, for Firefox on a
computer and Firefox for Android. It replaces the bookmarklet, which a phone
makes awkward to install and run.

On a book's page, press the button (bottom right). bookshelf opens in a new tab
with the book's details from that page: title, authors, year, summary, series
and number, cover, Book or Audiobook, and the ISBN to find it by. There:

- **A book not on your shelf yet** is found the way the Goodreads import finds
  books (an edition here with that ISBN, then Open Library by ISBN, then by
  title and author, then Hardcover, else a book of its own). You look over the
  details, pick the shelf and Book or Audiobook, and press **Add to shelf**.
  Nothing is saved before that. The new edition remembers its Goodreads page
  and gets that page's cover.
- **A book already on your shelf** (linked to that Goodreads page, or with its
  ISBN) gets the bookmarklet's fill-in instead: empty description, year, series
  and cover filled from the page, on **Apply**.

The extension reads only the page you are looking at, in your browser. It sends
the details to your bookshelf's address and nowhere else, and it never contacts
Goodreads itself. It asks for one permission, storage, for that address.

Without the page button (it can be turned off in the extension's settings), use
the toolbar button, or on a phone: menu → Extensions → bookshelf for Goodreads.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Manifest v2, which Firefox supports on Android and desktop alike. |
| `content.js` | Runs on goodreads.com: the button, and opening bookshelf. |
| `extract.js` | Reads the page. **Generated** from `lib/goodreads-bookmarklet.ts` with `npm run extension:extract`, so the bookmarklet and the extension read pages the same way. The image build runs `npm run check:extension`, which fails if this copy is out of date. |
| `background.js` | Opens the tab, and answers the toolbar button. |
| `options.html`, `options.js` | The settings page: your bookshelf's address, and the page button. |
| `icons/` | The sage "B" sticker, drawn from `app/icon.svg`. |

## Signing it (once per version)

Firefox only installs extensions Mozilla has signed, and Firefox for Android has
no way around that. Signing as **unlisted** ("on your own") keeps it off the
public add-ons site: Mozilla's automatic checks sign it within minutes, and you
get an `.xpi` file to install wherever you like. It needs a free
addons.mozilla.org account.

Either way, first make the zip from the repository's root:

```bash
npm run extension:zip     # writes dist-extension/bookshelf_for_goodreads-<version>.zip
```

**In the browser (simplest):**

1. Sign in at <https://addons.mozilla.org/developers/> and choose **Submit a
   New Add-on**.
2. Choose **On your own** (unlisted), then upload the zip.
3. If asked about source code: no, nothing in it is minified or built.
4. When it is signed (the page says so, usually within a few minutes), open the
   version and download the `.xpi`.

**From the command line:** make API credentials once at
<https://addons.mozilla.org/developers/addon/api/key/>, then

```bash
npx web-ext@8 sign --source-dir extension --artifacts-dir dist-extension \
  --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

which waits for the signature and saves the `.xpi` in `dist-extension/`.

## Installing it

**Firefox for Android:**

1. Get the `.xpi` onto the phone (download it, or send it to yourself).
2. In Firefox: **Settings → About Firefox**, and tap the Firefox logo five
   times, until it says the debug menu is on.
3. Back in **Settings**, choose **Install extension from file** (near the
   bottom), pick the `.xpi`, and **Add**.
4. **Menu → Extensions → Manage extensions → bookshelf for Goodreads →
   Settings**: type the address you open bookshelf at on this phone (as the
   address bar shows it, for example `http://192.168.1.20:3001`) and Save.

**Firefox on a computer:** open `about:addons`, the gear menu → **Install
Add-on From File…**, and pick the `.xpi` (or drag it onto a Firefox window).
Then the extension's **Preferences** (the ⋯ beside it) for the address.

If sign-in is on, sign in to bookshelf in that browser first.

## A new version

Change what needs changing, raise `version` in `manifest.json` (Mozilla refuses
a version it has signed before), make the zip and sign it as above, and install
the new `.xpi` over the old one: the address you saved is kept. An unlisted
extension does not update itself.

Trying a change on a computer before signing: `about:debugging` → This Firefox
→ **Load Temporary Add-on…** → `extension/manifest.json`. It lasts until
Firefox restarts. `npx web-ext@8 lint --source-dir extension` checks it the
way Mozilla's signing will.
