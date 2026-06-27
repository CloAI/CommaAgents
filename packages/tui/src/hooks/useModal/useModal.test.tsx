import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";

import { useModal } from "./useModal";
import { ModalContextProvider } from "./useModal.context";
import type { ModalControls } from "./useModal.types";

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    }
    await Bun.sleep(5);
  }
}

describe("useModal", () => {
  it("should preserve control callback identities across modal state changes", async () => {
    let controls: ModalControls | undefined;

    function Probe(): React.ReactElement {
      controls = useModal("test-modal");
      return <Text>{controls.isOpen ? "open" : "closed"}</Text>;
    }

    const result = render(
      <ModalContextProvider>
        <Probe />
      </ModalContextProvider>,
    );
    const initialOpen = controls?.open;
    const initialClose = controls?.close;
    const initialToggle = controls?.toggle;

    controls?.open();
    await waitFor(() => result.lastFrame() === "open");

    expect(controls?.open).toBe(initialOpen);
    expect(controls?.close).toBe(initialClose);
    expect(controls?.toggle).toBe(initialToggle);
    result.cleanup();
  });

  it("should not rerender consumers when closing an already closed modal", async () => {
    let controls: ModalControls | undefined;
    let renderCount = 0;

    function Probe(): React.ReactElement {
      renderCount += 1;
      controls = useModal("test-modal");
      return <Text>{renderCount}</Text>;
    }

    const result = render(
      <ModalContextProvider>
        <Probe />
      </ModalContextProvider>,
    );
    const initialRenderCount = renderCount;

    controls?.close();
    await Bun.sleep(20);

    expect(renderCount).toBe(initialRenderCount);
    result.cleanup();
  });
});
