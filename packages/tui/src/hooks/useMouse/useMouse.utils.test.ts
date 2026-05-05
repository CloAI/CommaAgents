import { describe, expect, it } from "bun:test";
import { parseMouseEvents } from "./useMouse.utils";

describe("parseMouseEvents", () => {
  // ---------------------------------------------------------------------------
  // Fast paths
  // ---------------------------------------------------------------------------

  it("returns empty array for empty string", () => {
    expect(parseMouseEvents("")).toEqual([]);
  });

  it("returns empty array when no SGR prefix present", () => {
    expect(parseMouseEvents("hello world")).toEqual([]);
    expect(parseMouseEvents("123;45;6M")).toEqual([]); // no [< prefix
  });

  // ---------------------------------------------------------------------------
  // Button press / release
  // ---------------------------------------------------------------------------

  it("parses a left-button press", () => {
    // [<0;10;5M — button 0, col 10, row 5, press (M)
    const events = parseMouseEvents("[<0;10;5M");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "press",
      button: 0,
      column: 10,
      row: 5,
      modifiers: { shift: false, meta: false, ctrl: false },
    });
  });

  it("parses a middle-button press", () => {
    const events = parseMouseEvents("[<1;3;7M");
    expect(events[0]).toMatchObject({ kind: "press", button: 1 });
  });

  it("parses a right-button press", () => {
    const events = parseMouseEvents("[<2;1;1M");
    expect(events[0]).toMatchObject({ kind: "press", button: 2 });
  });

  it("parses a button release", () => {
    // terminator m = release
    const events = parseMouseEvents("[<0;10;5m");
    expect(events[0]).toMatchObject({ kind: "release", button: 0 });
  });

  it("returns button: null for release with button bits 3", () => {
    // button 3 on release = ambiguous "any button released"
    const events = parseMouseEvents("[<3;5;5m");
    expect(events[0]).toMatchObject({ kind: "release", button: null });
  });

  // ---------------------------------------------------------------------------
  // Modifier keys (bits in button byte)
  // ---------------------------------------------------------------------------

  it("decodes shift modifier (bit 2)", () => {
    // shift bit = 4, so button byte = 0 | 4 = 4
    const events = parseMouseEvents("[<4;1;1M");
    expect(events[0]?.modifiers).toMatchObject({ shift: true, meta: false, ctrl: false });
    expect(events[0]?.button).toBe(0);
    expect(events[0]?.kind).toBe("press");
  });

  it("decodes meta modifier (bit 3)", () => {
    // meta bit = 8
    const events = parseMouseEvents("[<8;1;1M");
    expect(events[0]?.modifiers).toMatchObject({ shift: false, meta: true, ctrl: false });
  });

  it("decodes ctrl modifier (bit 4)", () => {
    // ctrl bit = 16
    const events = parseMouseEvents("[<16;1;1M");
    expect(events[0]?.modifiers).toMatchObject({ shift: false, meta: false, ctrl: true });
  });

  it("decodes combined modifiers", () => {
    // shift + ctrl = 4 + 16 = 20, right button = 2 → 22
    const events = parseMouseEvents("[<22;5;5M");
    expect(events[0]?.modifiers).toMatchObject({ shift: true, meta: false, ctrl: true });
    expect(events[0]?.button).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Wheel events
  // ---------------------------------------------------------------------------

  it("parses wheel-up (button 64)", () => {
    const events = parseMouseEvents("[<64;20;10M");
    expect(events[0]).toMatchObject({ kind: "wheel-up", button: null, column: 20, row: 10 });
  });

  it("parses wheel-down (button 65)", () => {
    const events = parseMouseEvents("[<65;20;10M");
    expect(events[0]).toMatchObject({ kind: "wheel-down", button: null });
  });

  // ---------------------------------------------------------------------------
  // Motion events (?1003h mode)
  // ---------------------------------------------------------------------------

  it("parses motion-without-button (button 35 = 0x20 | 3)", () => {
    // MOTION_BIT = 32, button bits = 3 → 35
    const events = parseMouseEvents("[<35;15;8M");
    expect(events[0]).toMatchObject({ kind: "move", button: null, column: 15, row: 8 });
  });

  it("parses drag (motion + button held, button 32 = 0x20 | 0 = left drag)", () => {
    // MOTION_BIT = 32, button 0 held → 32
    const events = parseMouseEvents("[<32;5;5M");
    expect(events[0]).toMatchObject({ kind: "drag", button: 0 });
  });

  it("parses right-button drag (button 34 = 0x20 | 2)", () => {
    const events = parseMouseEvents("[<34;1;1M");
    expect(events[0]).toMatchObject({ kind: "drag", button: 2 });
  });

  // ---------------------------------------------------------------------------
  // Multiple events in one chunk
  // ---------------------------------------------------------------------------

  it("parses multiple events bundled in one chunk", () => {
    // Two rapid wheel-up ticks bundled by the terminal
    const events = parseMouseEvents("[<64;10;5M[<64;10;5M");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "wheel-up" });
    expect(events[1]).toMatchObject({ kind: "wheel-up" });
  });

  it("parses mixed event types in one chunk", () => {
    const events = parseMouseEvents("[<0;5;5M[<35;5;6M[<0;5;5m");
    expect(events).toHaveLength(3);
    expect(events[0]?.kind).toBe("press");
    expect(events[1]?.kind).toBe("move");
    expect(events[2]?.kind).toBe("release");
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("ignores non-mouse content surrounding a valid sequence", () => {
    const events = parseMouseEvents("some text[<0;1;1Mmore text");
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("press");
  });

  it("returns empty array for incomplete sequence (no terminator)", () => {
    expect(parseMouseEvents("[<0;10;5")).toEqual([]);
  });

  it("handles large coordinates", () => {
    const events = parseMouseEvents("[<0;220;50M");
    expect(events[0]).toMatchObject({ column: 220, row: 50 });
  });
});
