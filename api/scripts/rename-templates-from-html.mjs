const API = "http://localhost:3001";

function visibleText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromText(text) {
  const cleaned = text
    .replace(/Gratitude Chain/gi, " ")
    .replace(/SLTMOBITEL/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const thankYou = cleaned.match(
    /Thank You[^.!?]{0,80}(?:[.!?]|$)/i,
  );
  if (thankYou) {
    return thankYou[0]
      .replace(/[.!]+$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  const first = cleaned.split(/[.!?]/)[0]?.trim() ?? "";
  return first.slice(0, 80) || "Thank You";
}

async function main() {
  const loginRes = await fetch(`${API}/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      displayName: "Admin",
      role: "ADMIN",
    }),
  });
  if (!loginRes.ok) {
    throw new Error(`login failed ${loginRes.status}`);
  }
  const { token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(`${API}/marketplace`, { headers });
  const { templates } = await listRes.json();

  const dry = process.argv.includes("--dry");
  for (const card of templates) {
    const detailRes = await fetch(`${API}/marketplace/${card.id}`, { headers });
    const detail = await detailRes.json();
    const html =
      detail.previewHtml ||
      detail.template?.versions?.[0]?.compiledHtml ||
      "";
    const text = visibleText(html);
    const name = titleFromText(text);
    console.log(`${card.name} -> ${name}`);
    console.log(`  text: ${text.slice(0, 220)}`);
    if (!dry) {
      const patch = await fetch(`${API}/templates/${card.id}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!patch.ok) {
        const err = await patch.text();
        throw new Error(`patch ${card.id} failed ${patch.status} ${err}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
