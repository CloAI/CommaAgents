import {
  Wrench,
  Brain,
  Eye,
  Paperclip,
  Braces,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModelCapability } from "./ModelBrowser.types";

export const MODEL_CAPABILITIES = [
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "vision", label: "Vision", icon: Eye },
  { id: "attachment", label: "Attachments", icon: Paperclip },
  { id: "structuredOutput", label: "Structured output", icon: Braces },
  { id: "teeAttestation", label: "TEE attestation support", icon: ShieldCheck },
  { id: "e2ee", label: "E2EE support", icon: LockKeyhole },
] as const satisfies readonly {
  readonly id: ModelCapability;
  readonly label: string;
  readonly icon: LucideIcon;
}[];

export const MODELS_PER_PAGE = 25;
