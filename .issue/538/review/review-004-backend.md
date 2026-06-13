# Review 004 — Backend（Domain / Use Case / Adapter）

**対象 PR:** 677（Issue #538）
**範囲:** ポート `countByOwner` / `IngestionJobCountOpts`・d1 adapter・usecase `countActiveIngestionJobs`・server-fn `getIngestionQueueCountFn`
**種別:** Round 4 フルレビュー（ゼロベース）

## 受け入れ基準の充足（担当レイヤー）

- **AC-5（バッジ件数の取得経路）**: 満たす。
  - ポート: `IngestionJobRepository.countByOwner(ownerId, { statuses })` を read-only として追加。JSDoc に write-intent なし・空 statuses は DB 非到達で 0・`findByOwner` の opts 語彙（`status` 単数包含 / `excludeStatuses` 複数除外）と異なる理由（count は IN フィルタ 1 クエリが用途）を明記。ADR-003 / plan ステップ 1 と整合。
  - 型: `IngestionJobCountOpts = Readonly<{ statuses: readonly IngestionStatus[] }>` を新設。
  - adapter: `count(*)` + `inArray(status, [...statuses])` + `eq(ownerId)` の 1 クエリ。空 statuses は `Promise.resolve(0)` で短絡（DB 非到達）。`mapDbError` 経由でドライバエラーを翻訳。owner スコープも WHERE に含まれ越境カウント不可。
  - usecase: `countActiveIngestionJobs` が `["pending","processing","previewing"]` を usecase 内定数に閉じ込め（`failed` 除外理由を JSDoc に記録、ADR-003 と一致）、`unitOfWorkProvider.run` 経由でアクセス。actor は `UserId.create` で VO 構築。presentation に status 集合が漏れていない。
  - server-fn: `getIngestionQueueCountFn`（GET・入力なし・`requireCurrentUser` → usecase → `{ count }`）。`getEffectiveIngestionPromptsFn` の input-less GET パターンを正確に踏襲。

## ヘキサゴナル＋DDD 規約の確認

- 依存方向（presentation → application → domain）順守。ポートは domain で定義し adapter が実装。
- 入力検証 2 点（transport 境界 / VO 構築）順守。GET 入力なしのため `inputValidator` 省略は sibling と同一の正当な判断。actor は usecase で `UserId.create`。
- adapter → application のエラー翻訳は `mapDbError` で一貫。usecase 側に broad try/catch なし。
- テスト: adapter 統合（status IN / owner スコープ / 空 statuses 短絡 / 該当なし 0）、usecase 統合（active のみ / 他人を数えない / 0 件）とも実 D1（確立パターン）で網羅。ADR-005 の「フェイクを追加せず integration」判断と整合。

## Backend → Blockers / Warnings / Notes

### Blockers

なし

### Warnings

なし

### Notes

- N-001 / `app/core/adapters/d1/repositories/ingestionJobRepository.ts:426` — `count()` は集約クエリのため必ず 1 行返り `rows[0]?.total ?? 0` の `?? 0` は実質到達しない防御。`sumByteSizeByOwnerSince` の冗長なガードと文化が揃っており問題なし。指摘ではなく確認事項。
- N-002 / テストの seed `version: 0` は `findById` を経由しないため OCC トークンに無関係で妥当。`countByOwner` は version を読まないので影響なし。
