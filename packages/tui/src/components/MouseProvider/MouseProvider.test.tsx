import { describe, expect, it } from "bun:test";
import { Text, useInput } from "ink";
import { render } from "ink-testing-library";
import { useContext, useEffect } from "react";
import type { MouseEvent } from "../../hooks/useMouse/useMouse.types";
import { MouseContext } from "./MouseContext";
import { MouseProvider } from "./MouseProvider";

describe("MouseProvider", () => {
  it("should deliver raw mouse reports while preserving keyboard input", async () => {
    const events: MouseEvent[] = [];
    const keys: string[] = [];

    function Listener() {
      const mouse = useContext(MouseContext);
      useEffect(() => mouse?.subscribe((event) => events.push(event)), [mouse]);
      useInput((input) => keys.push(input));
      return <Text>Ready</Text>;
    }

    const result = render(
      <MouseProvider>
        <Listener />
      </MouseProvider>,
    );
    try {
      await Bun.sleep(20);
      result.stdin.write("\x1b[<0;4;5M\x1b[<65;4;5M");
      result.stdin.write("x");
      await Bun.sleep(20);

      expect(
        events.map(({ kind, column, row }) => ({ kind, column, row })),
      ).toEqual([
        { kind: "press", column: 4, row: 5 },
        { kind: "wheel-down", column: 4, row: 5 },
      ]);
      expect(keys).toEqual(["x"]);

      result.stdin.write("\x1b[");
      result.stdin.write("<0;7;");
      result.stdin.write("8m");
      await Bun.sleep(20);
      expect(events.at(-1)).toMatchObject({
        kind: "release",
        column: 7,
        row: 8,
      });

      result.unmount();
      result.stdin.write("\x1b[<0;1;1M");
      expect(events).toHaveLength(3);
    } finally {
      result.unmount();
      result.cleanup();
    }
  });
});
