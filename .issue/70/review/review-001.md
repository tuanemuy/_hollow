# PR Review #001 — Tailwind v4 utility-first 移行（Issue #70）

**PR:** #71
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 11（うち 1 件は既存環境問題で本 PR 範囲外）
- Notes: 5+
- Verdict: **BLOCKED**（Warning を全件修正後に再レビュー）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-F-001]** `pillBtn`/`PILL_BTN` の3定義が並走、gap 表記揺れ（`gap-[6px]` / `gap-1.5` / `gap-2`）
  - 場所: `app/components/note/styles.ts:13` / `app/components/layout/styles.ts:20` / `app/components/public/styles.ts:23`
  - 提案: gap 表記を `gap-2`（8px の `--space-2` 対応）に統一、または機能差があれば明記

- **[W-F-002]** backdrop-filter フォールバックの表現が2パターン共存
  - 場所: `app/routes/admin/route.tsx:22`（unconditional + `not-supports-` fallback）vs `app/components/layout/styles.ts:4` `app/components/public/styles.ts:4`（`supports-[backdrop-filter]:` progressive）
  - 提案: 全て「常時適用 + `not-supports-[backdrop-filter:blur(1px)]:bg-[var(--color-bg)]` fallback」に統一

- **[W-F-003]** `transition-bg`(120ms) → `transition-colors`(Tailwind 既定 150ms) で duration 微差
  - 場所: `app/components/note/styles.ts:13,29` 等多数
  - 提案: トークン対応 `duration-[var(--duration-fast)] ease-[var(--ease-standard)]` を併用、または ADR に許容明記

- **[W-F-004]** `data-error={... ? "" : undefined}` と `data-active={... || undefined}` のパターン混在
  - 場所: auth 系（前者）/ note/list 系（後者）
  - 提案: ADR-003 を更新し、どちらを優先するか明示（あるいは両方OKとして基準を明記）

- **[W-F-005]** `--text-base` clamp 上書きの a11y 懸念（既知、ADR-001 で記録済み）
  - 提案: ADR-001 を Accepted にし、独自命名退避の判断条件を明文化

### Notes

- N-F-001: `.note-detail-content` 例外境界が明確
- N-F-002: breakpoint リテラル化の WHY コメント良好
- N-F-003: `data-*` 化が UI 横断で一貫
- N-F-004: 完了基準満たす（typecheck/build グリーン、orphan grep 0）
- N-F-005: SSOT 維持

---

## Styling Infrastructure

### Blockers
なし

### Warnings

- **[W-S-001]** `pnpm lint` が OOM（環境問題）
  - 本 PR 範囲外。`pnpm format:check` `pnpm typecheck` `pnpm build` はグリーン。
  - 対応: 本 PR では修正しない。スコープ外として記録。

- **[W-S-002]** `tokens.css` の `--bp-*` と `index.css` の `--breakpoint-*` が手動同期
  - WHY コメントは index.css にあるが、CLAUDE.md の Styling 節に運用ルールを明記すると安全
  - 提案: CLAUDE.md に「`--bp-*` を変えたら `--breakpoint-*` も同期更新」を追記

### Notes

- N-S-001: `@theme inline` 仕様準拠
- N-S-002: `:focus-visible` の cascade layer 順序問題なし
- N-S-003: `.note-detail-content` ルールが元手書きを忠実再現
- N-S-004: `clamp()` 上書きの影響範囲限定的
- N-S-005: 4 つの `styles.ts` が JIT 検出可能な静的リテラル
- N-S-006: 削除 CSS への import 残存ゼロ
- N-S-007: Cloudflare build 成功（CSS 55.6 KB）

---

## Accessibility / UX

### Blockers
なし

### Warnings

- **[W-A-001]** `admin/route.tsx:22` の `not-supports-[backdrop-filter:blur(1px)]:bg-white` フォールバックが機能しない可能性が高い（Safari/Chrome は blur(1px) を supports 扱い）
  - 提案: 「常時 bg-[var(--header-bg)] + `supports-[backdrop-filter]:` で blur 追加」に揃える（layout/public と統一、W-F-002 と統合）

- **[W-A-002]** `Sidebar.tsx` の active 表示が機能していない（`aria-current` も `data-active` も渡していない）
  - 場所: `app/components/layout/Sidebar.tsx`
  - 提案: 各 `<Link>` に `aria-current={isActive ? "page" : undefined}` と `data-active={isActive || undefined}` を渡す

- **[W-A-003]** `data-primary=""` の静的属性が複数箇所に散在（Header, IngestionJobRow 等）
  - 場所: `app/components/layout/Header.tsx:53` 等 6 箇所
  - 提案: 静的 primary 用に `BTN_PRIMARY` 定数を作るか、`data-primary` を使わず utility 直書き

- **[W-A-004]** `FilterBar.tsx` の `aria-pressed` と `data-active` の重複付与（CSS 都合の冗長）
  - 場所: `app/components/note/list/FilterBar.tsx:138-150`
  - 提案: 親側 `data-[active]:[&_span]:text-white/85` に集約

### Notes

- N-A-001: `:focus-visible` グローバル + utility 打ち消し可能性 OK
- N-A-002: 強度メーター完全に utility 化済み
- N-A-003: WysiwygEditor toolbar の `role`/`aria-pressed`/`aria-label` 保持
- N-A-004: `prefers-reduced-motion` 対応は元から無し（別 Issue 検討）
- N-A-005: レスポンシブ utility 動作確認

---

## Design Decisions

- **W-F-002 / W-A-001 統合**: backdrop-filter フォールバックを「常時 bg + supports-[backdrop-filter]: で blur」に統一する。`not-supports-` バリアントは Safari/Chrome の `blur(1px)` 判定が信頼できないため。
- **W-F-004**: `dataAttr` ヘルパ導入は ADR-002（最小抽象）に反するため見送り。代わりに ADR-003 を更新し「`|| undefined` を優先、空文字版は確定 boolean のみ」と明記する。
