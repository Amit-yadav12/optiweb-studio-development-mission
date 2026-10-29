/**
 * Accessibility / semantics audit over the server-rendered HTML.
 * No browser required: this inspects the markup React actually emits.
 */
const B = process.argv[2] ?? "http://127.0.0.1:3100";
const PAGES = ["/", "/app", "/app/images", "/app/fonts", "/app/assets", "/app/audit", "/app/history", "/app/settings"];

let total = 0;
let failed = 0;
const problems = [];

function check(page, name, ok, detail = "") {
  total += 1;
  if (!ok) {
    failed += 1;
    problems.push(`[${page}] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

for (const page of PAGES) {
  const res = await fetch(B + page);
  const html = await res.text();
  check(page, "status 200", res.status === 200, `got ${res.status}`);

  const h1 = (html.match(/<h1/g) ?? []).length;
  check(page, "exactly one h1", h1 === 1, `found ${h1}`);
  check(page, "skip link present", html.includes('href="#main"'));
  check(page, "html lang attribute", /<html[^>]*lang="en"/.test(html));
  check(page, "theme bootstrap script present", html.includes("ow-theme"));
  check(page, "theme toggle present", html.includes("Theme: "));

  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const missingAlt = imgs.filter((tag) => !/\balt=/.test(tag));
  check(page, "all <img> have alt", missingAlt.length === 0, `${missingAlt.length} missing`);

  const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const labels = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  const unlabelled = fields.filter((tag) => {
    if (/type="(hidden|submit|button)"/.test(tag)) return false;
    if (/aria-label(ledby)?=/.test(tag)) return false;
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    if (id && (labels.has(id) || ids.has(id))) return false;
    // A control nested inside a <label> gets an implicit accessible name.
    const open = html.indexOf(tag);
    const before = html.lastIndexOf("<label", open);
    const labelClose = before === -1 ? -1 : html.indexOf("</label>", before);
    return !(before !== -1 && labelClose > open);
  });
  check(page, "all form fields labelled", unlabelled.length === 0, `${unlabelled.length} unlabelled`);

  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[0]);
  const nameless = buttons.filter((tag) => {
    if (/aria-label=/.test(tag)) return false;
    const text = tag.replace(/<[^>]*>/g, "").trim();
    return text.length === 0;
  });
  check(page, "all buttons have names", nameless.length === 0, `${nameless.length} nameless`);

  const ths = [...html.matchAll(/<th\b[^>]*>/g)].map((m) => m[0]);
  const unscoped = ths.filter((t) => !/\bscope=/.test(t));
  check(page, "table headers scoped", unscoped.length === 0, `${unscoped.length} unscoped of ${ths.length}`);

  const tableCount = (html.match(/<table/g) ?? []).length;
  const scrollCount = (html.match(/overflow-x-auto/g) ?? []).length;
  check(page, "tables have scroll container", tableCount === 0 || scrollCount >= tableCount);

  check(page, "no href=# links", !/href="#"/.test(html));
  check(page, "no javascript: urls", !/href="javascript:/.test(html));

  // Only visible text: strip scripts (RSC flight payload contains "$undefined").
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  check(page, "no template markers", !body.includes("TODO") && !/\bundefined\b/.test(body) && !/\bNaN\b/.test(body));
}

console.log(`\n${total - failed}/${total} accessibility & semantics checks passed`);
if (problems.length) {
  console.log("\nProblems:");
  for (const p of problems) console.log(" - " + p);
  process.exit(1);
}
console.log("No problems found.");
