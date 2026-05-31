# PR Review #001 — feat(security): SECRET_BOX_MASTER_KEY の production fail-fast 化と placeholder ガード

**PR:** #369
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 多数
- Verdict: **BLOCKED**（Warning 全修正のため）

---

## Security

### Blockers
なし

### Warnings
- **[W-001]** placeholder 三重複製のドリフト検知が不完全
  - 場所: `infra/scripts/__tests__/placeholderGuard.test.ts`, `infra/scripts/placeholderGuard.ts:21`
  - 理由: placeholder 値は `secretBox.ts`（`SHIPPED_DEV_PLACEHOLDER_KEY`）/ `placeholderGuard.ts`（`SHIPPED_DEV_PLACEHOLDER_VALUES`）/ `.dev.vars.example` の 3 箇所に複製。app 側は `secretBox.test.ts` が `.dev.vars.example` と定数を突き合わせるが、**infra 側の値が他 2 つとズレても検知されない**。dev placeholder をローテーションして infra 側更新を忘れると、CI ガードが静かに空振りし多層防御が片肺化。
  - 提案: `placeholderGuard.test.ts` に `.dev.vars.example` をルート相対（`import.meta.url` 起点）で読み、`SHIPPED_DEV_PLACEHOLDER_VALUES.SECRET_BOX_MASTER_KEY` と一致を assert するケースを追加。

- **[W-002]** runtime ガードと CI ガードの正規化が非対称
  - 場所: `app/core/adapters/security/secretBox.ts`（`raw.trim() === SHIPPED_DEV_PLACEHOLDER_KEY`）vs `infra/scripts/placeholderGuard.ts:39`（`decoded[key] === placeholder`、trim 無し）
  - 理由: runtime は `trim()` 後に placeholder 判定、CI は厳密 `===`。SOPS secret に前後空白付き placeholder が入ると CI 素通り → runtime で boot 失敗（全ルート 500）になり、二層防御の「CI で先に止める」意図が崩れる。
  - 提案: `assertNoShippedPlaceholders` でも比較前に `String(decoded[key]).trim()` で正規化し判定基準を揃える。

### Notes
- fail-fast 状態網羅は良好、`fromEnv` 削除は妥当、鍵値漏洩なし、暗号仕様に退行なし、`REQUIRE_SECRET_BOX_KEY` を public var とした判断は妥当、CI grep は `^_` 除外・他 secret 誤反応なし。

---

## Adapter / DI

### Blockers
なし

### Warnings
なし

### Notes
- `selectSecretBox` の純粋関数設計・adapter 層配置・port 隠蔽は適切。
- threading は web（`server.cloudflare.ts → readRequestServerConfig → createRequestContainer`）/ consumer（`createConsumerContainer` 内で同経路）両方に届く。worker（relay/pruner/dlq/indexer）は `createWorkerContainer` で secretBox 非配線。
- `exactOptionalPropertyTypes` 整合（`requireSecretBoxKey: ... === "true"` で常に boolean、consumer 側 `?? false` で二重安全）。
- destructure 置換に漏れ・退行なし。prod 経路で直接 new する箇所なし（残るは test harness のみ）。
- 新規テストを別ファイルに分離した判断は責務分担として合理的。

---

## Infra / CI

### Blockers
なし

### Warnings
- **[W-003]**（Security W-001 と同一論点）infra 側 placeholder 複製のドリフト検知が SSOT に紐付いていない
  - 場所: `infra/scripts/placeholderGuard.ts:21`, `infra/scripts/__tests__/placeholderGuard.test.ts`
  - 理由: infra テストはローカル定数と自分自身を突き合わせるだけ（トートロジー）。共通 SSOT（`.dev.vars.example`）に固定されていない。
  - 提案: infra テストに `.dev.vars.example` 読み込み比較を追加（W-001 と同じ修正で解消）。

### Notes
- `REQUIRE_SECRET_BOX_KEY = "true"` は staging/production 両テンプレートの web `[vars]` + `[env.consumer.vars]` 両方に存在、dev `wrangler.toml` には無い。
- `renderWrangler.ts` は `${VAR}` のみ展開、固定文字列は素通り。
- consumer env は var 再宣言済みで named-env 非継承 caveat に対応。
- placeholderGuard は deploy workflow `Validate secrets` で鍵セット比較より前に走り、検出時 exit 1。
- README / runtime_cloudflare.md のコマンドは実在確認済み。
- `placeholderGuard.ts` の `key.startsWith("_")` 分岐は実質デッドコード（対象キーが固定で `_` 始まりになり得ない）。誤動作はしない → 整理対象。

---

## Test

### Blockers
なし

### Warnings
- **[W-004]** 境界カバレッジの穴（空白のみ鍵 / invalid×requireKey:true）
  - 場所: `app/core/adapters/security/__tests__/secretBox.test.ts`
  - 理由: (a) `"   "`（空白のみ）の鍵状態が未カバー。`trim()` ロジックが効いているかを担保するテストが無い（`""` は trim なしでも通る）。placeholder の前後空白ケースも未検証。(b) invalid 鍵（非base64 / 非32byte）が `requireKey:false` 側でしか検証されていない。要件マトリクス「invalid × requireKey(true/false)」を厳密には満たさない。
  - 提案: 「`"   "` + requireKey:true → throw」「`"   "` + requireKey:false → NullSecretBox」「invalid × requireKey:true → eager throw」を追加。

### Notes
- consumer 経路の fail-fast は web 経路テストで実質カバー（コード読解で確認）だが名前付きケースは無い（実害小）。
- placeholder 同期テストの正規表現はダブルクォート前提だが null 時 fail で安全側。パスは `import.meta.url` 起点で cwd 非依存。
- アサーション品質は良好（`instanceof` + `code` まで確認、過剰 mock なし、実 subtle crypto で round-trip）。

---

## Design Decisions

このラウンドで見つかった新規の設計判断は特になし。Warning はすべて既存方針（多層防御 / 境界網羅）の補強であり、ADR 変更は不要。
