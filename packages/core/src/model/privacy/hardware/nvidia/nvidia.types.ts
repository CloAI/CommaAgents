/** Authenticated NRAS envelope and individually signed GPU submodules. @internal */
export interface NvidiaTokens {
  readonly overall: string;
  readonly devices: Readonly<Record<string, string>>;
}
/** NVIDIA-verified hardware identities and claim expiry. @internal */
export interface NvidiaVerification {
  readonly expiresAt: number;
  readonly deviceIds: readonly string[];
}
