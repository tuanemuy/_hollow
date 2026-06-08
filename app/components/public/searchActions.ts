import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { suggestSchema } from "./schema";

// Public-surface combobox suggestion endpoints for the P32 filter drawer.
// The prefix is validated at the transport boundary (shape / length only);
// the enumeration guard (live authors / public-linked tags) lives in the
// usecase + adapter SQL. No auth — the public search surface is anonymous.
// The Zod schema lives in ./schema (not inlined here): a top-level zod schema
// in a createServerFn module pulled into a "use client" graph trips the
// server-fn:ssr bundler ("Plugin driver is already dropped").

export const suggestPublicTagsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(suggestSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/search/suggestPublicTags"),
    );
    const { suggestions } = await module.suggestPublicTags({
      container,
      input: { prefix: data.prefix },
    });
    return { suggestions };
  });

export const suggestPublicUsersFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(suggestSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/search/suggestPublicUsers"),
    );
    const { suggestions } = await module.suggestPublicUsers({
      container,
      input: { prefix: data.prefix },
    });
    return { suggestions };
  });
