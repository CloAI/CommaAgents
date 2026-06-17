import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { MemoryRouter } from "react-router";
import { ExperimentProvider } from "../../hooks/useExperiment";
import { ThemeProvider } from "../../theme";
import { ExperimentPickerPage } from "./ExperimentPickerPage";

describe("ExperimentPickerPage", () => {
  it("mounts and renders the header + create entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "rlprompter-ui-"));
    try {
      const { lastFrame, unmount } = render(
        <MemoryRouter>
          <ThemeProvider>
            <ExperimentProvider rootDir={root}>
              <ExperimentPickerPage />
            </ExperimentProvider>
          </ThemeProvider>
        </MemoryRouter>,
      );

      // Let the mount effect (refresh) settle.
      await new Promise((resolve) => setTimeout(resolve, 20));

      const frame = lastFrame() ?? "";
      expect(frame).toContain("rlprompter");
      expect(frame).toContain("New experiment");
      unmount();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
