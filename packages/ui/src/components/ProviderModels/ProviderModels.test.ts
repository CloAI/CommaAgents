import { describe, expect, it } from "vitest";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { providerStatus } from "./ProviderModels.utils";

const [alpha, beta, empty] = exampleProviders;

describe("providerStatus", () => {
  it("should offer configuration for a configured provider", () => {
    expect(providerStatus(alpha!, undefined)).toEqual({
      actionLabel: "Configure",
      connectionLabel: "Connected",
      indicator: "configured",
      description:
        "Alpha: Connected. Configuration status; access not verified.",
    });
  });

  it("should treat a provider without credentials as connected", () => {
    expect(providerStatus(beta!, undefined).indicator).toBe("configured");
  });

  it("should ask for credentials when they are missing", () => {
    expect(providerStatus(empty!, undefined)).toMatchObject({
      actionLabel: "Connect",
      connectionLabel: "Needs credentials",
      indicator: "unconfigured",
    });
  });

  it("should show a passed check as verified", () => {
    expect(
      providerStatus(alpha!, {
        providerId: "alpha",
        status: "verified",
        checkedAt: "2026-10-24T00:00:00Z",
      }),
    ).toMatchObject({
      connectionLabel: "Verified",
      description: "Alpha: Verified. Authenticated model-list check passed.",
    });
  });

  it("should warn about failed checks", () => {
    const status = providerStatus(alpha!, {
      providerId: "alpha",
      status: "invalid_credentials",
      checkedAt: "2026-10-24T00:00:00Z",
    });
    expect(status.indicator).toBe("warning");
    expect(status.description).toBe(
      "Alpha: Connected. Configuration status; access not verified. Verification: invalid_credentials.",
    );
  });
});
