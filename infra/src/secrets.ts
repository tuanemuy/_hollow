import type { Config } from "./config.ts";
import { workerNames } from "./config.ts";

/**
 * Required secrets per Worker. The CI deploy step decrypts the SOPS-encrypted
 * file under `infra/secrets/{stage}.enc.json` and uses `wrangler secret bulk`
 * to push the listed keys into the corresponding Worker.
 *
 * Keep this list in sync with what the application actually reads — adding a
 * key here without adding it to the encrypted secrets file will cause the
 * deploy to fail loudly, which is the desired behavior.
 */
export type WorkerSecretSpec = {
  worker: string;
  secrets: readonly string[];
};

export const workerSecretSpecs = (cfg: Config): readonly WorkerSecretSpec[] => {
  const names = workerNames(cfg);
  const shared = [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ] as const;
  return [
    { worker: names.web, secrets: shared },
    { worker: names.relay, secrets: shared },
    { worker: names.consumer, secrets: shared },
    { worker: names.pruner, secrets: shared },
    { worker: names.dlq, secrets: shared },
  ];
};
