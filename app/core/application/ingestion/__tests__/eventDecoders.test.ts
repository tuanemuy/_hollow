import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { IngestionEvents } from "@/core/domain/ingestion/events";
import {
  IngestionJobId,
  SourceFileKind,
} from "@/core/domain/ingestion/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { ingestionEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const jobId = (n: number) =>
  IngestionJobId.create(
    `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  );
const noteId = (n: number) =>
  NoteId.create(
    `01950000-0000-7000-8000-${(n + 1000).toString(16).padStart(12, "0")}`,
  );
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

describe("ingestionEventDecoders", () => {
  it("decodes ingestion.created and rehydrates branded VOs", () => {
    const id = jobId(1);
    const draft = IngestionEvents.created(
      id,
      SourceFileKind.create("html"),
      T0,
    );
    const decoded = ingestionEventDecoders["ingestion.created"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.type).toBe("ingestion.created");
    expect(decoded.payload.jobId).toBe(id);
    expect(decoded.payload.kind).toBe("html");
  });

  it("decodes ingestion.processingStarted / previewAttached / discarded / retryRequested", () => {
    const id = jobId(2);
    for (const t of [
      "ingestion.processingStarted",
      "ingestion.previewAttached",
      "ingestion.discarded",
      "ingestion.retryRequested",
    ] as const) {
      const decoded = ingestionEventDecoders[t](
        { jobId: id },
        { id: eventId(2), occurredAt: T0, aggregateId: id },
      );
      expect(decoded.type).toBe(t);
      expect(decoded.payload.jobId).toBe(id);
    }
  });

  it("decodes ingestion.regenerated and preserves regenerationCount", () => {
    const id = jobId(3);
    const decoded = ingestionEventDecoders["ingestion.regenerated"](
      { jobId: id, regenerationCount: 4 },
      { id: eventId(3), occurredAt: T0, aggregateId: id },
    );
    expect(decoded.payload.regenerationCount).toBe(4);
  });

  it("decodes ingestion.committed and rehydrates the NoteId", () => {
    const id = jobId(4);
    const note = noteId(1);
    const decoded = ingestionEventDecoders["ingestion.committed"](
      { jobId: id, noteId: note },
      { id: eventId(4), occurredAt: T0, aggregateId: id },
    );
    expect(decoded.payload.jobId).toBe(id);
    expect(decoded.payload.noteId).toBe(note);
  });

  it("decodes ingestion.failed with code + reason verbatim", () => {
    const id = jobId(5);
    const decoded = ingestionEventDecoders["ingestion.failed"](
      { jobId: id, errorCode: "llm_failure", errorReason: "upstream 500" },
      { id: eventId(5), occurredAt: T0, aggregateId: id },
    );
    expect(decoded.payload.errorCode).toBe("llm_failure");
    expect(decoded.payload.errorReason).toBe("upstream 500");
  });

  it("rejects unknown wire fields (strict schema)", () => {
    const id = jobId(6);
    expect(() =>
      ingestionEventDecoders["ingestion.created"](
        { jobId: id, kind: "html", future: true },
        { id: eventId(6), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    const id = jobId(7);
    expect(() =>
      ingestionEventDecoders["ingestion.created"](
        { jobId: id },
        { id: eventId(7), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
    expect(() =>
      ingestionEventDecoders["ingestion.committed"](
        { jobId: id },
        { id: eventId(7), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects wrong field types instead of coercing", () => {
    const id = jobId(8);
    expect(() =>
      ingestionEventDecoders["ingestion.regenerated"](
        { jobId: id, regenerationCount: "4" },
        { id: eventId(8), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
    expect(() =>
      ingestionEventDecoders["ingestion.regenerated"](
        { jobId: id, regenerationCount: -1 },
        { id: eventId(8), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});
