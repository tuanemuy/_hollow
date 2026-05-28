# PR #277 — Round 001 Fix Summary

review-001 で指摘された Warning 9件 + 任意改善 1件を以下の通り修正した。Blocker は無し。

## 修正サマリ

### Frontend
- **[W-F-001]** `app/components/ingestion/IngestionQueue.tsx`
  - `inflightRef: boolean` を導入し、`tick()` 冒頭で in-flight ガード（並列起動防止）。
  - fetch を try/finally でラップし、`inflightRef.current = false` を確実にリセット。
  - `schedule(0)` を `visibilitychange` で呼ぶ箇所は維持。
- **[W-F-004]** 同ファイル
  - `fatalRef` トリガーを `unauthorized` / `forbidden` の 2 種に絞り、`notFound` を fatal 対象から外す。ADR-009 として記録。

### Presentation / Error Handling
- **[W-P-001]** `app/core/presentation/__tests__/errorResponse.test.ts` を新規作成。
  - bare business `SerializedError` の identity 復元、bare system の認識、`kind: "garbage"` フォールバック、`message` 不在時のフォールバックを assert。
- **[W-P-002]** `app/core/presentation/errorDisplay.ts` の `renderConflictMessage` に `case "CONSTRAINT_VIOLATION"` を追加。
  - リトライを促さない「データの形式に問題があります。入力を見直してください」を返す。
  - ADR-007 Consequences に「同種の問題への恒久対策として追加した」旨を 1 文追記。
- **[W-P-003]** 同ファイル `renderBusinessMessage`
  - 未マッピング business code の fallback を `error.message` から汎用文言「操作を完了できませんでした。時間をおいて再度お試しください」に変更。
  - `FRONT_MATTER_JSON_INVALID` 等マッピング済み code は影響なし。
  - `renderErrorMessage`「business」case のシグネチャから `error.message` 引数を除去。
  - `errorDisplay.test.ts` の "falls through to the raw business message…" テストを "returns a generic message and never leaks the raw business message for unknown codes" に書き換え、`code: null` ケースも追加。
  - ADR-008 として記録。

### Application / Domain
- **[W-A-001]** `app/core/application/ingestion/uploadFile.ts`
  - 0-byte ガードを `container.clock.now()` / `UserId.create()` / `container.idGenerator.next()` より前に移動。
  - ID 発番器の状態を消費しなくなるため、回帰防止の意味でもクリーン。

### Test / Spec
- **[W-T-001]** `spec/design/index.md`
  - `## 10b. フィードバック・エラー表示原則（#221）` から番号を落として `## フィードバック・エラー表示原則（#221）` に変更。
  - 既存「10. スコープ外」「11. 参照」の番号体系を破壊しない。
  - 参照側（`.issue/221/testing.md`、`.issue/221/manual-test/results/TC-10.md`、`.issue/221/manual-test/report.md`、`.issue/221/plan.md`）の `10b.` 記述を同期。
- **[W-T-002]** `app/core/presentation/__tests__/errorDisplay.test.ts` (c) グループのテスト名を intent ベースに改名:
  - `returns the generic fallback for value-object construction codes (group (c)) so internal codes never leak to the UI`
- **[W-T-003]** `.issue/221/progress.md` を新規作成し、`IngestionQueue.tsx` 専用 polling テストが本 Issue Step 9 スコープ外として意図的に未追加である旨を記録（後続改善で追加検討）。

### 任意改善
- **[N-005]** `invalid_status_for_*` 系の文言を「画面を更新してから操作してください」→「画面を更新してから再度お試しください」に統一（`ingestion.invalid_state` 側と整合）。

## ADR 追加

- **ADR-008** — 未マッピング business code の fallback はユーザー向け汎用文言に倒す（W-P-003）。
- **ADR-009** — polling fatal kind を `unauthorized` / `forbidden` に絞る（W-F-004、ADR-003 の補強）。
- **ADR-007 Consequences 追記** — `renderConflictMessage` の `default` 経路への恒久対策として `CONSTRAINT_VIOLATION` 専用 case を追加した旨を 1 文追記。

## 変更ファイル一覧

### コード
- `app/components/ingestion/IngestionQueue.tsx`（W-F-001, W-F-004）
- `app/core/application/ingestion/uploadFile.ts`（W-A-001）
- `app/core/presentation/errorDisplay.ts`（W-P-002, W-P-003, N-005）

### テスト
- `app/core/presentation/__tests__/errorDisplay.test.ts`（W-P-003, W-T-002）
- `app/core/presentation/__tests__/errorResponse.test.ts`（W-P-001、新規）

### Spec / ドキュメント
- `spec/design/index.md`（W-T-001）
- `.issue/221/adr.md`（ADR-007 追記、ADR-008 / ADR-009 新規）
- `.issue/221/plan.md`（W-T-001 参照同期）
- `.issue/221/testing.md`（W-T-001 参照同期）
- `.issue/221/manual-test/report.md`（W-T-001 参照同期）
- `.issue/221/manual-test/results/TC-10.md`（W-T-001 参照同期）
- `.issue/221/progress.md`（W-T-003、新規）

## 検証結果

- `pnpm typecheck` — 緑（tsgo, 0 エラー）
- `pnpm lint:fix` — 既存 7 warnings / 1 info（いずれも本 PR の変更ファイル外、既存負債）。本 PR の変更で新規警告は発生せず。
- `pnpm format` — 整形差分なし。
- `pnpm test:unit` — 131 files / 2601 tests 全て pass。
- `pnpm test:integration` — 39 files / 440 tests 全て pass。

## 判断・懸念点

- **W-T-001** はリナンバーよりも「見出しから番号を落とす」方式を採用。レビュー文中で「後者の方が将来追加しやすい」と推奨されていた方向に従った。今後 §10b 相当の節を追加する場合も番号体系を壊さずに済む。
- **W-P-003** の修正で `renderErrorMessage` の business case 引数シグネチャが変わったため、既存 business fallback テストの assertion を「raw message を返す」→「汎用文言を返し、raw message を露出しない」に書き換えた。テスト名・assertion ともに ADR-008 の意図に合わせた。
- **N-002**（`role="status"` の暗黙 aria-live）と **N-002**（IngestionJobRow `role="alert"` 二箇所同居）は現状維持。
- **W-F-004** で `notFound` を fatal から外したため、jobs API が一過性 404 を返した場合は failures カウンタで扱われ、3 回連続失敗で UI 通知 → 次の tick で復活する設計に戻った。ADR-009 を Consequences に明記。
