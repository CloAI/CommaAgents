import type { TDReport10 } from "@phala/dcap-qvl";

/** Build software-log vectors computed independently with Python hashlib/struct.
 * @returns {object} Synthetic report fields for testing appraisal after hardware authentication.
 */
export function measurementFixture() {
  const appCompose = '{"manifest_version":2,"name":"test"}';
  const composeHash =
    "7eb296a92fe4bf0f3fd6350aa6be5ef70e01453aa150f469b82ebaa9865e7e26";
  const osImageHash = "22".repeat(32);
  const events = [
    { event: "system-preparing", event_payload: "" },
    { event: "app-id", event_payload: "11".repeat(20) },
    { event: "compose-hash", event_payload: composeHash },
    { event: "os-image-hash", event_payload: osImageHash },
    {
      event: "key-provider",
      event_payload: Buffer.from('{"name":"kms","id":"test-root"}').toString(
        "hex",
      ),
    },
    { event: "system-ready", event_payload: "" },
  ].map((event) => ({ imr: 3, event_type: 0x08000001, digest: "", ...event }));
  const report: TDReport10 = {
    teeTcbSvn: new Uint8Array(16),
    mrSeam: new Uint8Array(48),
    mrSignerSeam: new Uint8Array(48),
    seamAttributes: new Uint8Array(8),
    tdAttributes: new Uint8Array(8),
    xfam: new Uint8Array(8),
    mrTd: new Uint8Array(48).fill(1),
    mrConfigId: Buffer.from(`01${composeHash}${"00".repeat(15)}`, "hex"),
    mrOwner: new Uint8Array(48),
    mrOwnerConfig: new Uint8Array(48),
    rtMr0: new Uint8Array(48).fill(2),
    rtMr1: new Uint8Array(48).fill(3),
    rtMr2: new Uint8Array(48).fill(4),
    rtMr3: Buffer.from(
      "31ea29604eb0ac865e59403e3c897b49df76c22b9dfa28823817e0e9ff6666c17d7ae1c2c578ec1dd0bffd25d274a1e9",
      "hex",
    ),
    reportData: new Uint8Array(64),
  };
  return { appCompose, composeHash, osImageHash, events, report };
}
