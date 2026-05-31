import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import {
  isSecretBoxError,
  type SecretBox,
  SecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import { LLMConfig } from "@/core/domain/adminSettings/valueObject";
import { SystemError, SystemErrorCode } from "../errors";
import type { ServiceArgs } from "../types";
import { assertAdmin } from "./authorization";

export type ReencryptApiKeyInput = Readonly<{
  actorUserId: string;
}>;

/**
 * Why the re-encrypt happened, or `null` when a row was actually
 * re-encrypted:
 *
 * - `not-db`: the stored api key source is `env`, not `db` — nothing is
 *   encrypted at rest, so there is nothing to rotate.
 * - `already-new-key`: the ciphertext already decrypts under the current
 *   master key, so the row is on the new key — idempotent no-op.
 *
 * A `db` source always carries a ciphertext (the domain VO rejects
 * `db` + null at construction, enforced again on rehydration), so
 * "source is db but ciphertext is empty" is not a skip outcome — it is a
 * data-integrity violation surfaced as `SystemError`, never silently
 * tolerated.
 */
export type ReencryptApiKeySkipReason = "not-db" | "already-new-key";

export type ReencryptApiKeyOutput = Readonly<{
  reencrypted: boolean;
  skipped: ReencryptApiKeySkipReason | null;
}>;

/**
 * Re-encrypt the at-rest LLM api key under the current master key as the
 * final step of a `SECRET_BOX_MASTER_KEY` rotation.
 *
 * The only at-rest secret today is the singleton
 * `instance_settings.llm_api_key_ciphertext` when `apiKeySource === 'db'`
 * (a generic encrypted-row registry is YAGNI). The wire format and AES-GCM
 * algorithm are unchanged — only the key differs — so "which key encrypted
 * this row" is decided by tag verification rather than stored metadata.
 *
 * Two structural constraints shape the control flow:
 *
 * 1. Repositories are only reachable inside `unitOfWorkProvider.run`.
 * 2. Web Crypto cannot participate in a D1 transaction (no rollback).
 *
 * So the work splits into three phases rather than the single UoW of
 * `updateLLMConfig` (which receives plaintext from its input):
 *
 *  1. **read-only UoW** — authorize, then read the current settings. Early
 *     return for the `not-db` case.
 *  2. **crypto, outside any UoW** — try the current key first; success
 *     means the row is already migrated (`already-new-key`, idempotent).
 *     A `DecryptFailed` means the row is still on the previous key, so it
 *     is read under `secretBoxPrevious` (throwing
 *     `SecretBoxError(KeyUnavailable)` when no previous key is configured,
 *     rather than silently skipping). The recovered plaintext is then
 *     re-encrypted under the current key.
 *  3. **OCC save UoW** — re-authorize, re-read for the latest version and
 *     persist only
 *     the swapped ciphertext under that token. If an admin changed the
 *     LLM config between phase 1 and phase 3 the save raises
 *     `ConflictError('OPTIMISTIC_LOCK_FAILURE')`, which propagates so the
 *     operator can re-run.
 *
 * Running this in the common case (no previous key configured) is
 * harmless: the current-key decrypt succeeds and the usecase returns
 * `skipped: 'already-new-key'`. Only a genuinely old-key row with no
 * previous key configured surfaces an explicit error.
 */
export async function reencryptApiKey({
  container,
  input,
}: ServiceArgs<ReencryptApiKeyInput>): Promise<ReencryptApiKeyOutput> {
  const secretBox: SecretBox = container.secretBox;
  const secretBoxPrevious = container.secretBoxPrevious;

  const current = await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      await assertAdmin(userRepository, input.actorUserId);
      const { entity } = await instanceSettingsRepository.get();
      return entity;
    },
  );

  if (current.llm.apiKeySource !== "db") {
    return { reencrypted: false, skipped: "not-db" };
  }
  const ciphertext = current.llm.apiKeyCiphertext;
  if (ciphertext === null) {
    // Unreachable in practice: a `db` source with a null ciphertext is
    // rejected by `LLMConfig.create` on rehydration, so `get()` above
    // would already have thrown `DataIntegrityError`. Guard the type and
    // treat the impossible state as corruption rather than a silent skip.
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      "instance_settings has apiKeySource='db' but no ciphertext",
    );
  }

  let plain: string;
  try {
    await secretBox.decrypt(ciphertext);
    // Decrypts under the current key → already on the new key. Idempotent.
    return { reencrypted: false, skipped: "already-new-key" };
  } catch (error) {
    if (
      !isSecretBoxError(error) ||
      error.code !== SecretBoxErrorCode.DecryptFailed
    ) {
      // InvalidCiphertext / KeyUnavailable / non-SecretBox errors are not
      // "encrypted under the previous key" signals — propagate unchanged.
      throw error;
    }
    if (secretBoxPrevious === null) {
      throw new SecretBoxError(
        SecretBoxErrorCode.KeyUnavailable,
        "ciphertext does not decrypt under the current master key and " +
          "SECRET_BOX_MASTER_KEY_PREVIOUS is not configured",
      );
    }
    // The current-key decrypt above already failed with `DecryptFailed` and
    // a previous key is configured, so go straight to the previous key —
    // calling `decryptWithFallback` here would retry the current key a
    // second time.
    plain = await secretBoxPrevious.decrypt(ciphertext);
  }

  const reencrypted = await secretBox.encrypt(plain);

  await container.unitOfWorkProvider.run(
    async ({ userRepository, instanceSettingsRepository }) => {
      // Defense-in-depth: re-confirm authorization inside the write UoW, not
      // just the phase-1 read UoW.
      await assertAdmin(userRepository, input.actorUserId);
      const { entity, expectedVersion } =
        await instanceSettingsRepository.get();
      const now = container.clock.now();
      const next = InstanceSettings.updateLLM(
        entity,
        LLMConfig.create({
          provider: entity.llm.provider,
          model: entity.llm.model,
          baseURL: entity.llm.baseURL,
          apiKeySource: "db",
          apiKeyCiphertext: reencrypted,
        }),
        now,
      );
      await instanceSettingsRepository.save(next, expectedVersion);
    },
  );

  return { reencrypted: true, skipped: null };
}
