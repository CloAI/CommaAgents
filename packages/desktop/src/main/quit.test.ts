import { describe, expect, it, vi } from "vitest";
import { confirmQuit, quitDialogOptions } from "./quit";

describe("confirmQuit", () => {
  it("quits without asking when nothing is running", async () => {
    const ask = vi.fn();
    expect(await confirmQuit(0, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("quits only when the Quit button is pressed", async () => {
    expect(await confirmQuit(2, async () => 1)).toBe(true);
    expect(await confirmQuit(2, async () => 0)).toBe(false);
  });

  it("says how many runs would be stopped", () => {
    expect(quitDialogOptions(1).message).toBe(
      "1 run is still active. Quit and stop it?",
    );
    expect(quitDialogOptions(3).message).toBe(
      "3 runs are still active. Quit and stop them?",
    );
    expect(quitDialogOptions(3).buttons).toEqual(["Cancel", "Quit"]);
  });
});
