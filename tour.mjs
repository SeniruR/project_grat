import { existsSync } from "node:fs";
import { chromium } from "playwright";

const APP = "http://localhost:5173";
const ZIP = "C:\\Users\\senir\\Downloads\\Thank You {{name}} (4).zip";

if (!existsSync(ZIP)) {
  console.error("ZIP not found:\n" + ZIP);
  process.exit(1);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installCursor(page) {
  await page.addInitScript(() => {
    const paint = () => {
      if (document.getElementById("tour-cursor")) return;
      const cursor = document.createElement("div");
      cursor.id = "tour-cursor";
      cursor.innerHTML =
        '<svg width="28" height="28" viewBox="0 0 28 28" style="display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.45))"><path d="M4 2 L4 22 L10 17 L14 25 L17 23 L13 15 L21 15 Z" fill="#111" stroke="#fff" stroke-width="1.4"/></svg>';
      cursor.style.cssText =
        "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-2px,-2px);";
      document.documentElement.appendChild(cursor);
      window.addEventListener(
        "mousemove",
        (event) => {
          cursor.style.left = event.clientX + "px";
          cursor.style.top = event.clientY + "px";
        },
        true,
      );
    };
    paint();
    document.addEventListener("DOMContentLoaded", paint);
    try {
      localStorage.setItem("gratitude-site-theme", "open");
    } catch {
      /* ignore */
    }
    const hideTheme = document.createElement("style");
    hideTheme.textContent = ".theme-switcher{display:none !important}";
    document.documentElement.appendChild(hideTheme);
  });
}

async function point(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not see a control to click");
  const x = box.x + Math.min(box.width / 2, 28);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 28 });
  await pause(220);
  return { x, y };
}

async function clickVis(page, locator) {
  const { x, y } = await point(page, locator);
  await page.mouse.click(x, y);
  await pause(350);
}

async function typeVis(page, locator, text) {
  await clickVis(page, locator);
  await page.keyboard.press("Control+A");
  await pause(80);
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text, { delay: 65 });
  await pause(400);
}

async function signOut(page) {
  await clickVis(page, page.locator(".account-trigger"));
  await clickVis(page, page.getByRole("menuitem", { name: "Sign out" }));
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
}

async function signIn(page, role) {
  if (role) {
    await page.route("**/auth/dev-login", async (route) => {
      const body = route.request().postDataJSON() ?? {};
      await route.continue({
        postData: JSON.stringify({ ...body, role }),
      });
    });
  }
  await typeVis(page, page.getByLabel("Employee number"), "100001");
  await typeVis(page, page.getByLabel("Office email"), "admin@example.com");
  await clickVis(page, page.getByRole("button", { name: "Continue" }));
  await page.locator(".account-trigger").waitFor();
  if (role) await page.unroute("**/auth/dev-login");
  await pause(800);
}

function shelfCard(page, name) {
  return page
    .locator("article.marketplace-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .locator("button.marketplace-card-preview");
}

async function addPerson(page, email, displayName, title) {
  const addAnother = page.getByRole("button", { name: "+ Add another" });
  if (await addAnother.isVisible()) {
    await clickVis(page, addAnother);
  }
  const titleSelect = page.locator("select.recipient-prefix-select");
  await titleSelect.waitFor();
  await clickVis(page, titleSelect);
  await titleSelect.selectOption({ label: title });
  await pause(300);
  const box = page.getByPlaceholder("type name or email");
  await typeVis(page, box, email);
  await pause(900);
  await clickVis(
    page,
    page
      .locator(".recipient-hits")
      .getByRole("button", { name: displayName, exact: false })
      .filter({ hasText: email }),
  );
}

const browser = await chromium.launch({
  headless: false,
  channel: "msedge",
  args: ["--start-maximized"],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await installCursor(page);
await page.goto(`${APP}/login`);
await page.bringToFront();
await page.keyboard.press("F11");
await pause(1200);

await signIn(page, "DESIGNER");

await clickVis(page, page.getByRole("banner").getByRole("link", { name: "My designs" }));
await pause(1200);
await clickVis(page, page.getByRole("link", { name: "Add New card" }));
await page.getByRole("heading", { name: "New card" }).waitFor();
await pause(900);

await clickVis(page, page.getByText("Import from Canva", { exact: true }));
await pause(600);
await typeVis(page, page.getByRole("textbox", { name: "Name", exact: true }), "Canva thank-you");
await typeVis(
  page,
  page.getByRole("textbox", { name: /^Subject/ }),
  "Thank you, {{recipientName}}",
);
await clickVis(page, page.getByRole("radio", { name: /Shared/ }));

const chooserPromise = page.waitForEvent("filechooser");
await clickVis(page, page.getByText("Choose Canva ZIP", { exact: true }));
const chooser = await chooserPromise;
await chooser.setFiles(ZIP);
await page.getByText("ZIP added", { exact: true }).waitFor({ timeout: 30000 });
await pause(3500);

await clickVis(page, page.getByRole("button", { name: "Save", exact: true }));
await page.getByRole("heading", { name: /My designs/ }).waitFor({ timeout: 60000 });
await pause(1500);

await clickVis(page, page.getByRole("button", { name: /Canva thank-you/ }).first());
await pause(4000);
await clickVis(page, page.getByRole("banner").getByRole("link", { name: "My designs" }));
await pause(2000);

await signOut(page);
await pause(800);
await signIn(page);

await clickVis(page, shelfCard(page, "Note of thanks"));
await page.getByRole("heading", { name: "Share" }).waitFor();
await pause(800);
await addPerson(page, "randivranasinghe@gmail.com", "Randiv Ranasinghe", "Mr.");
await pause(600);
await addPerson(page, "senirurandiv@gmail.com", "Seniru Randiv", "Dr.");
await pause(1200);

await clickVis(page, page.locator(".compose-panel-footer").getByRole("button", { name: "Share" }));
await page.getByRole("alertdialog").waitFor();
await pause(1500);
await clickVis(page, page.getByRole("alertdialog").getByRole("button", { name: "Share" }));
await page.getByRole("heading", { name: "Card sent" }).waitFor({ timeout: 30000 });
await pause(2500);

await clickVis(page, page.getByRole("banner").getByRole("link", { name: "History" }));
await pause(1500);
await clickVis(page, page.locator(".sent-row-head").first());
await pause(2500);
await page.keyboard.press("Escape");
await pause(600);

await signOut(page);
await pause(800);
await signIn(page, "ADMIN");

await clickVis(page, page.getByRole("banner").getByRole("link", { name: "Admin", exact: true }));
await pause(1500);
await clickVis(page, page.getByRole("link", { name: "Share summary" }));
await pause(1200);
await clickVis(page, page.locator(".admin-expand-row").first());
await pause(1800);
await clickVis(page, page.getByRole("link", { name: "People" }));
await pause(1500);
await clickVis(page, page.getByRole("link", { name: "Titles" }));
await pause(1500);
await clickVis(page, page.getByRole("link", { name: "Audit log" }));
await pause(1800);
await clickVis(page, page.locator("a.brand"));
await pause(3000);

await browser.close();
