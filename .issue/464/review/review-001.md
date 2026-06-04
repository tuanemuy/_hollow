# PR Review #001 — feat(publication): 公開設定画面（P14）のスタイリングと _app レイアウト適用

**PR:** #472
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 14
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため修正対象）

---

## Frontend / Styling

### Blockers
なし

### Warnings
- **[W-001]** `LINK_ROW` の JSDoc が実装と乖離
  - 場所: `app/components/publication/styles.ts:54-56`
  - 理由: JSDoc は「The URL inside truncates with ellipsis (`[&_code]:truncate`)」と書くが、`LINK_ROW` 本体に `[&_code]:truncate` は存在しない。実際の省略は `LINK_URL`（`truncate`）＋ `index.tsx` の内側 `<div min-w-0>` で成立。存在しないセレクタを根拠に説明しているため誤解を招く。
  - 提案: JSDoc を「URL truncation は `LINK_URL`（`truncate`）が担う」に修正。
- **[W-002]** `LINK_URL`（`text-accent-ink`）と `URL_PREVIEW_URL`（`text-ink`）で同種の発行 URL の色が割れている
  - 場所: `app/components/publication/styles.ts:60`, `:71`
  - 理由: 「accent 色＝操作可能」の視覚言語と衝突する懸念。意図が不明だと将来読者が迷う。
  - 提案: 方針を統一するか、意図的なら理由を JSDoc に残す。
  - **調査結果（対応方針）**: デザインモック `P14-publish-settings.html` は `.link-text { color: var(--color-accent-ink) }`、`.url-preview .url { color: var(--color-ink) }` と**意図的に色を使い分けている**。実装はモック準拠で正しい。色を変えるのではなく、両定数の JSDoc に「モックの使い分けに従う意図的な差異」である旨を明記して解決する。

### Notes
- state-style 規約を全面遵守（conditional class 文字列なし、value-match variant、`data-*=""` 静的オンと `pillBtn*` variant の併記漏れなし）
- radio 選択強調は `has-[input:checked]:` + `[&_input]:sr-only` + `focus-within:` で a11y 維持。ADR-004 通り
- トークンは全て `tokens.css` に実在、新規 CSS/@apply なし、`unlisted`→`status-link` 語彙整合
- a11y 良好（fieldset/legend、`<h1>`→`<h2>` 階層、status-dot は aria-hidden、role=alert）
- SSOT 設計は ADR-001 通り、共通定数流用で重複なし
- ロジック非変更（むしろ aria-busy 追加で改善）

---

## Architecture / Routing

### Blockers
なし

### Warnings
なし

### Notes
- ルート移動と `routeTree.gen.ts` 完全整合（手動編集痕跡なし、`fullPath: '/notes/$noteId/publish'` 保持で導線維持）。ADR-002 通り
- action 副作用 import 削除は安全（`_app/route.tsx:31` がカバー、build 成功）
- 二重 `<main>` 回避は慣習整合（AppShellDrawer が単一 `<main>` 所有、NoteDetail と同様）。ADR-003 通り
- `internalRouteHead` は `_app` 配下で機能（config は `__root.tsx` の beforeLoad 由来）
- errorComponent/notFoundComponent は `_app` トーン整合・ロジック非変更
- requireCurrentUser 二重ガードは React cache 共有で無害
- スタイル定数配置はドメイン別 styles.ts 慣習に整合。ADR-001 通り
- （観察）`PUBLISH_BODY` に `mx-auto` がなく NoteDetail と異なり左寄せ。デザイン判断の範囲でブロッカー/警告ではない

---

## Design Decisions

特になし（W-002 の色使い分けはモック準拠を JSDoc で明記して解決。新規 ADR は不要）。
