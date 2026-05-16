import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import {
  ContentHtml,
  FrontMatter,
  NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { IngestionJob } from "../entity";
import { IngestionErrorCode } from "../errorCode";
import { IngestionPreview, type SourceFileKind } from "../valueObject";

const T0 = new Date(0);
const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = () => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};
const ownerId = "00000000-0000-7000-8000-0000000000ff" as unknown as UserId;
const note = (n: number) =>
  NoteId.create(`${ID_BASE}${(n + 100000).toString(16).padStart(12, "0")}`);

const samplePreview = (suffix: string): IngestionPreview =>
  IngestionPreview.create({
    title: NoteTitle.create(`t-${suffix}`),
    contentHtml: ContentHtml.create(`<p>${suffix}</p>`),
    suggestedDirectoryId: null,
    suggestedDirectoryName: null,
    frontMatter: FrontMatter.empty(),
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  });

const kindArb = fc.constantFrom<SourceFileKind>(
  "html",
  "markdown",
  "office",
  "pdfTextual",
  "pdfScanned",
  "image",
  "audio",
  "plain",
);

const fileNameArb = fc.stringMatching(/^[a-z]{1,32}\.[a-z]{1,5}$/);
const mimeArb = fc.constantFrom(
  "text/html",
  "text/markdown",
  "image/png",
  "audio/mpeg",
);

describe("IngestionJob.create (property)", () => {
  it("always yields a pending job at version 0 with exactly one ingestion.created draft", () => {
    fc.assert(
      fc.property(kindArb, fileNameArb, mimeArb, (kind, fileName, mime) => {
        const { entity, eventDrafts } = IngestionJob.create(
          {
            id: nextRawId(),
            ownerId,
            originalFileName: fileName,
            mimeType: mime,
            byteSize: 128,
            kind,
            tempStorageKey: null,
          },
          T0,
        );
        expect(entity.status).toBe("pending");
        expect(entity.version as number).toBe(0);
        expect(entity.regenerationCount as number).toBe(0);
        expect(eventDrafts).toHaveLength(1);
        expect(eventDrafts[0]?.type).toBe("ingestion.created");
      }),
    );
  });
});

describe("IngestionJob state transitions (property)", () => {
  it("each non-idempotent transition emits exactly one audit draft and bumps version", () => {
    fc.assert(
      fc.property(kindArb, (kind) => {
        const { entity: pending } = IngestionJob.create(
          {
            id: nextRawId(),
            ownerId,
            originalFileName: "x.html",
            mimeType: "text/html",
            byteSize: 32,
            kind,
            tempStorageKey: "tmp/x",
          },
          T0,
        );

        const start = IngestionJob.startProcessing(pending, T0);
        expect(start.eventDrafts).toHaveLength(1);
        expect(start.eventDrafts[0]?.type).toBe("ingestion.processingStarted");
        expect(start.entity.version as number).toBe(
          (pending.version as number) + 1,
        );

        const attached = IngestionJob.attachPreview(
          start.entity,
          samplePreview("a"),
          T0,
        );
        expect(attached.eventDrafts).toHaveLength(1);
        expect(attached.eventDrafts[0]?.type).toBe("ingestion.previewAttached");

        const committed = IngestionJob.commit(attached.entity, note(1), T0);
        expect(committed.eventDrafts).toHaveLength(1);
        expect(committed.eventDrafts[0]?.type).toBe("ingestion.committed");
        expect(committed.entity.status).toBe("saved");
        expect(committed.entity.tempStorageKey).toBeNull();
      }),
    );
  });

  it("regenerate cycle increments regenerationCount monotonically until the cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (cap) => {
        const { entity: pending } = IngestionJob.create(
          {
            id: nextRawId(),
            ownerId,
            originalFileName: "x.html",
            mimeType: "text/html",
            byteSize: 8,
            kind: "html",
            tempStorageKey: null,
          },
          T0,
        );
        const { entity: processing } = IngestionJob.startProcessing(
          pending,
          T0,
        );
        let current = IngestionJob.attachPreview(
          processing,
          samplePreview("r0"),
          T0,
        ).entity;
        for (let i = 0; i < cap; i += 1) {
          const next = IngestionJob.regenerate(current, T0, cap);
          expect(next.entity.regenerationCount as number).toBe(i + 1);
          current = IngestionJob.attachPreview(
            next.entity,
            samplePreview(`r${i}`),
            T0,
          ).entity;
        }
        try {
          IngestionJob.regenerate(current, T0, cap);
          expect.fail("should throw on the (cap+1)th regenerate");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(
              IngestionErrorCode.RegenerationLimitExceeded,
            );
          }
        }
      }),
    );
  });

  it("discard from previewing or failed always reaches discarded and emits one draft", () => {
    fc.assert(
      fc.property(fc.boolean(), (failFirst) => {
        const { entity: pending } = IngestionJob.create(
          {
            id: nextRawId(),
            ownerId,
            originalFileName: "x.html",
            mimeType: "text/html",
            byteSize: 8,
            kind: "html",
            tempStorageKey: "tmp/d",
          },
          T0,
        );
        const { entity: processing } = IngestionJob.startProcessing(
          pending,
          T0,
        );
        const { entity: previewing } = IngestionJob.attachPreview(
          processing,
          samplePreview("d"),
          T0,
        );
        const source = failFirst
          ? IngestionJob.markFailed(previewing, "llm_failure", "boom", T0)
              .entity
          : previewing;
        const result = IngestionJob.discard(source, T0);
        expect(result.entity.status).toBe("discarded");
        expect(result.entity.tempStorageKey).toBeNull();
        expect(result.eventDrafts).toHaveLength(1);
        expect(result.eventDrafts[0]?.type).toBe("ingestion.discarded");
      }),
    );
  });
});
