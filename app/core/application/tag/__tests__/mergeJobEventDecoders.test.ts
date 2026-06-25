import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { TagMergeEvents } from "@/core/domain/tag/mergeJob/events";
import { TagMergeJobId } from "@/core/domain/tag/mergeJob/valueObject";
import { defaultEventDecoderRegistry } from "../../workers/eventRelayWorker";
import { tagMergeJobEventDecoders } from "../mergeJobEventDecoders";

const T0 = new Date(0);

const eventId = (n: number): EventId =>
  EventId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const jobId = (n: number) =>
  TagMergeJobId.create(
    `01950580-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  );

describe("tagMergeJobEventDecoders.requested", () => {
  it("decodes a valid wire payload back into branded values", () => {
    const id = jobId(1);
    const draft = TagMergeEvents.requested(id, T0);

    const decoded = tagMergeJobEventDecoders["tag.merge.requested"](
      draft.payload,
      { id: eventId(1), occurredAt: draft.occurredAt, aggregateId: id },
    );

    expect(decoded.type).toBe("tag.merge.requested");
    expect(decoded.payload.jobId).toBe(id);
  });

  it("rejects an empty jobId via re-validation", () => {
    const id = jobId(2);
    expect(() =>
      tagMergeJobEventDecoders["tag.merge.requested"](
        { jobId: "   " },
        { id: eventId(2), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects extra wire fields (.strict schema)", () => {
    const id = jobId(3);
    expect(() =>
      tagMergeJobEventDecoders["tag.merge.requested"](
        { jobId: id, extra: "nope" },
        { id: eventId(3), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});

// Regression for the relay decode gap (Issue #580): `tag.merge.requested`
// is emitted on enqueue and must be decodable through the shared registry,
// or the relay quarantines the row and `runTagMergeJob` never fires.
describe("defaultEventDecoderRegistry covers tag.merge.requested", () => {
  it("has a decoder registered for the merge-requested event", () => {
    const decoder = (defaultEventDecoderRegistry as Record<string, unknown>)[
      "tag.merge.requested"
    ];
    expect(decoder).toBeTypeOf("function");
  });

  it("decodes the enqueue payload via the registry", () => {
    const id = jobId(9);
    const draft = TagMergeEvents.requested(id, T0);

    const decoded = defaultEventDecoderRegistry["tag.merge.requested"](
      draft.payload,
      { id: eventId(9), occurredAt: draft.occurredAt, aggregateId: id },
    );

    expect(decoded.type).toBe("tag.merge.requested");
    expect(decoded.payload.jobId).toBe(id);
  });
});
