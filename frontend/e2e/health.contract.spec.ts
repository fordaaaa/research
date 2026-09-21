import { expect, test } from "@playwright/test";

// Deployed-backend contract smoke check. Runs in every mode (local and
// remote) and records /api/health failures with status + body attached.
test("GET /api/health reports ok", async ({ request }, testInfo) => {
  const res = await request.get("/api/health");
  const body = await res.text().catch(() => "<unreadable body>");
  await testInfo.attach("health-response", {
    body: `status=${res.status()}\n${body}`,
    contentType: "text/plain",
  });
  expect(
    res.ok(),
    `GET /api/health failed: HTTP ${res.status()} body=${body}`,
  ).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});
