# PR Review #001 — feat(issue/217): batch UI fixes

**PR:** #301
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（W-001 = 本Issueのspec同期スコープ内で対応 / W-002 = スコープ外で見送り）
- Notes: 6
- Verdict: **BLOCKED**（W-001を1件修正してから再レビュー）

---

### General Review

#### Blockers
なし

#### Warnings

- **[W-001]** `spec/design/pages/P40〜P46` のモバイル向けメディアクエリで `padding: 12px 16px` が残っており、`max-sm:py-3` 撤去（実装側）と齟齬がある
  - 場所: `spec/design/pages/P40-admin-dashboard.html:561`、`P41-admin-llm.html:287`、`P42-admin-prompts.html:159`、`P43-admin-tokens.html:202`、`P44-admin-registration.html:215`、`P45-admin-users.html:205`、`P46-admin-jobs.html:211`
  - 理由: 実装は `h-[var(--header-height)]` 固定 + `max-sm:px-4` のみ（縦パディングなし）に変えたが、デザインモック側のモバイル MQ は `padding: 12px 16px` を残しているため、本Issueの「spec/design 同期」目標が部分的に未達。
  - 提案: 各 P4x の `@media (max-width: 640px)` の `.header { padding: 12px 16px; gap: 10px; }` を `.header { padding: 0 16px; gap: 10px; }` に揃える。

- **[W-002]** モバイル幅でロゴが非表示になる挙動が実装と spec の間で不一致
  - 場所: `app/routes/admin/route.tsx:28` (`max-sm:hidden`) vs `spec/design/pages/P40-admin-dashboard.html:562` 等の `.logo { display: none; }`
  - 理由: これは本 PR のスコープ外（変更されていない既存差分）。
  - 提案: 本 PR では対応不要。スコープ外として見送り。

#### Notes

- **[N-001]** `ADMIN_HEADER_CLASS` の修正は `app/components/layout/styles.ts` の `APP_HEADER` パターンと意図的に揃えており整合性が取れている。
- **[N-002]** `ACTIVE_NAV_PROPS`（`Sidebar.tsx:17-20`）は CLAUDE.md の `data-x=""` 静的属性 + `aria-current="page"` のセットで NAV_ITEM の `data-[active]:` バリアントとも整合。
- **[N-003]** `<section className="mt-12">` から `<h2>` を抜いた結果、純粋に余白用 wrapper になっている。a11y 上 region に accessible name がなくなるが、IngestionQueue 本体が見出し相当の状態テキストを持つ前提なら受容範囲。
- **[N-004]** `UploadButton` のコメントは「other sidebar links のパターンをミラー」と古い文言だが、Header / NoteListToolbar 経由でも `data-active` パターンを使う点で意味は維持。本 PR では触らず。
- **[N-005]** TC-Edge-1（360px）の実測で `headerHeight = 64` 確認済み。`max-sm:py-3` 撤去後もモバイル破綻なし。
- **[N-006]** Sidebar.tsx の import 整理は適切で、リント・型エラーなし。

---

## Design Decisions

特になし（既存パターン `h-[var(--header-height)]` への寄せ替えのみ）。
