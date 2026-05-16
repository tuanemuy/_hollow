import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ExportJob } from "../entity";
import { ExportOptions } from "../valueObject";

const T0 = new Date(0);

const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = (): string => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};

const owner = (raw: string): UserId => UserId.create(raw);
const noteId = (n: number): NoteId => `n-${n}` as NoteId;

const defaultOptions = () =>
  ExportOptions.create({
    includeFrontMatter: false,
    embedMedia: false,
    pdfPaperSize: null,
  });

const singleJob = () => {
  const { entity } = ExportJob.create(
    {
      id: nextRawId(),
      ownerId: owner("owner-1"),
      format: "html",
      scope: "single",
      targetNoteIds: [noteId(1)],
      viewQuery: null,
      options: defaultOptions(),
    },
    T0,
  );
  return entity;
};

describe("ExportJob lifecycle (property)", () => {
  it("each state-changing operation bumps version by exactly 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (totalNotes) => {
        const pending = singleJob();
        const { entity: started } = ExportJob.startProcessing(
          pending,
          totalNotes,
          T0,
        );
        expect(started.version).toBe(pending.version + 1);

        const { entity: failed } = ExportJob.fail(started, "c", "r", T0);
        expect(failed.version).toBe(started.version + 1);
      }),
    );
  });

  it("recordProgress monotonically advances processed within [0, total]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.array(fc.integer({ min: 0, max: 100 }), {
          minLength: 1,
          maxLength: 10,
        }),
        (total, rawSteps) => {
          const pending = singleJob();
          const { entity: processing } = ExportJob.startProcessing(
            pending,
            total,
            T0,
          );
          let current = processing;
          let lastValid = 0;
          for (const raw of rawSteps) {
            const processed = Math.min(raw, total);
            const { entity: next } = ExportJob.recordProgress(
              current,
              processed,
              T0,
            );
            expect(next.progress.processed).toBe(processed);
            expect(next.progress.processed).toBeLessThanOrEqual(total);
            expect(next.progress.total).toBe(total);
            lastValid = processed;
            current = next;
          }
          expect(current.progress.processed).toBe(lastValid);
        },
      ),
    );
  });

  it("recordFailedNote is idempotent for the same note id", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (n) => {
        const pending = singleJob();
        const { entity: processing } = ExportJob.startProcessing(
          pending,
          1,
          T0,
        );
        const id = noteId(n);
        const { entity: once } = ExportJob.recordFailedNote(processing, id, T0);
        const { entity: twice, eventDrafts } = ExportJob.recordFailedNote(
          once,
          id,
          T0,
        );
        expect(twice).toBe(once);
        expect(twice.version).toBe(once.version);
        expect(eventDrafts).toHaveLength(0);
      }),
    );
  });

  it("complete then expire preserves artifact identity and bumps version twice", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100, unit: "grapheme-ascii" })
          .map((s) => s.replace(/\s/g, "x"))
          .filter((s) => s.trim().length >= 1),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (rawKey, size, ttlSec) => {
          const pending = singleJob();
          const { entity: processing } = ExportJob.startProcessing(
            pending,
            1,
            T0,
          );
          const { entity: completed } = ExportJob.complete(
            processing,
            rawKey,
            size,
            T0,
            ttlSec,
          );
          const { entity: expired } = ExportJob.expire(completed, T0);
          expect(expired.artifactKey).toBe(completed.artifactKey);
          expect(expired.artifactSize).toBe(completed.artifactSize);
          expect(expired.version).toBe(processing.version + 2);
        },
      ),
    );
  });
});
