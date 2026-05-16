import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { ExportEvents } from "@/core/domain/export/events";
import { ExportJobId } from "@/core/domain/export/valueObject";
import { UserId } from "@/core/domain/identity/valueObject";
import { exportEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const ID_BASE = "00000000-0000-7000-8000-";
const eventId = (n: number): EventId =>
  EventId.create(`${ID_BASE}${n.toString(16).padStart(12, "0")}`);
const jobId = (n: number) =>
  ExportJobId.create(
    `01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  );

describe("exportEventDecoders.requested", () => {
  it("decodes a valid wire payload back into branded values", () => {
    const id = jobId(1);
    const ownerId = UserId.create("owner-1");
    const draft = ExportEvents.requested(id, ownerId, "html", "multiple", T0);

    const decoded = exportEventDecoders["export.job.requested"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.type).toBe("export.job.requested");
    expect(decoded.payload.exportJobId).toBe(id);
    expect(decoded.payload.ownerId).toBe(ownerId);
    expect(decoded.payload.format).toBe("html");
    expect(decoded.payload.scope).toBe("multiple");
  });

  it("rejects an unknown format string", () => {
    const id = jobId(2);
    expect(() =>
      exportEventDecoders["export.job.requested"](
        {
          exportJobId: id,
          ownerId: "owner-1",
          format: "docx",
          scope: "single",
        },
        { id: eventId(2), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects extra wire fields (.strict schema)", () => {
    const id = jobId(3);
    expect(() =>
      exportEventDecoders["export.job.requested"](
        {
          exportJobId: id,
          ownerId: "owner-1",
          format: "html",
          scope: "single",
          extra: "nope",
        },
        { id: eventId(3), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    const id = jobId(4);
    expect(() =>
      exportEventDecoders["export.job.requested"](
        { exportJobId: id, ownerId: "owner-1", format: "html" },
        { id: eventId(4), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});

describe("exportEventDecoders.started", () => {
  it("decodes total payload", () => {
    const id = jobId(10);
    const draft = ExportEvents.started(id, 5, T0);
    const decoded = exportEventDecoders["export.job.started"](draft.payload, {
      id: eventId(10),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.payload.exportJobId).toBe(id);
    expect(decoded.payload.total).toBe(5);
  });

  it("rejects non-number total", () => {
    const id = jobId(11);
    expect(() =>
      exportEventDecoders["export.job.started"](
        { exportJobId: id, total: "5" },
        { id: eventId(11), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});

describe("exportEventDecoders.completed", () => {
  it("decodes artifactKey and artifactSize", () => {
    const id = jobId(20);
    const draft = ExportEvents.completed(id, "exports/x/y.zip", 1024, T0);
    const decoded = exportEventDecoders["export.job.completed"](draft.payload, {
      id: eventId(20),
      occurredAt: draft.occurredAt,
      aggregateId: id,
    });
    expect(decoded.payload.artifactKey).toBe("exports/x/y.zip");
    expect(decoded.payload.artifactSize).toBe(1024);
  });

  it("rejects empty artifactKey via re-validation", () => {
    const id = jobId(21);
    expect(() =>
      exportEventDecoders["export.job.completed"](
        { exportJobId: id, artifactKey: "  ", artifactSize: 1 },
        { id: eventId(21), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });

  it("rejects negative artifactSize via re-validation", () => {
    const id = jobId(22);
    expect(() =>
      exportEventDecoders["export.job.completed"](
        { exportJobId: id, artifactKey: "k", artifactSize: -1 },
        { id: eventId(22), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});

describe("exportEventDecoders.failed", () => {
  it("decodes code + reason", () => {
    const id = jobId(30);
    const draft = ExportEvents.failed(id, "code", "reason", T0);
    const decoded = exportEventDecoders["export.job.failed"](draft.payload, {
      id: eventId(30),
      occurredAt: draft.occurredAt,
      aggregateId: id,
    });
    expect(decoded.payload.code).toBe("code");
    expect(decoded.payload.reason).toBe("reason");
  });

  it("rejects empty code", () => {
    const id = jobId(31);
    expect(() =>
      exportEventDecoders["export.job.failed"](
        { exportJobId: id, code: "", reason: "x" },
        { id: eventId(31), occurredAt: T0, aggregateId: id },
      ),
    ).toThrow();
  });
});

describe("exportEventDecoders.cancelled / expired", () => {
  it("decodes cancelled", () => {
    const id = jobId(40);
    const draft = ExportEvents.cancelled(id, T0);
    const decoded = exportEventDecoders["export.job.cancelled"](draft.payload, {
      id: eventId(40),
      occurredAt: draft.occurredAt,
      aggregateId: id,
    });
    expect(decoded.payload.exportJobId).toBe(id);
  });

  it("decodes expired", () => {
    const id = jobId(41);
    const draft = ExportEvents.expired(id, T0);
    const decoded = exportEventDecoders["export.job.expired"](draft.payload, {
      id: eventId(41),
      occurredAt: draft.occurredAt,
      aggregateId: id,
    });
    expect(decoded.payload.exportJobId).toBe(id);
  });
});
