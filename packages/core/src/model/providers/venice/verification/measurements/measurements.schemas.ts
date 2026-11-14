import { z } from "zod";

export const DstackEventSchema = z.object({
  imr: z.number().int().min(0).max(3),
  event_type: z.number().int().min(0).max(0xffffffff),
  event: z.string().max(1024),
  event_payload: z.string().regex(/^(?:[a-f0-9]{2})*$/i),
  digest: z.string().optional(),
});

export const ComposeManagerSchema = z.object({
  quote: z.string().min(1),
  nonce: z.string().regex(/^[a-f0-9]{64}$/i),
  actions_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  actions: z.array(z.record(z.unknown())).max(4096),
  event_log: z.unknown(),
});

/** Trusted profiles deliberately exclude values obtained from an attestation response. */
export const WorkloadPolicySchema = z
  .object({
    mrTd: z.string().regex(/^[a-f0-9]{96}$/i),
    rtMr0: z.string().regex(/^[a-f0-9]{96}$/i),
    rtMr1: z.string().regex(/^[a-f0-9]{96}$/i),
    rtMr2: z.string().regex(/^[a-f0-9]{96}$/i),
    appId: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
    keyProviderHash: z.string().regex(/^[a-f0-9]{64}$/i),
    composeHash: z.string().regex(/^[a-f0-9]{64}$/i),
    osImageHash: z.string().regex(/^[a-f0-9]{64}$/i),
    composeManagerActionsHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
  })
  .strict();
