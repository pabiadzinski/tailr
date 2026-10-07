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

test("hides and excludes JSON fields from a line", async ({ page }) => {
  await page.goto("/#e2e-json-1");
  const counter = page.locator("#counter");
  await expect(counter).toHaveText("31 lines");

  const failed = page.locator("#rows .row", { hasText: "job failed" });
  await failed.locator('[data-key="job"]').click();
  await page.locator("#fm-exclude").click();
  await expect(page.locator("#excludes button")).toHaveText(["job=31"]);
  await expect(counter).toHaveText("30 / 31 lines");
  await expect(page.locator("#rows .row.json pre")).toHaveCount(0);

  for (const rule of ["job=/^[12]\\d$/", "job=3"]) {
    await page.locator("#exclude").fill(rule);
    await page.locator("#exclude").press("Enter");
  }
  await expect(counter).toHaveText("9 / 31 lines");

  const first = page.locator("#rows .row").first();
  await expect(first.locator(".msg")).toHaveText('job done  job=1 tags=["a"]');
  await first.locator('[data-key="tags"]').click();
  await page.locator("#fm-hide").click();
  await expect(first.locator(".msg")).toHaveText("job done  job=1");
});

test("highlights a JSON field and shows it first", async ({ page }) => {
  await page.goto("/#e2e-json-1");
  const failed = page.locator("#rows .row", { hasText: "job failed" });
  await expect(failed.locator(".msg")).toHaveText("job failed  job=31 err=context deadline exceeded");

  await failed.locator('[data-key="err"]').click();
  await page.locator('#fm-field [data-color="red"]').click();
  await expect(failed.locator(".fc.hl-red")).toHaveText("err=context deadline exceeded");
  await expect(failed.locator(".msg")).toHaveText("job failed  err=context deadline exceeded job=31");

  await page.reload();
  await expect(failed.locator(".fc.hl-red")).toHaveText("err=context deadline exceeded");
  await failed.locator('[data-key="err"]').click();
  await expect(page.locator('#fm-field [data-color="red"]')).toHaveClass("on");
  await page.locator('#fm-field [data-color=""]').click();
  await expect(failed.locator(".fc")).toHaveCount(0);
});

test("highlights lines by rule", async ({ page }) => {
  await page.goto("/#e2e-json-1,e2e-text-1");
  const row = (text) => page.locator("#rows .row", { hasText: text });

  await page.locator("#t-cols").click();
  await page.locator('#hl-colors [data-color="green"]').click();
  await page.locator("#highlight").fill("slow request");
  await page.locator("#highlight").press("Enter");
  await expect(page.locator("#highlights button.hl-green")).toHaveText("slow request");
  await expect(row("slow request")).toHaveClass(/hl-green/);
  await expect(page.locator("#rows .row.hl")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await row("job failed").locator('[data-key="job"]').click();
  await page.locator('#fm-lines [data-color="red"]').click();
  await expect(row("job failed")).toHaveClass(/hl-red/);
  await expect(page.locator("#rows .row.hl")).toHaveCount(2);

  await page.reload();
  await expect(row("job failed")).toHaveClass(/hl-red/);
  await row("job failed").locator('[data-key="job"]').click();
  await expect(page.locator('#fm-lines [data-color="red"]')).toHaveClass("on");
  await page.locator('#fm-lines [data-color=""]').click();
  await expect(page.locator("#rows .row.hl")).toHaveCount(1);
});
