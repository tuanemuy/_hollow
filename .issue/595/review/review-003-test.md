# レビュー #595 PR #746 — Test 観点（Round 3 / 最終収束確認・ゼロベース再レビュー）

レビュー対象: PR #746（feat(admin): #595 P40 ダッシュボード 24h チャート + 最近のアクティビティ backend 新設）
レビュアー観点: Test
基準: `.issue/595/plan.md`（テスト方針 / 受け入れ基準 / C-1 / AC-9）、`docs/test.md`
前ラウンド: `.issue/595/review/review-002-test.md`（Blocker 0 / Warning 0 / Note N-001〜N-003）

## 総評

Round 2 で残った Note のうち、修正対象とされた **N-001（projection フォールバック）** と **N-002（adminSettings eventDecoders）** が両方とも適切に追加され、解消を確認した。`resetDesignTokens` no-op 非 emit テストも追加済み。計画は Test 観点で収束した。Blocker・Warning はなし。

### N-001（projection ハンドラ 3 本の AC-5 フォールバック）解消

`app/core/application/activityLog/__tests__/projection.test.ts` に、これまで `dispatchDomainEvent.test.ts` で `vi.mock` され中身が実行されていなかった 3 ハンドラの直接テストが追加された。

- `handleIngestionFailedEvent`: 解決成功時 `target = originalFileName`・`detail = errorReason`、解決失敗時 `target = raw jobId`・`detail = errorCode`（`errorReason: ""` で `||` が errorCode を選び空文字にならない退行ガード）、`actorId` の `ownerId`/`null` 切替まで検証。
- `handleUserCreatedEvent`: 解決成功時 `target = username`、失敗時 `target = raw userId`。
- `handleExportJobCompletedEvent`: 解決成功時 `target = "${format} エクスポート"`・`detail = "エクスポート完了"`、失敗時 `target = raw exportJobId`・`actorId = null`。

ハンドラ実装（`handle{IngestionFailed,UserCreated,ExportJobCompleted}Event.ts`）を実際に読み合わせ、各テストの assert がハンドラの `||` / `??` 選択・ラベル文言と一字一句一致しており、虚構ではなく実分岐を pin していることを確認した。AC-5「空文字や ID 直書きで形式的に満たすことを避ける」の主旨そのものを CI で捕捉できるようになった。5 ハンドラ中 2 本（settings / ingestionCreated）にあった直接テストとの非対称が解消されている。

### N-002（adminSettings eventDecoders の strict / enum / UserId round-trip）解消

`app/core/application/adminSettings/__tests__/eventDecoders.test.ts`（新規）が `adminSettingsEventDecoders` を直接叩き、(1) 正常 payload の往復で `UserId.create` ブランドが復元されること、(2) settingKind 6 値すべての enum 往復、(3) 未知 settingKind 拒否、(4) `.strict()` による余剰キー拒否、(5) 必須欠落拒否、を網羅。デコーダ実装（`eventDecoders.ts`）が `z.enum([...6 値]).satisfies z.ZodType<InstanceSettingKind>` + `.strict()` + `UserId.create(p.actorId)` であることと整合し、`docs/test.md` の「events のデコード不変条件」狙いに沿う。他ドメイン decoder と粒度が揃った。

### resetDesignTokens no-op 非 emit テスト追加を確認

`adminSettingsEvents.integration.test.ts` の「no-op guards do not emit」describe に `resetDesignTokens with no existing override does not emit`（既存 override 不在で reset → outbox 0 件、`resetAllPromptTemplates` と対称）が追加されている。emitting 側 6 settingKind 網羅・他の no-op ガード（`updateDesignTokens` 空/同一再保存、`resetPromptTemplate`/`resetAllPromptTemplates` 不在、`updatePromptTemplate` 同一再保存）も維持されており、「一部 usecase だけ emit して他が漏れる」退行を構造的に防ぐ網羅性が保たれている。

### テスト全体の質・独立性・実行確認

- 層分け（domain/app は fake、adapter は実 D1）・閾値定数ベース・cleanup への新規テーブル追加は Round 2 同様に維持。
- 新規 fake（`FakeActivityLogRepository`）を介した projection テストは UoW lookup を最小スタブで隔離しており、独立性・決定性ともに良好（`FIXED_NOW` 固定 clock・`FakeIdGenerator`）。
- ローカル実行確認: 対象 2 ファイル（projection / eventDecoders）= 15 件 pass、entity / view = 64 件 pass、unit 全体 4057 件 pass。新規・変更テストによる退行なし。

残る指摘は Round 2 から持ち越しの任意 Note 1 件（N-003）のみ。Blocker・Warning はなし。

## Blockers / Warnings / Notes

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] `createConsumerContainer` が `activityLogRepository` を wire することの DI 統合検証が依然として無い（Round 2 N-003 の持ち越し・任意）**
  場所: `app/core/application/di/__tests__/`（`activityLogRepository` を参照するテスト 0 件 = grep 確認済み）
  理由: ADR-006 で `activityLogRepository` を `ConsumerContainer` の `Pick<WorkerContainer, ...>` に載せた配線は、どの DI テストでも assert されていない。`dispatchDomainEvent.test.ts` は手書きスタブコンテナを使うため、production の `createConsumerContainer` が当該 repo を欠落させても気付けず、実行時に consumer が落ちて初めて判明する。ただし他の WorkerContainer 系 repo（`indexJobRepository` 等）も同テストで個別 assert していない既存方針に倣っており、本 PR 固有の退行ではない。Round 2 から状況変化なし。
  提案: 任意（前ラウンドと同じ）。`createConsumerContainer` 結果に `activityLogRepository` が存在し `insertIfAbsent`/`recordBurst` を持つことの軽い smoke assert を 1 行足すと、配線漏れが request 路の手前で捕まる。収束を妨げる指摘ではない。
