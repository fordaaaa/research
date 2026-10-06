import { expect, test } from "@playwright/test";
import { authGate, ensureAuth, uniqueName } from "./auth.js";

const gate = authGate();
test("exam goal, selected practice, saved attempt, and missed-topic follow-up", async ({ page, request }) => {
  test.skip(!gate.canWrite, gate.skipReason);
  await ensureAuth(page, gate);
  const token = await page.evaluate(() => localStorage.getItem("research_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const name = uniqueName("coach-biology");
  const created = await request.post("/api/notebooks", { headers, data: { name } });
  expect(created.ok()).toBeTruthy();
  const notebook = await created.json() as { id: string };
  try {
    const source = await request.post(`/api/notebooks/${notebook.id}/sources/text`, { headers, data: {
      title: "Biology lecture", text: "Photosynthesis converts sunlight into chemical energy inside chloroplasts. Chlorophyll pigments capture photons in the thylakoid membranes. Mitochondria release energy from glucose during cellular respiration. Meiosis produces four haploid cells with half the chromosomes.",
    } });
    expect(source.ok()).toBeTruthy();
    await page.reload();
    await page.getByLabel("Exam course notebook").selectOption(notebook.id);
    await page.getByRole("button", { name: "Plan exam revision" }).click();
    await page.getByLabel("Exam title", { exact: true }).fill("Biology midterm");
    await page.getByLabel("Study minutes per session").fill("5");
    await page.getByRole("button", { name: "Save exam goal" }).click();
    await expect(page.getByText(/Saved: Biology midterm/)).toBeVisible();
    await page.getByRole("button", { name: "Build revision session" }).click();
    const selected = page.getByRole("checkbox", { name: /^Include / });
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeChecked();
    await page.getByRole("button", { name: "Start selected session" }).click();
    await page.getByLabel("Your answer").fill("I am still learning how this works.");
    await page.getByRole("button", { name: "Show reference answer" }).click();
    await page.getByRole("button", { name: /Biology lecture · p\./ }).click();
    await expect(page.getByRole("dialog")).toContainText("Photosynthesis converts");
    await page.getByRole("button", { name: /close/i }).click();
    await page.getByRole("button", { name: "Revise again", exact: true }).click();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
    await expect(page.getByText("1 topic to revisit in your next session.")).toBeVisible();
    await page.reload();
    await page.getByLabel("Exam course notebook").selectOption(notebook.id);
    await page.getByRole("button", { name: "Plan exam revision" }).click();
    await expect(page.getByText("I am still learning how this works.")).toBeVisible();
    await page.getByRole("button", { name: "Build revision session" }).click();
    await expect(page.getByText(/Revisit a topic you marked missed/)).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  } finally {
    await request.delete(`/api/notebooks/${notebook.id}`, { headers });
  }
});

test("practice drafts survive question navigation and saving another answer", async ({ page, request }) => {
  test.skip(!gate.canWrite, gate.skipReason);
  await ensureAuth(page, gate);
  const token = await page.evaluate(() => localStorage.getItem("research_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.post("/api/notebooks", { headers, data: { name: uniqueName("coach-drafts") } });
  expect(response.ok()).toBeTruthy();
  const notebook = await response.json() as { id: string };
  try {
    for (const [front, back] of [["What does gravity do?", "Gravity attracts objects with mass."], ["What is acceleration?", "Acceleration measures the change in velocity over time."]]) {
      expect((await request.post(`/api/notebooks/${notebook.id}/cards`, { headers, data: { front, back } })).ok()).toBeTruthy();
    }
    await page.reload();
    await page.getByLabel("Exam course notebook").selectOption(notebook.id);
    await page.getByRole("button", { name: "Plan exam revision" }).click();
    await page.getByLabel("Exam title", { exact: true }).fill("Physics exam");
    await page.getByRole("button", { name: "Save exam goal" }).click();
    await expect(page.getByText(/Saved: Physics exam/)).toBeVisible();
    await page.getByRole("button", { name: "Build revision session" }).click();
    await page.getByRole("button", { name: "Start selected session" }).click();
    await page.getByLabel("Your answer").fill("My first physics answer");
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.locator("h4[tabindex='-1']")).toBeFocused();
    await page.getByLabel("Your answer").fill("My second physics draft");
    await page.getByRole("button", { name: "Previous question" }).click();
    await expect(page.getByLabel("Your answer")).toHaveValue("My first physics answer");
    await page.getByRole("button", { name: "Show explanation" }).click();
    await page.getByRole("button", { name: "Got it", exact: true }).click();
    await expect(page.getByLabel("Your answer")).toHaveValue("My second physics draft");
    await page.getByRole("button", { name: "Show reference answer" }).click();
    await page.getByRole("button", { name: "Revise again", exact: true }).click();
    await page.getByRole("button", { name: "Finish session" }).click();
    await expect(page.getByText("My first physics answer")).toBeVisible();
    await expect(page.getByText("My second physics draft")).toBeVisible();
  } finally { await request.delete(`/api/notebooks/${notebook.id}`, { headers }); }
});
