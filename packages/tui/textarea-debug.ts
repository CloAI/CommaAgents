import wrap from "word-wrap";
import {
  buildIndexCellMap,
  computeNextCursorState,
} from "./src/components/TextAreaInput/TextAreaInput.utils";

const measure = (s: string) => s.length;
const value = "hello\n";
const rows = value
  .split("\n")
  .flatMap((seg) =>
    wrap(seg, { width: 80, newline: "\n", indent: "" }).split("\n"),
  );
console.log("rows:", JSON.stringify(rows));
console.log("map:", JSON.stringify(buildIndexCellMap(value, rows, measure)));
console.log(
  "result idx=6:",
  JSON.stringify(
    computeNextCursorState({
      intent: { kind: "snapToCursor" },
      value,
      rows,
      currentCursorIndex: 6,
      currentRowDisplayOffset: 0,
      viewportHeight: 5,
      measureWidth: measure,
    }),
  ),
);

// Mid-buffer insert: "ab" cursor=2, alt+enter -> value="ab\n", cursorIndex=3
const v2 = "ab\n";
const r2 = v2
  .split("\n")
  .flatMap((seg) =>
    wrap(seg, { width: 80, newline: "\n", indent: "" }).split("\n"),
  );
console.log("\nv2 rows:", JSON.stringify(r2));
console.log("v2 map:", JSON.stringify(buildIndexCellMap(v2, r2, measure)));
console.log(
  "v2 result idx=3:",
  JSON.stringify(
    computeNextCursorState({
      intent: { kind: "snapToCursor" },
      value: v2,
      rows: r2,
      currentCursorIndex: 3,
      currentRowDisplayOffset: 0,
      viewportHeight: 5,
      measureWidth: measure,
    }),
  ),
);
