# 実装計画 — Issue #283: UrlCopyButton: コピー成功時にアイコンを Link2 → Check に切り替える

**Issue:** #283
**作成日:** 2026-05-29
**複雑度:** 小規模

---

## 目的

`UrlCopyButton` のコピー成功時に、アイコンを一時的に `<Link2 />` から `<Check />` へ切り替えることで視覚的フィードバックを強化する。既存の `aria-live` ステータステキスト（「URL をコピーしました」）はそのまま維持し、アイコンは装飾扱い（`aria-hidden`）を継続する。

## スコープ

### 含まれるもの
- `app/components/note/detail/UrlCopyButton.tsx` のアイコン切り替えロジック追加

### 含まれないもの
- `aria-live` ステータステキストの文言・挙動変更
- 切り替え表示時間の設計変更（既存の `state` 駆動の 2 秒に同期させる）
- 他のアクションボタンへの波及（親 Issue #231 のスコープ）

## 実装ステップ

### 1. コピー成功時に Check アイコンを表示

- **対象ファイル:** `app/components/note/detail/UrlCopyButton.tsx`
- **変更内容:**
  - `lucide-react` から `Check` を追加 import
  - ボタン内のアイコンを `state.kind === "copied" ? Check : Link2` で出し分ける
- **理由:** Issue の完了条件「コピー成功時に短時間だけ `<Check />` を表示」を満たす。既存の `setTimeout` が 2 秒後に `state` を `idle` に戻すため、アイコンも `state` 駆動にすればステータステキストと完全同期し、追加のタイマー state を持たずに済む。

## 設計判断

- **表示時間は新規タイマーを足さず既存の `state` に同期させる。** Issue 例示の「1.5 秒」より、ステータステキストと同じ 2 秒に揃えるほうが「視覚フィードバックの一貫性」という Issue 意図に沿う。`state.kind === "copied"` を単一の真実源にすることで、タイマー二重管理を避ける。
- `Check` は既存コードベース（`IngestionJobRow`, `TagActions`, `VerifyEmail` 等）で成功表現の定番アイコンとして使われており、規約に整合する。

## リスクと注意点

- `Icon` コンポーネントは `label` 未指定時に `aria-hidden="true"` を付与する。`Link2`/`Check` どちらも `label` を渡していないため、a11y 上の装飾扱いは自動的に維持される（二重読み上げの懸念なし）。
- `error` 状態のときはアイコンを `Link2` のまま据え置く（エラーは既存どおりテキストで通知）。

## テスト方針

- コピー成功 → 一時的に Check 表示 → 2 秒後に Link2 に戻ることをブラウザで確認。
- スクリーンリーダー観点（アイコンが読み上げ対象にならず、ステータステキストのみ読み上げられること）はコード上で `aria-hidden` 維持を確認。

## レビュー履歴

### 1周目
小規模 Issue のため計画段階のレビューループはスキップ（issue-planner 仕様）。実装後 Phase 3 で General Review を実施する。
