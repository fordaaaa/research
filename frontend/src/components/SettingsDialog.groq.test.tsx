// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SettingsDialog from "./SettingsDialog";

const apiMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  getAISettings: vi.fn(),
  saveAISettings: vi.fn(),
  clearAISettings: vi.fn(),
}));
vi.mock("../api", () => apiMocks);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showSettings(overrides: Record<string, unknown> = {}) {
  return render(
    <SettingsDialog
      open
      onClose={vi.fn()}
      onChanged={vi.fn()}
      appearance={{ theme: "paper", font: "readable" }}
      onAppearanceChange={vi.fn()}
      {...overrides}
    />,
  );
}

it("offers Groq with a personal-key free-tier helper mentioning console.groq.com", () => {
  apiMocks.getToken.mockReturnValue(null);
  showSettings();
  const providerSelect = screen.getByRole("combobox") as HTMLSelectElement;
  const options = within(providerSelect).getAllByRole("option").map((o) => o.textContent);
  expect(options).toContain("Groq");
  fireEvent.change(providerSelect, { target: { value: "groq" } });
  const helper = screen.getByText(/personal.*api key/i);
  expect(helper.textContent).toMatch(/free-tier limits apply/i);
  expect(helper.textContent).toContain("console.groq.com");
});

it("selecting Groq resets the model to openai/gpt-oss-20b", () => {
  apiMocks.getToken.mockReturnValue(null);
  showSettings();
  const providerSelect = screen.getByRole("combobox");
  fireEvent.change(providerSelect, { target: { value: "groq" } });
  expect(screen.getByDisplayValue("openai/gpt-oss-20b")).toBeTruthy();
});

it("saves Groq with the default model and reloads persisted settings without a key", async () => {
  apiMocks.getToken.mockReturnValue("session-token");
  apiMocks.getAISettings.mockResolvedValue({ configured: false, provider: null, model: null });
  apiMocks.saveAISettings.mockResolvedValue({
    configured: true,
    provider: "groq",
    model: "openai/gpt-oss-20b",
  });
  const onChanged = vi.fn();
  showSettings({ onChanged });
  const providerSelect = screen.getByRole("combobox");
  fireEvent.change(providerSelect, { target: { value: "groq" } });
  const keyInput = screen.getByPlaceholderText(/paste a free-tier key/i);
  fireEvent.change(keyInput, { target: { value: "gsk-test-key-long-enough" } });
  fireEvent.click(screen.getByRole("button", { name: /enable ai/i }));
  await waitFor(() => expect(apiMocks.saveAISettings).toHaveBeenCalledWith(
    "gsk-test-key-long-enough",
    "openai/gpt-oss-20b",
    "groq",
  ));
  expect(onChanged).toHaveBeenCalledWith(true);
  // Key input clears after save: the secret is never echoed back.
  await waitFor(() => expect((keyInput as HTMLInputElement).value).toBe(""));

  // Reload with persisted Groq settings: provider + model restore, key stays empty.
  cleanup();
  apiMocks.getAISettings.mockResolvedValue({
    configured: true,
    provider: "groq",
    model: "openai/gpt-oss-20b",
  });
  showSettings();
  await waitFor(() => expect(apiMocks.getAISettings).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("groq"));
  expect(screen.getByDisplayValue("openai/gpt-oss-20b")).toBeTruthy();
  expect((screen.getByPlaceholderText(/replacement key/i) as HTMLInputElement).value).toBe("");
});

it("preserves the motion preview UI alongside the AI settings", () => {
  apiMocks.getToken.mockReturnValue(null);
  showSettings();
  expect(screen.getByRole("button", { name: /try motion/i })).toBeTruthy();
  // Groq option coexists with the existing providers.
  const providerSelect = screen.getByRole("combobox") as HTMLSelectElement;
  const values = within(providerSelect).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
  expect(values).toContain("gemini");
  expect(values).toContain("openrouter");
  expect(values).toContain("groq");
});
