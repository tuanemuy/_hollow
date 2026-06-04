import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import {
  type BackfillInternalLinksResultDTO,
  type RebuildSearchIndexResultDTO,
  type ReencryptApiKeyResultDTO,
  toBackfillInternalLinksResultDTO,
  toRebuildSearchIndexResultDTO,
  toReencryptApiKeyResultDTO,
} from "@/core/application/dto/adminSettings";
import {
  type ExportJobDTO,
  toExportJobDTO,
} from "@/core/application/dto/export";
import {
  type IngestionJobDTO,
  toIngestionJobDTO,
} from "@/core/application/dto/ingestion";
import { csrfMiddleware } from "@/core/presentation/csrfMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { targetExportJobSchema, targetIngestionJobSchema } from "../schema";

const JOB_LIST_LIMIT = 100;

/**
 * Read-only admin-side projection of recent ingestion / export jobs.
 *
 * Mirrors the `loadAdminUsers` pattern in `UsersTable/action.ts`: the
 * admin guard runs in the page server component before this loader
 * fires, so authorisation re-checks here are unnecessary. The loader
 * pulls both repositories inside one UoW so the two listings come from
 * a consistent snapshot.
 *
 * Returns DTOs (not entities) so the result is safe to embed in the RSC
 * payload — no domain branded ids cross the boundary.
 */
export const loadJobsSnapshot = cache(
  serverData(
    async () => ({}),
    async ({
      container,
    }): Promise<{
      ingestionJobs: readonly IngestionJobDTO[];
      exportJobs: readonly ExportJobDTO[];
    }> => {
      const { ingestionJobs, exportJobs } =
        await container.unitOfWorkProvider.run(
          async ({ ingestionJobRepository, exportJobRepository }) => {
            const [ingestion, exportJobsList] = await Promise.all([
              ingestionJobRepository.findRecent({ limit: JOB_LIST_LIMIT }),
              exportJobRepository.findRecent({ limit: JOB_LIST_LIMIT }),
            ]);
            return { ingestionJobs: ingestion, exportJobs: exportJobsList };
          },
        );

      return {
        ingestionJobs: ingestionJobs.map(toIngestionJobDTO),
        exportJobs: exportJobs.map(toExportJobDTO),
      };
    },
  ),
);

export const retryIngestionJobFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetIngestionJobSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/retryIngestionJob"),
    );
    await module.retryIngestionJob({
      container,
      input: {
        actorUserId: actor.id,
        jobId: data.jobId,
      },
    });
    return {};
  });

export const retryExportJobFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetExportJobSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/retryExportJob"),
    );
    await module.retryExportJob({
      container,
      input: {
        actorUserId: actor.id,
        jobId: data.jobId,
      },
    });
    return {};
  });

export const rebuildSearchIndexFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .handler(async (): Promise<RebuildSearchIndexResultDTO> => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/rebuildSearchIndex"),
    );
    const result = await module.rebuildSearchIndex({
      container,
      input: { actorUserId: actor.id },
    });
    return toRebuildSearchIndexResultDTO(result);
  });

export const backfillInternalLinksFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .handler(async (): Promise<BackfillInternalLinksResultDTO> => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () =>
        import(
          "@/core/application/note/backfillAllOwnersInternalLinkResolution"
        ),
    );
    const result = await module.backfillAllOwnersInternalLinkResolution({
      container,
      input: { actorUserId: actor.id },
    });
    return toBackfillInternalLinksResultDTO(result);
  });

export const reencryptApiKeyFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .handler(async (): Promise<ReencryptApiKeyResultDTO> => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/reencryptApiKey"),
    );
    const result = await module.reencryptApiKey({
      container,
      input: { actorUserId: actor.id },
    });
    return toReencryptApiKeyResultDTO(result);
  });
