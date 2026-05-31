# PR Review #001 — feat(ingestion): アップロード時のカスタムプロンプト欄に既定値を可視化

**PR:** #373
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 多数（良好）
- Verdict: **APPROVED（Warning 修正後に再レビュー）**

---

## Application / Use Case

### Blockers
なし

### Warnings
- **[W-A-001]** `text`（resolver 由来）と `isUserOverride`（UoW 経由 override 行由来）が別 read のため非原子的。表示用途では許容範囲だが、意図を JSDoc に明記すると良い。
  - 場所: `app/core/application/ingestion/getEffectiveIngestionPrompts.ts:51-69`
  - 提案: 「`text` と `isUserOverride` は別 read 由来で厳密な原子的整合は保証しない（表示用途のため許容）」を JSDoc に一行追記。

### Notes
- 述語パリティ厳密に正しい（resolver の `entry.text.length > 0` と verbatim 一致）。`rehydratePartialPrompts` が空文字 text を落とさないため `.length > 0` ガードは必須。
- Hexagonal 依存・port/adapter 分離・DTO projection の置き場所すべて正しい。UoW は read-only。UserId VO 二重構築は正当。入力なし GET は `getDirectoryTreeFn` 先例準拠。

## Frontend

### Blockers
なし

### Warnings
- **[W-F-001]** 状態バッジ（既定を使用中 / この回だけ上書き）が textarea とプログラム的に関連付けられておらず、スクリーンリーダーが状態を読み上げない。
  - 場所: `app/components/ingestion/UploadDialog.tsx`（`PromptOverrideField` の `<span data-overriding>`）
  - 提案: `aria-describedby` で textarea にバッジ・出所表示を紐づける。#358「可視化」目的を SR ユーザーにも届ける。
- **[W-F-002]** 「既定の出所」3分岐とプレースホルダ表示が、理論上 `isUserOverride===true && defaultText===""` のとき矛盾しうる（実運用では usecase の述語一致で発生しない）。
  - 場所: `app/components/ingestion/UploadDialog.tsx:763-771`
  - 提案: 不変条件（`isUserOverride ⇒ text 非空`）をコメントで明記、または条件を明示化。

### Notes
- lazy fetch（details onToggle open のみ・1回ガード・失敗サイレント・cancelledRef）は既存 getTree パターン忠実。スタイルは全トークン準拠、`data-[overriding]:` + falsy 消滅は ADR-003 規約どおり。reset effect 漏れなし。`isOverriding = value.trim()` は送信述語と一致。

## Test

### Blockers
なし

### Warnings
- **[W-T-001]** 状態バッジ切替テストが「どこかに上書き1・既定1」しか保証せず、structure/metadata どちらが flip したかを区別しない（false-positive 余地）。
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx`（`toggles the override state badge`）
  - 提案: フィールドごとに `data-overriding` 属性 or 近接 span を取り、structure="この回だけ上書き"・metadata="既定を使用中" を個別 assert。
- **[W-T-002]** source-layer ラベル「プロバイダ組み込み」（最頻・標準状態）が未検証。
  - 場所: `app/components/ingestion/__tests__/UploadDialog.test.tsx`（`shows the provider-fallback copy when the resolved default is empty`）
  - 提案: 空 resolved テストに `toContain("プロバイダ組み込み")` を追加。

### Notes
- isUserOverride 述語の3境界（empty-text row / 別 purpose のみ / row なし）を網羅。モック形状は実シェイプ忠実。lazy-fetch 1回ガード・失敗時継続を具体的に検証。38テスト全パス。

---

## Design Decisions

特になし（ADR-001〜003 は plan/実装段階で記録済み）。
