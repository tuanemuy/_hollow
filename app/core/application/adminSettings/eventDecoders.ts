import { z } from "zod";
import type {
  AdminSettingsEvent,
  InstanceSettingKind,
} from "@/core/domain/adminSettings/events";
import type { EventDecoder } from "@/core/domain/common/event";
import { buildEventDecoder } from "../events/buildDecoder";

const settingKindSchema = z.enum([
  "registration_policy",
  "llm_config",
  "speech_config",
  "prompt_template",
  "instance_limits",
  "design_tokens",
]) satisfies z.ZodType<InstanceSettingKind>;

const updatedSchema = z
  .object({
    settingKind: settingKindSchema,
    actorId: z.string(),
    summary: z.string(),
  })
  .strict();

export type AdminSettingsEventDecoders = {
  readonly [K in AdminSettingsEvent["type"]]: EventDecoder<
    Extract<AdminSettingsEvent, { type: K }>
  >;
};

export const adminSettingsEventDecoders: AdminSettingsEventDecoders = {
  "instance_settings.updated": buildEventDecoder(
    "instance_settings.updated",
    updatedSchema,
    (p) => ({
      settingKind: p.settingKind,
      actorId: p.actorId,
      summary: p.summary,
    }),
  ),
};
