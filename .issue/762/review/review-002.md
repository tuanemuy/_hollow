# PR Review #002 — feat(editor): #762 HTML 編集タブで本文を整形表示し保存時に minify する

**PR:** #767
**Date:** 2026-06-21
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 23
- Verdict: **BLOCKED**（Warning 修正のため再レビューへ）

## レイヤー別ファイル

- Frontend統合: review-002-frontend.md（B: 0 / W: 1）
- HTML整形ユーティリティ: review-002-htmlformat.md（B: 0 / W: 1）
- テスト: review-002-test.md（B: 0 / W: 2）

## 指摘一覧（仕分け）

- [W-001-fe] HTMLタブで編集→pristine値へ戻すと content dirty が残り冗長な autosave が1回走る（本文破壊なし・autosaveSuccessで収束） — `editorState.ts setHtmlDraft` → **見送り**: 修正には毎キーストロークで `formatHtml(contentHtml)` 比較が必要でコスト過大、実害なし。レビューファイルに記録
- [W-002-001-htmlformat] pre × inter-block `\n` 交差の回帰テスト欠落（pristine判定だけが遮蔽する最高リスクパス） → **修正: editorState/htmlFormat に pre+`\n` フィクスチャの回帰テスト追加**
- [W-001-test] figure+img の整形 no-op が AC-1 未検証 → **修正: 現挙動を意図仕様として `toBe` で固定（void子は文脈依存のためブロック昇格させずverbatim、AC-5空白保持優先）。実装不変**
- [W-002-test] 深いネスト（table 5段等）の整形後文字列の直接固定が不足 → **修正: table/blockquote の整形後文字列を直接アサート**

## 反映

W-002系3件をテスト網羅補強で修正（プロダクションコード diff ゼロ、editor テスト 364→371 件、全パス）。frontend W-001 は実害なし・修正コスト過大のため見送り（本ファイルに理由記録）。Blocker 0・修正対象 Warning は全て対応済み。
