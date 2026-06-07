# PR Review #001 — 領域5（P32/P33）のモック実装追従

**PR:** #561
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 4
- Notes: 多数
- Verdict: **BLOCKED**（修正済み）

3観点（Frontend/UX/a11y・スタイリング規約・テスト）で並列レビュー。

---

## テスト品質・カバレッジ

### Blockers
- **[B-001]** ロックアウト「案D」検証が偽陽性 — `ShareLinkGate.test.tsx`
  - `expect(html).toContain("bg-bg")` は GATE_CARD が常時 `bg-bg` を持つため、案D を検証していない。
    `not.toContain('bg-warning-surface" role="status"')` も DOM 連結順依存で脆い。
  - → **修正**: 共通 ALERT クラス文字列（`rounded-lg bg-bg shadow-xs text-left border border-[color-mix(...)]`）と
    `[--alert-accent:var(--color-warning)]` を positive assert。旧 LOCKOUT（`bg-warning-surface ... rounded-md`）は
    これらを持たないため、退行すれば必ず fail する。`bg-warning-surface` 単独の否定は GATE_ICON の鍵丸背景が同色を
    使うため不採用。

### Warnings
- **[W-001-test]** 通常ゲート（STATE1, error=null）のケース欠落 → **修正**: `render(null)` のケースを追加
  （パスワードゲート描画 / CTA・アラート非存在を assert）。
- **[W-002-test]** 空状態「削除」検証が未検索のみ → **修正**: no-hit（keyword あり・hits 0）でも旧文言が
  復活しないケースを `PublicSearch.test.tsx` に追加。

## Frontend / UX / アクセシビリティ

### Warnings
- **[W-001-fe]** `aria-describedby` の dangling reference — `ShareLinkGate/index.tsx:169`
  - ロックアウト時 `message !== null` だが `<p id={errorId}>` は `!isLocked` 条件で描画されず、参照が空振り。
  - → **修正**: `aria-describedby={message !== null && !isLocked ? errorId : undefined}`、
    `aria-invalid={state.error !== null && !isLocked}` に揃えた（ロックアウトは入力検証エラーではない）。
- **[W-002-fe]** ロックアウトアイコンがモックと不一致（時計 → 警告三角）
  - モック `P33-share-link.html:414` は時計アイコン。実装は `AlertTriangle`。
  - → **修正**: `lucide-react` の `Clock` に変更（`role="status"` の時間案内の含意と整合）。ADR-009 に記録。

## スタイリング規約・デザイントークン準拠

### Warnings
- **[W-001-style]** 案D の見出し（ALERT_TITLE）欠落 — 他の全 `.alert` 消費者は TITLE+BODY
  - → **不採用（モック準拠を優先）**: モックのロックアウト `.alert`（`P33-share-link.html:412-415`）は意図的に
    `.alert-title` を持たず icon+body のみ。本Issue はモック追従が SSOT のため、見出しは足さない。ADR-009 に
    判断を記録（モック忠実性 > 他消費者との構造一貫性）。

### Notes（主なもの）
- container/presentational 分割（ADR-008）は既存 RSC テスト手法と同型で妥当。
- `<Link ... data-primary="">` は auth 系と同一パターン、`/` は未認証可ルートで遷移先として堅牢。
- `SEARCH_HIT_SNIPPET` の clamp:2 は `NOTE_SNIPPET`(clamp:1) と同型の確立イディオム。px/色リテラル混入なし。
- `mb-4.5` は既存ユーティリティ（styles.ts 内で既出）。新規リテラルではない。
- LOCKOUT 定数削除は安全（残存参照なし）。
- ロックアウト本文に「あと N 分」を出さないのは honest fallback（serialized error に retry-after が無い）。

---

## Design Decisions

- **ADR-009 追加**: ロックアウト案D は「見出しなし（icon+body）」かつ時計アイコンでモックに忠実に追従する。
  スタイリング視点の「他消費者と TITLE+BODY で揃える」指摘とフロント視点の「モックは title 無し」が相反したため、
  モック（SSOT）を正として決着。

---

## 修正サマリー（全 Blocker + 全 Warning を対応、W-001-style のみ ADR 記録で不採用）

| ID | 種別 | 対応 |
|----|------|------|
| B-001 | テスト | 案D 検証を ALERT 共通クラス + warning accent の positive assert に修正 |
| W-001-test | テスト | STATE1 通常ゲートケース追加 |
| W-002-test | テスト | no-hit 空状態の旧文言非復活ケース追加 |
| W-001-fe | a11y | aria-describedby/aria-invalid を `!isLocked` で整合 |
| W-002-fe | UX | ロックアウトアイコンを Clock に（モック準拠） |
| W-001-style | スタイル | モック準拠で ALERT_TITLE 不採用、ADR-009 記録 |

検証: `pnpm typecheck` clean / `pnpm vitest run app/components/public` 22/22 pass / 変更ファイル lint clean。
