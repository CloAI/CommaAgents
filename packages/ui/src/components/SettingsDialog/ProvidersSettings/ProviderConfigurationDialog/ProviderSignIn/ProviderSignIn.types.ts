/** Browser sign-in lifecycle owned by the provider configuration workflow. */
export interface ProviderSignInProps {
  /** Provider owning this browser authorization. */
  readonly providerId: "openai" | "github-copilot";
  /** Reload providers and close only after the saved credentials can be displayed. */
  readonly onConnected: () => Promise<void>;
  /** Prevent switching forms or closing during sign-in. */
  readonly onBusyChange: (busy: boolean) => void;
}
