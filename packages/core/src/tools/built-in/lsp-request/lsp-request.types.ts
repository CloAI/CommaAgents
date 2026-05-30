import type { LspMethod, LspResponse } from "../../../language";

export interface LspRequestData extends LspResponse {
  readonly method: LspMethod;
}
