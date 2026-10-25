const form = document.getElementById("form");
const server = document.getElementById("server");
const button = document.getElementById("button");
const status = document.getElementById("status");

if (location.hash === "#elsewhere") document.getElementById("elsewhere").style.display = "block";

browser.storage.local.get({ server: "", button: true }).then((stored) => {
  server.value = stored.server;
  button.checked = stored.button !== false;
});

function clean(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Only where bookshelf is: a path after it would be ignored anyway.
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = clean(server.value);
  if (!address) {
    status.textContent = "That address should start with http:// or https://.";
    return;
  }
  await browser.storage.local.set({ server: address, button: button.checked });
  server.value = address;
  status.innerHTML = "";
  status.append("Saved. ", Object.assign(document.createElement("a"), { href: address, target: "_blank", textContent: "Open it to check" }));
});

[server, button].forEach((el) => el.addEventListener("input", () => (status.textContent = "")));
