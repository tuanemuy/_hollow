import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getContainer } from "@/core/application/di/containerStore";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

/**
 * Transport schema for a section-failure report (Issue #647). The allowed
 * keys are exactly `{ section, scope, path, count }` — redacted error
 * detail (`message` / `stack` / `error`) is intentionally NOT part of the
 * payload because in production those are redacted by React and carrying
 * them would be noise (and an information-leak surface). The length /
 * enum / count caps guard the log sink against pollution and DoS at the
 * transport boundary (CLAUDE.md "Input validation").
 */
export const sectionFailureReportSchema = z
  .object({
    section: z.string().min(1).max(100),
    scope: z.enum(["page", "shell"]),
    path: z.string().max(2048),
    count: z.number().int().positive().max(1000),
  })
  .strict();

export type SectionFailureReport = z.infer<typeof sectionFailureReportSchema>;

/**
 * Receives a client-reported section render failure and forwards the
 * minimal info to the `Logger` port (ADR-001 / ADR-004). This is a
 * presentation-layer transport receiver, not a usecase — same shape as
 * `errorResponseMiddleware.logServerError`, which also calls the logger
 * directly without a usecase.
 *
 * Emitted at `warn` level (a local section failure is less severe than a
 * server-fn system error, which logs at `error`). The meta tag is keyed
 * `event` (not `kind`) to keep it distinct from the `SerializedError`
 * `kind` vocabulary that `errorResponseMiddleware` puts under `meta.kind`
 * (ADR-005).
 */
export const reportSectionFailure = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(sectionFailureReportSchema))
  .handler(async ({ data }) => {
    const { logger } = await getContainer();
    logger.warn("Section render failed", {
      event: "section_failure",
      section: data.section,
      scope: data.scope,
      path: data.path,
      count: data.count,
    });
    return { ok: true } as const;
  });
