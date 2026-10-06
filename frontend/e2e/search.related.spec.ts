import { expect, test } from "@playwright/test";
import { authGate, ensureAuth, uniqueName } from "./auth.js";
const gate = authGate();
test("related matching recovers a misspelled topic and opens its actual source", async ({ page, request }) => {
  test.skip(!gate.canWrite, gate.skipReason);
  await ensureAuth(page, gate);
  const token = await page.evaluate(() => localStorage.getItem("research_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post("/api/notebooks", { headers, data: { name: uniqueName("related-biology") } });
  expect(created.ok()).toBeTruthy();
  const notebook = await created.json() as { id: string };
  try {
    const saved = await request.post(`/api/notebooks/${notebook.id}/sources/text`, { headers, data: { title: "Plant biology", text: "Photosynthesis converts sunlight into chemical energy inside chloroplasts." } });
    expect(saved.ok()).toBeTruthy();
    await page.reload();
    await page.getByLabel("Exam course notebook").selectOption(notebook.id);
    await page.getByRole("button", { name: "Plan exam revision" }).click();
    await page.getByRole("navigation", { name: "Notebook sections" }).getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("tab", { name: "Search (Current section views)", exact: true }).click();
    await page.getByRole("searchbox").fill("photosynthsis");
    await page.getByRole("button", { name: "Submit search" }).click();
    await expect(page.getByText("No matches for “photosynthsis”.")).toBeVisible();
    await page.getByLabel("Find related passages").check();
    await expect(page.getByRole("button", { name: "Read Plant biology" })).toBeVisible();
    await page.getByRole("button", { name: "Read Plant biology" }).click();
    await expect(page.getByRole("dialog")).toContainText("Photosynthesis converts sunlight");
  } finally {
    await request.delete(`/api/notebooks/${notebook.id}`, { headers }).catch(() => {});
  }
});
