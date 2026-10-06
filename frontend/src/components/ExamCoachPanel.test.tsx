// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExamCoachPanel from "./ExamCoachPanel";

const apiMock = vi.hoisted(() => ({ getCoachState: vi.fn(), saveExamGoal: vi.fn(), buildCoachSession: vi.fn(),
  startCoachSession: vi.fn(), recordCoachAttempt: vi.fn(), finishCoachSession: vi.fn(), explainCoachTask: vi.fn() }));
vi.mock("../api", () => apiMock);
vi.mock("./AIActivity", () => ({ default: () => <span>Thinking…</span> }));
vi.mock("../sound", () => ({ playSuccess: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const goal = { title: "Biology exam", exam_date: "2026-11-01", daily_minutes: 20, focus_topics: [] };
const task = { id: "a".repeat(12), topic: "Photosynthesis", prompt: "What does photosynthesis convert?", answer: "Sunlight becomes chemical energy.", minutes: 4,
  reason: "Revisit a topic you marked missed", source_id: "source", source_title: "Lecture", pages: [7], chunk_seq: 0, card_id: null };
const draft = { id: "b".repeat(12), notebook_id: "biology", goal, status: "draft", generated_by: "basic", notice: null,
  tasks: [task], attempts: [], created_at: "2026-10-02T12:00:00Z", completed_at: null };
const props = { notebookId: "biology", aiConfigured: false, onOpenSource: vi.fn() };

it("moves keyboard focus to the new question after navigation", async () => {
  const second = { ...task, id: "c".repeat(12), topic: "Meiosis" };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active", tasks: [task, second] }] });
  render(<ExamCoachPanel {...props} />);
  const next = await screen.findByRole("button", { name: "Next question" });
  next.focus();
  fireEvent.click(next);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Meiosis" }));
});

it("keeps the current question while its explanation is pending", async () => {
  const second = { ...task, id: "c".repeat(12), topic: "Meiosis" };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active", tasks: [task, second] }] });
  let resolve!: (value: unknown) => void;
  apiMock.explainCoachTask.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ExamCoachPanel {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show explanation" }));
  const next = screen.getByRole("button", { name: "Next question" }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  fireEvent.click(next);
  await act(async () => resolve({ answer: "Photosynthesis explanation", citations: [], generated_by: "basic", notice: null }));
  expect(screen.getByRole("heading", { name: "Photosynthesis" })).toBeTruthy();
  expect(screen.getByText("Photosynthesis explanation")).toBeTruthy();
  fireEvent.click(next);
  expect(screen.queryByText("Photosynthesis explanation")).toBeNull();
});

it("saves a goal, accepts a session, records practice, and completes it", async () => {
  apiMock.getCoachState.mockResolvedValue({ goal: null, sessions: [] });
  apiMock.saveExamGoal.mockResolvedValue(goal);
  apiMock.buildCoachSession.mockResolvedValue(draft);
  apiMock.startCoachSession.mockResolvedValue({ ...draft, status: "active" });
  const rated = { ...draft, status: "active", attempts: [{ task_id: task.id, rating: "revise", response: "Light becomes stored energy", created_at: "2026-10-02T12:01:00Z" }] };
  apiMock.recordCoachAttempt.mockResolvedValue(rated);
  apiMock.finishCoachSession.mockResolvedValue({ ...rated, status: "completed", completed_at: "2026-10-02T12:02:00Z" });
  render(<ExamCoachPanel {...props} />);
  fireEvent.change(await screen.findByLabelText("Exam title"), { target: { value: goal.title } });
  fireEvent.click(screen.getByRole("button", { name: "Save exam goal" }));
  await waitFor(() => expect(apiMock.saveExamGoal).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Build revision session" }));
  await screen.findByLabelText("Include Photosynthesis");
  fireEvent.click(screen.getByRole("button", { name: "Start selected session" }));
  fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "Light becomes stored energy" } });
  fireEvent.click(screen.getByRole("button", { name: "Show reference answer" }));
  expect(screen.getByText(task.answer)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Revise again" }));
  await waitFor(() => expect(apiMock.recordCoachAttempt).toHaveBeenCalledWith("biology", draft.id,
    { task_id: task.id, rating: "revise", response: "Light becomes stored energy" }, expect.any(AbortSignal)));
  fireEvent.click(await screen.findByRole("button", { name: "Finish session" }));
  expect(await screen.findByRole("heading", { name: "Session complete" })).toBeTruthy();
  expect(screen.getByText(/1 topic to revisit/)).toBeTruthy();
  expect(apiMock.buildCoachSession).toHaveBeenCalledWith("biology", false, expect.any(AbortSignal));
});

it("loads saved attempts and shows the prior session without rating twice", async () => {
  const attempted = { ...draft, status: "completed", completed_at: "2026-10-02T12:02:00Z",
    attempts: [{ task_id: task.id, rating: "revise", response: "My saved answer", created_at: "2026-10-02T12:01:00Z" }] };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [attempted] });
  render(<ExamCoachPanel {...props} />);
  await screen.findByRole("heading", { name: "Session complete" });
  expect(screen.getByText("My saved answer")).toBeTruthy();
  expect(screen.getByText(/1 topic to revisit/)).toBeTruthy();
  expect(apiMock.recordCoachAttempt).not.toHaveBeenCalled();
});

it("shows real AI waiting and a usable fallback explanation", async () => {
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active" }] });
  let resolve!: (value: unknown) => void;
  apiMock.explainCoachTask.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ExamCoachPanel {...props} aiConfigured />);
  fireEvent.click(await screen.findByRole("button", { name: "Explain with AI" }));
  expect(screen.getByText("Thinking…")).toBeTruthy();
  await act(async () => resolve({ answer: task.answer, generated_by: "basic", model: null, citations: [], notice: "AI unavailable; using your reference answer." }));
  expect(screen.queryByText("Thinking…")).toBeNull();
  expect(screen.getByText("AI unavailable; using your reference answer.")).toBeTruthy();
});

it("discards a late session from a different notebook and aborts its request", async () => {
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [] });
  let resolve!: (value: unknown) => void;
  apiMock.buildCoachSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  const view = render(<ExamCoachPanel {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Build revision session" }));
  await waitFor(() => expect(apiMock.buildCoachSession).toHaveBeenCalled());
  const signal = apiMock.buildCoachSession.mock.calls[0][2] as AbortSignal;
  apiMock.getCoachState.mockResolvedValue({ goal: { ...goal, title: "Chemistry exam" }, sessions: [] });
  view.rerender(<ExamCoachPanel {...props} notebookId="chemistry" />);
  await screen.findByDisplayValue("Chemistry exam");
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(draft));
  expect(screen.queryByLabelText("Include Photosynthesis")).toBeNull();
});

it("requires saving edited goals before building and applies the AI opt-out to explanations", async () => {
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active" }] });
  apiMock.explainCoachTask.mockResolvedValue({ answer: task.answer, generated_by: "basic", model: null, citations: [], notice: null });
  const view = render(<ExamCoachPanel {...props} aiConfigured />);
  fireEvent.click(await screen.findByLabelText("Use AI for practice"));
  fireEvent.click(screen.getByRole("button", { name: "Show explanation" }));
  await waitFor(() => expect(apiMock.explainCoachTask).toHaveBeenCalledWith("biology", draft.id, task.id, false, expect.any(AbortSignal)));
  view.unmount();
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [] });
  render(<ExamCoachPanel {...props} />);
  fireEvent.change(await screen.findByLabelText("Exam title"), { target: { value: "Updated exam" } });
  expect((screen.getByRole("button", { name: "Build revision session" }) as HTMLButtonElement).disabled).toBe(true);
});

it("keeps the final question visible when all answers are rated", async () => {
  const second = { ...task, id: "c".repeat(12), topic: "Meiosis" };
  const firstAttempt = { task_id: task.id, rating: "got_it", response: "First answer", created_at: draft.created_at };
  const active = { ...draft, status: "active", tasks: [task, second], attempts: [firstAttempt] };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [active] });
  apiMock.recordCoachAttempt.mockResolvedValue({ ...active, attempts: [...active.attempts, { ...firstAttempt, task_id: second.id }] });
  render(<ExamCoachPanel {...props} />);
  await screen.findByText("Meiosis");
  fireEvent.click(screen.getByRole("button", { name: "Show reference answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  await screen.findByRole("button", { name: "Finish session" });
  expect(screen.getByText("Question 2 of 2 · 2 answered")).toBeTruthy();
});

it("keeps each ungraded answer when moving between practice questions", async () => {
  const second = { ...task, id: "c".repeat(12), topic: "Meiosis" };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active", tasks: [task, second] }] });
  render(<ExamCoachPanel {...props} />);
  fireEvent.change(await screen.findByLabelText("Your answer"), { target: { value: "First draft answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Second draft answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
  expect((screen.getByLabelText("Your answer") as HTMLTextAreaElement).value).toBe("First draft answer");
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  expect((screen.getByLabelText("Your answer") as HTMLTextAreaElement).value).toBe("Second draft answer");
});

it("allows self-rating after requesting an explanation without an extra reveal", async () => {
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [{ ...draft, status: "active" }] });
  apiMock.explainCoachTask.mockResolvedValue({ answer: task.answer, generated_by: "basic", model: null, citations: [], notice: null });
  render(<ExamCoachPanel {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Show explanation" }));
  await screen.findByText(task.answer);
  expect(screen.getByRole("button", { name: "Revise again" })).toBeTruthy();
});

it("preserves unsaved answers to other questions when one answer is rated", async () => {
  const second = { ...task, id: "c".repeat(12), topic: "Meiosis" };
  const active = { ...draft, status: "active", tasks: [task, second] };
  apiMock.getCoachState.mockResolvedValue({ goal, sessions: [active] });
  apiMock.recordCoachAttempt.mockResolvedValue({ ...active, attempts: [{ task_id: task.id, rating: "got_it", response: "First saved answer", created_at: draft.created_at }] });
  render(<ExamCoachPanel {...props} />);
  await screen.findByLabelText("Your answer");
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Keep this second draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "First saved answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Show reference answer" }));
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  await screen.findByText("Question 2 of 2 · 1 answered");
  expect((screen.getByLabelText("Your answer") as HTMLTextAreaElement).value).toBe("Keep this second draft");
});
