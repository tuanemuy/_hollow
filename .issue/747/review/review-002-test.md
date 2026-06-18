# PR Review #002 — Test 観点（Round 2 再レビュー）

**PR:** #759
**Issue:** #747（`processed_events` の刈り込み経路を新設）
**Date:** 2026-06-18
**Round:** 2回目（再レビュー）

## サマリー

- Blockers: 0
- Warnings: 0
- Notes: 5

Round 1 の Test 指摘（W-001 / W-002 = swallow 経路と独立性の未テスト、W-003 = DEFAULT 定数参照）はいずれも適切に閉じている。新規 `runPruneTick.test.ts` の4ケースは `handlers.ts` の best-effort 契約（outbox は throw 許容・後段 prune は swallow して0件・各 swallow 独立）を過不足なく pin しており、偽陽性リスクも低い。部分モック（`importOriginal` + spread）戦略は `env.ts` が `DEFAULT_*` 定数を同モジュールから import する制約を正しく踏まえており脆くない。実際に `pnpm vitest run` で4ケース全 pass を確認済み。

---

## Test

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** Round 1 W-001 / W-002（swallow 経路・独立性の未テスト）が新規 `runPruneTick.test.ts` で過不足なく閉じている。
  - 場所: `app/worker/cloudflare/__tests__/runPruneTick.test.ts:89-132`
  - 4ケースが `handlers.ts:103-132` の制御フロー契約を網羅: (1) happy（両件数返却 + activity 実行 + error ログ0件）、(2) processed-events 失敗 swallow（`processedEventsDeleted: 0` + `error` ログ1件 + outbox 件数保持 + 後続 activity 実行 = 独立性検証）、(3) activity-log 失敗 swallow（戻り値の両件数は不変・error ログ1件）、(4) outbox 失敗 propagate（`rejects.toThrow` + 後段2 prune が未呼び出し）。W-001 が要求した「swallow → 0件 → error ログ」と W-002 が要求した「activity prune と processed-events prune の独立性」がそれぞれケース2・3で明示検証されており、指摘に正対している。

- **[N-002]** 偽陽性リスクが低い。成功転送と swallow-to-0 が別値で区別されている。
  - happy では `processedEventsDeleted: 5`（mock `{deleted:5}`）、swallow では `0` を assert。`5` と `0` が distinct なので「mock 戻り値が実際に handler を通って返る」ことと「失敗時に初期値 0 へ落ちる」ことを取り違えずに検証できる。`container.logger.error` の文言を `/processed-events prune failed/` `/activity-log prune failed/` の正規表現で別個に pin しているため、どちらの catch が発火したかも区別できる。`mockReset()` + `mockResolvedValue` を `beforeEach` で再設定し `mockRejectedValueOnce` で1tick分だけ失敗注入する設計で、ケース間のリーク（前ケースの reject が残る等）も無い。

- **[N-003]** 部分モック戦略（`importOriginal` + spread）が脆くなく、制約を正しく踏まえている。
  - 場所: `runPruneTick.test.ts:43-71`
  - `env.ts:7,12` が `DEFAULT_OUTBOX_RETENTION_MS`（`outboxPrune`）/ `DEFAULT_PROCESSED_EVENTS_RETENTION_MS`（`pruneProcessedEvents`）を**当該モジュールから直接 import** しており、これらを丸ごと差し替えると `env.ts` の schema 初期化が壊れる。テストは `...(await importOriginal(...))` で実 export を残し prune 関数のみ差し替えており（コメント L43-45 がこの WHY を明記）、`serverCloudflare` モックも `...actual` を spread して `createWorkerContainer` / `readPruneTuning` だけ上書きする。`createWorkerContainer` が `{ logger }` のみ返すのも、`runPruneTick` がコンテナから `logger.error` しか直接触らない（prune 関数はモック済みで `container` を無視する）事実と整合し、過剰な stub を避けている。`vi.hoisted` でモック関数を巻き上げてから `vi.mock` ファクトリで参照する順序も正しい。

- **[N-004]** Round 1 W-003（unit cutoff のリテラル直書き）が `DEFAULT_PROCESSED_EVENTS_RETENTION_MS` 参照に修正済み。
  - 場所: `pruneProcessedEvents.test.ts:8,91,108`
  - cutoff 計算検証ケースが `const retentionMs = DEFAULT_PROCESSED_EVENTS_RETENTION_MS` を使い、`received?.getTime()` を `now.getTime() - retentionMs` と比較。定数の値（14日）が将来変わってもテストが定数追従するため、リテラル `1209600000` 直書きで生じる「定数だけ変えてテストが古い値を pin し続ける」ドリフトを防いでいる。`serverCloudflare.test.ts:125,148` の default fallback / 独立 default ケースも同定数を参照しており一貫。

- **[N-005]** 3層のテスト配置が plan.md「テスト方針」と AC に過不足なく対応している。
  - unit `pruneProcessedEvents.test.ts`（cutoff 1回計算・件数転送・構造化 info ログ・0件ログ）= AC-1/AC-2/AC-5。
  - adapter integration `idempotencyStore.integration.test.ts:93-132`（`new Date(50_000)` ちょうどの行を strictly-before で保持 = AC-3 境界、0件ケース）。
  - handler integration `handlers.integration.test.ts:256-338`（既存 outbox 2ケースを `outboxDeleted` に更新 = AC-4 非回帰、processed_events 単独刈り込み、両テーブル同一 tick `{outboxDeleted:1, processedEventsDeleted:1}` = AC-4）。
  - unit `runPruneTick.test.ts` が D1 binding 無しで失敗分岐を決定論的に駆動し、実 DB happy path（handler integration）と役割分担しているのも適切（テストピラミッドに整合）。

---

## 確認した事実

- `pnpm vitest run app/worker/cloudflare/__tests__/runPruneTick.test.ts` → 4 passed。
- `env.ts:7,12` が `DEFAULT_*` を当該 worker モジュールから直接 import している（部分モックが必須である根拠）。
- `handlers.ts:109-131` の制御フロー（outbox throw 許容 → processed try/catch → activity try/catch → 両件数返却）が test の assertion と一致。
- happy / swallow で `processedEventsDeleted` が `5` / `0` と distinct で偽陽性なし。
