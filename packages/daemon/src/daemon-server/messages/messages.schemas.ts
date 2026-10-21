import { z } from "zod/v4";

export const RequestIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Expected a UUIDv4 requestId",
  );
export const BindingErrorSchema = z
  .object({ code: z.string().min(1), message: z.string() })
  .strict();
const ClientEnvelopeSchema = z.object({ requestId: RequestIdSchema });
const ServerEnvelopeSchema = ClientEnvelopeSchema.extend({
  ts: z.string().datetime(),
});

export const CommandRequestSchema = ClientEnvelopeSchema.extend({
  type: z.literal("command"),
  command: z.string().min(1),
  arguments: z.record(z.string(), z.json()),
}).strict();
export const SubscribeRequestSchema = ClientEnvelopeSchema.extend({
  type: z.literal("subscribe"),
  channel: z.string().min(1),
  arguments: z.record(z.string(), z.json()),
}).strict();
export const UnsubscribeRequestSchema = ClientEnvelopeSchema.extend({
  type: z.literal("unsubscribe"),
}).strict();
export const ClientMessageSchema = z.discriminatedUnion("type", [
  CommandRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
]);

export const ResponseSchema = z.discriminatedUnion("ok", [
  ServerEnvelopeSchema.extend({
    type: z.literal("response"),
    ok: z.literal(true),
    data: z.json(),
  }).strict(),
  ServerEnvelopeSchema.extend({
    type: z.literal("response"),
    ok: z.literal(false),
    error: BindingErrorSchema,
  }).strict(),
]);
export const ChannelEventSchema = ServerEnvelopeSchema.extend({
  type: z
    .string()
    .min(1)
    .refine(
      (type) =>
        ![
          "command",
          "subscribe",
          "unsubscribe",
          "response",
          "subscription_end",
          "event",
        ].includes(type),
    ),
  data: z.json(),
}).strict();
export const SubscriptionEndSchema = z.discriminatedUnion("reason", [
  ServerEnvelopeSchema.extend({
    type: z.literal("subscription_end"),
    reason: z.literal("completed"),
  }).strict(),
  ServerEnvelopeSchema.extend({
    type: z.literal("subscription_end"),
    reason: z.literal("unsubscribed"),
  }).strict(),
  ServerEnvelopeSchema.extend({
    type: z.literal("subscription_end"),
    reason: z.literal("failed"),
    error: BindingErrorSchema,
  }).strict(),
]);
export const ServerMessageSchema = z.union([
  ResponseSchema,
  ChannelEventSchema,
  SubscriptionEndSchema,
]);
