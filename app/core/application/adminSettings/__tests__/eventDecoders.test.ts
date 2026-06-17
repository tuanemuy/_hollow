import { describe, expect, it } from "vitest";
import { AdminSettingsEvents } from "@/core/domain/adminSettings/events";
import { EventId } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { adminSettingsEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const userId = (n: number) =>
  UserId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

describe("adminSettingsEventDecoders", () => {
  it("decodes an instance_settings.updated payload and rehydrates the UserId brand", () => {
    const actor = userId(1);
    const draft = AdminSettingsEvents.updated(
      "design_tokens",
      actor,
      "デザイントークンをリセット",
      T0,
    );
    const decoded = adminSettingsEventDecoders["instance_settings.updated"](
      draft.payload,
      {
        id: eventId(1),
        occurredAt: draft.occurredAt,
        aggregateId: draft.aggregateId,
      },
    );
    expect(decoded.type).toBe("instance_settings.updated");
    expect(decoded.payload.settingKind).toBe("design_tokens");
    expect(decoded.payload.actorId).toBe(actor);
    expect(decoded.payload.summary).toBe("デザイントークンをリセット");
  });

  it("accepts every settingKind in the union (round-trips the enum)", () => {
    const kinds = [
      "registration_policy",
      "llm_config",
      "speech_config",
      "prompt_template",
      "instance_limits",
      "design_tokens",
    ] as const;
    for (const kind of kinds) {
      const decoded = adminSettingsEventDecoders["instance_settings.updated"](
        { settingKind: kind, actorId: userId(2), summary: "変更" },
        { id: eventId(2), occurredAt: T0, aggregateId: "singleton" },
      );
      expect(decoded.payload.settingKind).toBe(kind);
    }
  });

  it("rejects an unknown settingKind value", () => {
    expect(() =>
      adminSettingsEventDecoders["instance_settings.updated"](
        { settingKind: "not_a_kind", actorId: userId(3), summary: "変更" },
        { id: eventId(3), occurredAt: T0, aggregateId: "singleton" },
      ),
    ).toThrow();
  });

  it("rejects unknown extra fields (strict schema)", () => {
    expect(() =>
      adminSettingsEventDecoders["instance_settings.updated"](
        {
          settingKind: "registration_policy",
          actorId: userId(4),
          summary: "変更",
          extra: 1,
        },
        { id: eventId(4), occurredAt: T0, aggregateId: "singleton" },
      ),
    ).toThrow();
  });

  it("rejects payloads missing a required field", () => {
    expect(() =>
      adminSettingsEventDecoders["instance_settings.updated"](
        { settingKind: "registration_policy", actorId: userId(5) },
        { id: eventId(5), occurredAt: T0, aggregateId: "singleton" },
      ),
    ).toThrow();
  });
});
