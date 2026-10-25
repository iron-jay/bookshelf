// On a Goodreads book page: reads the book with extract() (extract.js, the
// bookmarklet's own function) and opens bookshelf's /goodreads-fill with it in
// the address's fragment, which the browser never sends to a server. There
// the book is looked over and added, or an existing one filled in; nothing is
// saved until you say so. Goodreads itself is never contacted beyond the page
// you are already reading.

const BOOK_PATH = /\/book\/show\/\d+/;
const RELOAD_FLAG = "bookshelf-add-after-reload";

async function settings() {
  const stored = await browser.storage.local.get({ server: "", button: true });
  return { server: String(stored.server || "").replace(/\/+$/, ""), button: stored.button !== false };
}

/**
 * Goodreads moves between pages without reloading at times, and the book data
 * in the page is the first page's. Reading a stale page would give the wrong
 * book's details, so reload and carry on afterwards.
 */
function pageHasBook(id) {
  const data = document.getElementById("__NEXT_DATA__");
  return Boolean(data && data.textContent.includes(`"legacyId":${id}`));
}

async function add() {
  const book = extract(document, location.pathname);
  if (!book) {
    alert("Open a book’s page on Goodreads first.");
    return;
  }
  if (!pageHasBook(book.goodreadsId)) {
    sessionStorage.setItem(RELOAD_FLAG, location.pathname);
    location.reload();
    return;
  }
  const { server } = await settings();
  if (!server) {
    alert("Set your bookshelf address first, in this extension’s settings.");
    await browser.runtime.sendMessage({ type: "options" });
    return;
  }
  const url = `${server}/goodreads-fill#book=${encodeURIComponent(JSON.stringify(book))}`;
  await browser.runtime.sendMessage({ type: "open", url });
}

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "add") {
    void add();
    return Promise.resolve(true);
  }
  return undefined;
});

if (sessionStorage.getItem(RELOAD_FLAG) === location.pathname) {
  sessionStorage.removeItem(RELOAD_FLAG);
  void add();
}

// The button on the page: a sage sticker pill, bottom right, in its own
// shadow root so Goodreads' styles leave it alone (and it leaves theirs).
let host = null;

function button() {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    button {
      font: 800 15px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #263034; background: #C9D7B8; border: 2px solid #263034;
      padding: 12px 18px; border-radius: 999px; cursor: pointer;
      transform: rotate(-2deg); box-shadow: 0 3px 0 #1C2427;
    }
    button:active { transform: rotate(-2deg) translateY(2px); box-shadow: 0 1px 0 #1C2427; }
  </style><button type="button">Add to bookshelf</button>`;
  root.querySelector("button").addEventListener("click", () => void add());
  document.documentElement.appendChild(host);
}

async function showOrHide() {
  const want = BOOK_PATH.test(location.pathname) && (await settings()).button;
  if (want && !host) button();
  else if (!want && host) {
    host.remove();
    host = null;
  }
}

void showOrHide();
// Client-side moves between pages, and a change in settings.
let lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    void showOrHide();
  }
}, 1000);
browser.storage.onChanged.addListener(() => void showOrHide());
