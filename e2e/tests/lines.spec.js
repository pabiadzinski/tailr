import { expect, test } from "@playwright/test";

const row = (page, text) => page.locator("#rows .row", { hasText: text });

test("detects levels from logfmt, stderr and rules", async ({ page }) => {
  await page.goto("/#e2e-text-1");
  const cases = [
    ["request done", "INFO"],
    ["slow request", "WARN"],
    ["plain stderr line", "ERR"],
    ["custom failure", "ERR"],
  ];
  for (const [text, level] of cases) {
    await expect(row(page, text).locator(".lvl")).toHaveText(level);
  }
});

test("renders ANSI colors", async ({ page }) => {
  await page.goto("/#e2e-text-1");
  const msg = row(page, "bold green").locator(".msg");
  await expect(msg).toHaveText("red and bold green");
  await expect(msg.locator("span.a-31")).toHaveText("red");
  await expect(msg.locator("span.a-bold.a-32")).toHaveText("bold green");
});

test("filters by level", async ({ page }) => {
  await page.goto("/#e2e-json-1");
  await expect(page.locator("#counter")).toHaveText("31 lines");
  await page.locator('#levels [data-level="error"]').click();
  await expect(page.locator("#counter")).toHaveText("1 / 31 lines");
  await expect(page.locator("#rows .row")).toContainText(["job failed"]);
});

test("expands JSON with syntax highlighting and copies it", async ({ page }) => {
  await page.goto("/#e2e-json-1");
  const failed = page.locator("#rows .row.json", { hasText: "job failed" });
  const raw = '{"level":"error","msg":"job failed","job":31,"err":"context deadline exceeded"}';
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await expect(failed.locator(".msg")).toHaveText("job failed  job=31 err=context deadline exceeded");
  await failed.locator(".msg").click();
  const pre = failed.locator("pre");
  await expect(pre.locator(".j-key").first()).toHaveText('"level"');
  await expect(pre.locator(".j-num")).toHaveText("31");

  await failed.hover();
  await failed.locator(".copy").click();
  expect(await clipboard()).toBe(JSON.stringify(JSON.parse(raw), null, 2));

  await failed.locator(".msg").click();
  await expect(pre).toHaveCount(0);
  await failed.hover();
  await failed.locator(".copy").click();
  expect(await clipboard()).toBe(raw);
});

test("hides columns and JSON fields", async ({ page }) => {
  await page.goto("/#e2e-json-1,e2e-text-1");
  const failed = page.locator("#rows .row", { hasText: "job failed" });
  await expect(failed.locator(".msg")).toHaveText("json-1job failed  job=31 err=context deadline exceeded");

  await page.locator("#t-cols").click();
  for (const col of ["ts", "lvl", "src"]) await page.locator(`#col-${col}`).uncheck();
  for (const sel of [".ts", ".lvl", ".src"]) await expect(failed.locator(sel)).toBeHidden();

  for (const key of ["job", "err"]) {
    await page.locator("#hide-field").fill(key);
    await page.locator("#hide-field").press("Enter");
  }
  await expect(failed.locator(".msg")).toHaveText("json-1job failed");

  await page.reload();
  await expect(failed.locator(".lvl")).toBeHidden();
  await expect(failed.locator(".msg")).toHaveText("json-1job failed");

  await page.locator("#t-cols").click();
  await page.locator("#col-lvl").check();
  await page.locator("#hidden-fields button", { hasText: "err" }).click();
  await expect(failed.locator(".lvl")).toHaveText("ERR");
  await expect(failed.locator(".msg")).toHaveText("json-1job failed  err=context deadline exceeded");
});
