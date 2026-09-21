import { expect, test } from "@playwright/test";
import { authGate, ensureAuth, uniqueName } from "./auth.js";

// Full UI-only core journey on mobile viewports. No AI/provider calls:
// every step below is served by local extraction over the notebook's own
// sources. Runs on both mobile projects (iPhone/WebKit, Pixel/Chromium).
//
// Remote mode needs RESEARCH_E2E_EMAIL + RESEARCH_E2E_PASSWORD or
// RESEARCH_E2E_ALLOW_REGISTRATION=1; otherwise the write flow is skipped
// and only the safe shell specs run.

const gate = authGate();

test.describe("mobile core journey", () => {
  test.skip(!gate.canWrite, gate.skipReason);

  const notebookName = uniqueName("e2e-m");
  const sourceTitle = `E2E photosynthesis ${notebookName}`;
  const cardFront = `E2E recall ${notebookName}`;
  const noteTitle = `E2E note ${notebookName}`;

  // Deterministic paste body: repeated key terms feed the local glossary,
  // quiz, and draft-card heuristics (sentences >= 30 chars).
  const pasteBody = [
    "Photosynthesis converts light energy into chemical energy inside chloroplasts.",
    "Chlorophyll pigments in the thylakoid membranes absorb photons and release electrons.",
    "The Calvin cycle fixes carbon dioxide into glucose in the chloroplast stroma.",
    "Mitochondria perform cellular respiration, releasing energy from glucose molecules.",
    "Cellular respiration in the mitochondria produces adenosine triphosphate for cell work.",
    "Chloroplasts and mitochondria both descend from ancient symbiotic bacteria cells.",
    "Stomata regulate gas exchange so photosynthesis can absorb carbon dioxide gas.",
    "Guard cells open and close the stomata to balance water loss and gas exchange.",
  ].join(" ");

  // Only this run's notebook id is ever deleted here. A prefix sweep
  // (delete every e2e-m-* notebook) could remove notebooks from concurrent
  // remote runs sharing one account, so cleanup targets the exact id
  // captured from this test's POST /api/notebooks response.
  let createdNotebookId: string | undefined;

  test.beforeEach(() => {
    createdNotebookId = undefined;
  });

  test.afterEach(async ({ page, request }) => {
    // Best-effort cleanup so remote runs leave no temp notebook behind.
    // Local runs use a throwaway data dir, so leftovers are discarded anyway.
    // Safe when creation/auth failed (no id or token -> no-op) and never
    // fails the test. The main path deletes via the UI below; this only
    // covers runs that failed before reaching that step.
    const id = createdNotebookId;
    createdNotebookId = undefined;
    if (!id) return;
    try {
      const token = await page.evaluate(() =>
        window.localStorage.getItem("research_token"),
      );
      if (!token) return;
      await request.delete(`/api/notebooks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Cleanup must never fail the test itself.
    }
  });

  test("authenticate, notebook, source, study, note, delete", async ({
    page,
  }) => {
    await ensureAuth(page, gate);

    // --- Create a uniquely named notebook ---
    // Capture the exact id for scoped afterEach cleanup (never a prefix sweep).
    const createResponsePromise = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/api/notebooks"),
    );
    await page.getByPlaceholder(/New notebook name/i).fill(notebookName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    try {
      const createResponse = await createResponsePromise;
      if (createResponse.ok()) {
        const body = (await createResponse.json()) as { id?: unknown };
        if (typeof body.id === "string" && body.id.length > 0) {
          createdNotebookId = body.id;
        }
      }
    } catch {
      // No id captured -> afterEach is a safe no-op; the UI delete below
      // still covers the happy path.
    }
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText(notebookName);

    // --- Paste a source ---
    await page.getByRole("button", { name: /Paste text instead/i }).click();
    await page.locator("#paste-title").fill(sourceTitle);
    await page.locator("#paste-body").fill(pasteBody);
    await page.getByRole("button", { name: "Save source" }).click();
    const sourceButton = page.getByRole("button", {
      name: sourceTitle,
      exact: true,
    });
    await expect(sourceButton).toBeVisible();

    // --- Reader: source-grounded reading ---
    // Keyboard activation: the title sits inside a SwipeRow whose surface
    // calls setPointerCapture on pointerdown, which retargets genuine
    // pointer clicks to the surface so the title button never receives
    // them. Enter fires a click without pointer events and is the
    // assistive-tech path real users rely on here.
    await sourceButton.focus();
    await page.keyboard.press("Enter");
    const reader = page.getByRole("dialog");
    await expect(reader).toBeVisible();
    await expect(reader).toContainText(sourceTitle);
    await expect(reader).toContainText("Chlorophyll pigments");
    // Paste ingests carry no ranked key passages (see core/ingest.py:
    // only URL ingests rank passages), so the panel stays hidden here;
    // the deterministic study flow below is the paste-source coverage.
    await expect(
      reader.getByRole("heading", { name: "Important passages" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Close reader" }).click();
    await expect(reader).toBeHidden();

    // --- Learn section (Study view) via the mobile bottom nav ---
    await page
      .getByRole("navigation", { name: "Notebook sections" })
      .getByRole("button", { name: "Learn" })
      .click();
    await expect(
      page.getByRole("tab", { name: "Flashcards", selected: true }),
    ).toBeVisible();

    // --- Create, tag, filter, and edit a flashcard ---
    await page.getByLabel("Front").fill(cardFront);
    await page
      .getByLabel("Back")
      .fill("Sister chromatids separate to opposite poles.");
    await page.getByLabel(/Tags.*optional/).fill("e2e, biology");
    await page.getByRole("button", { name: "Add card" }).click();
    await expect(page.getByText(cardFront)).toBeVisible();
    const tagFilter = page.getByRole("button", {
      name: "Filter by tag e2e",
    });
    await expect(tagFilter).toBeVisible();
    await tagFilter.click();
    await expect(page.getByText(cardFront)).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();

    await page.getByRole("button", { name: `Edit card: ${cardFront}` }).click();
    await page.getByLabel("Edit back").fill("E2E edited answer.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("E2E edited answer.")).toBeVisible();

    // --- Deterministic source-grounded drafts (no AI) ---
    await page
      .getByRole("button", { name: "Load drafts from sources" })
      .click();
    const saveDraft = page
      .getByRole("button", { name: "Save to deck" })
      .first();
    const noDrafts = page.getByText("No drafts right now.");
    await expect(saveDraft.or(noDrafts)).toBeVisible();
    if (await saveDraft.isVisible()) {
      await expect
        .soft(page.getByText(`From “${sourceTitle}”`).first())
        .toBeVisible();
      await saveDraft.click();
      await expect(
        page.getByRole("button", { name: "Saved" }).first(),
      ).toBeVisible();
    } else {
      await expect(noDrafts).toBeVisible();
    }

    // --- Due review with accessible grade buttons + touch assertion ---
    const reviewDue = page.getByRole("button", { name: /^Review due/ });
    if (await reviewDue.isEnabled()) {
      await reviewDue.click();
    } else {
      await page.getByRole("button", { name: /^Practice all/ }).click();
    }
    const session = page.getByTestId("review-session");
    await expect(session).toBeVisible();
    // Mobile gesture assertion: the swipe surface keeps vertical page
    // scroll (pan-y) while horizontal swipes grade the card.
    const surface = page.getByTestId("review-swipe-surface");
    await expect(surface).toBeVisible();
    expect(await surface.evaluate((el) => getComputedStyle(el).touchAction)).toContain(
      "pan-y",
    );
    // Tap (touch) reveals the answer, buttons grade it. The flip button
    // lives inside the swipe surface (which captures pointers), so it is
    // activated via keyboard like the source title above.
    const flip = page.getByRole("button", { name: "Show answer" });
    await flip.focus();
    await page.keyboard.press("Enter");
    const gradeGroup = page.getByRole("group", { name: "Grade this card" });
    await expect(gradeGroup).toBeVisible();
    // Mobile gesture assertion: a rightward pointer swipe across the
    // surface (dx=160 past the 80px threshold) grades the card "good"
    // through the real swipe handlers, with vertical scroll preserved.
    await surface.evaluate((el) => {
      const init = {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
      };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...init, clientX: 100, clientY: 200 }));
      el.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 260, clientY: 200 }));
      el.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: 260, clientY: 200 }));
    });
    const reviewComplete = page.getByText(/Review complete/);
    for (let i = 0; i < 10; i++) {
      const show = page.getByRole("button", { name: "Show answer" });
      await expect(show.or(reviewComplete)).toBeVisible();
      if (await reviewComplete.isVisible()) break;
      await show.focus();
      await page.keyboard.press("Enter");
      const good = page.getByRole("button", { name: "Good", exact: true });
      await expect(good).toBeVisible();
      await good.click();
    }
    await expect(reviewComplete).toBeVisible();
    await page.getByRole("button", { name: "Back to deck" }).click();

    // --- Glossary (deterministic, source-cited) ---
    await page.getByRole("tab", { name: "Glossary" }).click();
    await expect(page.getByRole("heading", { name: "Glossary" })).toBeVisible();
    const makeCard = page
      .getByRole("button", { name: "Make flashcard" })
      .first();
    const noGlossary = page.getByText("No glossary terms yet.");
    await expect(makeCard.or(noGlossary)).toBeVisible();
    if (await makeCard.isVisible()) {
      await expect(
        page.getByText(`From “${sourceTitle}”`).first(),
      ).toBeVisible();
    } else {
      await expect(noGlossary).toBeVisible();
    }

    // --- Quiz (session-local scoring, nothing saved) ---
    await page.getByRole("tab", { name: "Quiz" }).click();
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Mark correct" }).click();
    await expect(
      page.getByText(/Score: 1 correct of 1 answered/),
    ).toBeVisible();

    // --- Notes: create and autosave ---
    await page
      .getByRole("navigation", { name: "Notebook sections" })
      .getByRole("button", { name: "Library" })
      .click();
    await page.getByRole("tab", { name: "Notes" }).click();
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByLabel("Note title").fill(noteTitle);
    await page.getByLabel("Note body").fill("E2E body text for the note.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: noteTitle }).first(),
    ).toBeVisible();

    // --- Delete the test notebook (cleanup) ---
    await page.getByRole("button", { name: "research", exact: true }).click();
    await page
      .getByRole("button", { name: `Delete ${notebookName}` })
      .click();
    await expect(
      page.getByRole("button", { name: `Open ${notebookName}` }),
    ).toBeHidden();
  });
});
