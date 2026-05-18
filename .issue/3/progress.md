# 残存課題 — Issue #3

## 後回しとした Warning（review-001）

### A-W-004: retry usecase 戻り値が `Promise<void>`
- 内容: `retryIngestionJob` / `retryExportJob` は更新後の DTO を返さず、UI 側で `router.invalidate()` による refetch に頼る。
- 影響: レイテンシ余地。機能的問題なし。
- 後回し理由: Phase 4 で別 Issue 化する queue consumer 配線（ADR-002）と一緒に検討すべき設計拡張。本 Issue の意図（spec 乖離解消）を超える。
- 対応方針: queue consumer 配線 Issue で「retry 後の状態 DTO 返却」も併せて検討。

### F-W-004 / F-W-005: error 表示の UX（`aria-live` / 確定的失敗時のフィードバック）
- 内容: retry 失敗時のエラー表示が `<p className="admin-field-error">` で aria-live なし。
- 影響: スクリーンリーダー利用者が結果を取り損ねる可能性。
- 後回し理由: 既存 UsersTable など admin 系の全エラー表示が同じ構造。本 Issue で個別に直すと既存パターンと不整合を生む。
- 対応方針: admin UI 全体の a11y 改善として別 Issue 候補。

## 修正中に発見した既存問題（本 PR 範囲外）

### `assertAdmin` の JSDoc-vs-実装乖離
- 場所: `app/core/application/adminSettings/authorization.ts`
- 内容: JSDoc は「deleted / suspended な admin actor を拒否」と書かれているが、実装は `User.isDeleted(actor) || !User.isLive(actor)` のため、`LiveUser = Pending | Active | Suspended` の定義から suspended ユーザーは通過する。
- 影響: A-W-002 で suspended-admin テストを追加できなかった。spec G3 自体は admin role の有無のみを要求しているので機能的にはセーフだが、JSDoc が誤情報。
- 対応方針: 別 Issue として起票（Phase 4）。

### manual-test 中に発覚した既存不具合
- `/admin`（Dashboard） / `/admin/metrics` が `TypeError: Cannot read properties of undefined (reading 'collect')` で 500
- `/admin/llm` が `Stored instance_settings violates invariants` で 500
- 場所: 既存実装。Issue #3 由来ではない。
- 対応方針: Phase 4 で別 Issue 起票。

### `displayError` の i18n 不在（admin retry エラーコード）
- 内容: `BusinessRuleError('INGESTION_NO_TEMP_STORAGE_FOR_RETRY')` 等が UI に出るとき、ドメイン由来の英語 message がそのまま表示されるか、`extractSerializedError` が unknown に落ちる経路で「エラーが発生しました」になるか、状況依存。
- 場所: `app/core/presentation/errorDisplay.ts` の `business` case が `error.message` をそのまま返す既存実装。
- 対応方針: 全 admin UI 横断の i18n / コード別翻訳の改善として別 Issue 候補。本 PR スコープ外。
