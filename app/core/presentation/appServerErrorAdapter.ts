import { createSerializationAdapter } from "@tanstack/react-router";
import { AppServerError, type SerializedError } from "./errorResponse";

// Structural match, not `instanceof`: @vitejs/plugin-rsc bundles this
// module separately for SSR and RSC, so the `AppServerError` thrown from
// the RSC graph has a different class identity than the one this adapter
// closes over. `instanceof` would fail across that boundary and seroval
// would fall through to `ShallowErrorPlugin`, dropping `serialized`.
function isAppServerErrorShape(value: unknown): value is AppServerError {
  if (!(value instanceof Error)) return false;
  if (value.name !== "AppServerError") return false;
  const candidate = value as Error & { serialized?: unknown };
  return (
    typeof candidate.serialized === "object" && candidate.serialized !== null
  );
}

export const appServerErrorAdapter = createSerializationAdapter<
  AppServerError,
  SerializedError
>({
  key: "AppServerError",
  test: isAppServerErrorShape,
  toSerializable: (value) => value.serialized,
  fromSerializable: (value) => new AppServerError(value),
});
