import type { DaemonCommandMap } from "../../daemon-server/messages/messages.contracts.types";

/** Verify that the kernel infers the skills bindings without a separate command map.
 * @returns {void} Compile-only contract assertions.
 */
function checkSkillsContracts(): void {
  const list: DaemonCommandMap["skills.list"]["arguments"] = {};
  const get: DaemonCommandMap["skills.get"]["arguments"] = {
    cwd: "/workspace",
    name: "review",
  };
  const search: DaemonCommandMap["skills.search"]["arguments"] = {
    query: "review",
  };
  const available: DaemonCommandMap["skills.listForRun"]["result"]["available"] = false;
  const content: DaemonCommandMap["skills.get"]["result"]["skill"]["content"] =
    "Instructions.";
  // @ts-expect-error Exact skill lookup requires a name.
  const missingName: DaemonCommandMap["skills.get"]["arguments"] = {};
  // @ts-expect-error Metadata-only listings must not expose instruction bodies.
  const hiddenContent: DaemonCommandMap["skills.list"]["result"]["skills"][number]["content"] =
    "hidden";
  const wrongLimit: DaemonCommandMap["skills.search"]["arguments"] = {
    query: "review",
    // @ts-expect-error Search limits remain numeric.
    limit: "ten",
  };
  void list;
  void get;
  void search;
  void available;
  void content;
  void missingName;
  void hiddenContent;
  void wrongLimit;
}
void checkSkillsContracts;
