# PR Review #001 — feat(editor): #762 HTML 編集タブで本文を整形表示し保存時に minify する

**PR:** #767
**Date:** 2026-06-21
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 9
- Notes: 23
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend統合: review-001-frontend.md（B: 1 / W: 3）
- HTML整形ユーティリティ: review-001-htmlformat.md（B: 0 / W: 1）
- テスト: review-001-test.md（B: 0 / W: 5）

## 指摘一覧（仕分け）

- [B-001] 無編集HTMLタブ開閉でcontentHtml書換→autosave誤発火（markdown由来の`\n`入りcontentHtmlで往復不変が破れる） — `htmlFormat.ts` / `editorState.ts`（Frontend）→ **修正: pristine判定（htmlDraft === formatHtml(contentHtml)）に変更**
- [W-003-test] pre/code を兄弟に持つコンテナで整形が抑止されAC-1劣化 — `htmlFormat.ts`（Test/Frontend）→ **修正: `<pre>`をブロック扱い**
- [W-001-fe/W-002-fe] roundtripテストがrenderSync実出力を使わず属性順保証なし → **修正: renderSync由来フィクスチャ・整形固定テスト追加**
- [W-001-test] AC-4 inline code 未テスト → **修正: 追加**
- [W-004-test] AC-8 が実parse失敗のcatch経路を踏んでいない → **修正: throwする入力でテスト追加**
- [W-005-test] noteEditorModeChange が被検対象minifyHtmlに依存 → **修正: 独立アンカー追加**
- [W-001-htmlformat] トップレベルblock兄弟間の空白除去（規則どおり、pristine判定で実害解消）→ B-001修正でカバー
- [W-003-fe] BLOCK_TAGS の span 扱いがJSDocと暗黙不一致（軽微）→ pre のブロック扱い修正で整理
- Notes（reducer純粋性・配線・AC-9 diffゼロ等）はいずれも設計どおり良好

## 反映

全 Blocker・Warning を修正。ADR-004（pristine判定）/ ADR-005（preのブロック扱い）を adr.md に追記。editor テスト 357→364 件、全パス。
