import { describe, expect, it } from "vitest";
import { zoneAt } from "./DropZones.utils";

describe("zoneAt", () => {
  it("should name the edge the pointer is closest to", () => {
    expect(zoneAt(10, 100, 400, 200)).toBe("left");
    expect(zoneAt(390, 100, 400, 200)).toBe("right");
    expect(zoneAt(200, 5, 400, 200)).toBe("top");
    expect(zoneAt(200, 195, 400, 200)).toBe("bottom");
  });

  it("should compare distances as shares of the pane, not pixels", () => {
    // 100px from the left is 25% of a wide pane but 20px from the top is 10% of a short one.
    expect(zoneAt(100, 20, 400, 200)).toBe("top");
    expect(zoneAt(60, 100, 400, 200)).toBe("left");
  });

  it("should always choose an edge, even in the middle", () => {
    expect(["left", "right", "top", "bottom"]).toContain(
      zoneAt(200, 100, 400, 200),
    );
    expect(["left", "right", "top", "bottom"]).toContain(zoneAt(0, 0, 0, 0));
  });
});
