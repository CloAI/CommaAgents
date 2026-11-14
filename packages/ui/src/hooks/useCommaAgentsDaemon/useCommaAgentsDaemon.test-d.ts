import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";
import { useCommaAgentsDaemon } from "./useCommaAgentsDaemon";

/**
 * Compile-only consumer checks; never mounted or executed.
 * @returns {void} Nothing; type assertions are checked statically.
 */
function useContractChecks() {
  const providers = useCommaAgentsDaemon(
    { channel: "core.providers.list" },
    {},
  );
  // @ts-expect-error The provider list takes no arguments.
  useCommaAgentsDaemon({ channel: "core.providers.list" }, { live: true });
  const providerId: string | undefined = providers.data?.data.providers[0]?.id;
  // @ts-expect-error Provider metadata retains its message types.
  const invalidProviderId: number | undefined =
    providers.data?.data.providers[0]?.id;
  void providerId;
  void invalidProviderId;
  const configuration = useCommaAgentsDaemon(
    { command: "core.providers.getConfiguration" },
    { providerId: "openai" },
  );
  const source: "none" | "environment" | "global" | undefined =
    configuration.data?.credentialSource;
  const customModels: readonly { readonly id: string }[] | undefined =
    configuration.data?.customModels;
  const verification = useCommaAgentsDaemon(
    { command: "core.providers.verify" },
    { providerId: "openai" },
  );
  // @ts-expect-error Verification returns its typed status rather than a boolean.
  const verified: boolean | undefined = verification.data?.status;
  // @ts-expect-error API-key configuration requires the key.
  useCommaAgentsDaemon(
    { command: "core.providers.configure" },
    { providerId: "openai" },
  );
  // @ts-expect-error Custom model arguments preserve their provider-local model ID type.
  useCommaAgentsDaemon(
    { command: "core.providers.addCustomProviderModel" },
    { providerId: "openai", modelId: 42 },
  );
  // @ts-expect-error Serializable endpoint definitions do not accept arbitrary SDK packages.
  useCommaAgentsDaemon(
    { command: "core.providers.addCustomProvider" },
    {
      id: "custom",
      name: "Custom",
      baseURL: "http://localhost/v1",
      credentialType: "api",
      packageName: "untrusted",
    },
  );
  void source;
  void customModels;
  void verified;
  const run = useCommaAgentsDaemon({ command: "runs.get" }, { runId: "run" });
  const result: DaemonCommandMap["runs.get"]["result"] | undefined = run.data;
  // @ts-expect-error A command requires its own arguments.
  useCommaAgentsDaemon({ command: "runs.get" }, {});
  // @ts-expect-error Unknown command names are rejected.
  useCommaAgentsDaemon({ command: "runs.unknown" }, {});
  // @ts-expect-error Commands run automatically and expose no execution control.
  run.execute();
  // @ts-expect-error Command argument types remain inferred.
  useCommaAgentsDaemon({ command: "runs.get" }, { runId: 42 });
  // @ts-expect-error Results are inferred rather than any.
  const invalidResult: number = run.data;
  const channel = useCommaAgentsDaemon({ channel: "runs" }, { runId: "run" });
  // @ts-expect-error Channels subscribe automatically and do not expose execute.
  channel.execute();
  // @ts-expect-error Channel arguments are inferred independently of commands.
  useCommaAgentsDaemon({ channel: "runs" }, { runId: 42 });
  if (channel.data?.type === "input.requested") {
    const inputId: string = channel.data.data.inputId;
    // @ts-expect-error Domain event data narrows with its discriminator.
    const invalidInput: number = channel.data.data.inputId;
    void inputId;
    void invalidInput;
  }
  void result;
  void invalidResult;
}
void useContractChecks;
