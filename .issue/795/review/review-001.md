# PR Review #001 — refactor(note): #795 editor メディアアップロードUI刷新

**PR:** #797
**Date:** 2026-06-27
**Round:** 1回目

## Summary

- Blockers: 4
- Warnings: 7（重複指摘を統合すると実質5テーマ）
- Notes: 20
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 1 / W: 2）
- Test: review-001-test.md（B: 3 / W: 5）
- Architecture / Consistency: review-001-arch.md（B: 0 / W: 3）

## 指摘一覧と仕分け

- [B-001 frontend] dropzone label に data-disabled / クリック抑止が無い — `MediaUploader.tsx:228` → **直す**
- [B-001 test] unsupported 時に sizeLabel が undefined であることを未検証 — `validation.test.ts` → **直す**
- [B-002 test] MediaUploader のコンポーネントテストが欠落（検証バナー表示・onInsert 発火） → **直す**
- [B-003 test] putWithProgress の XHR モック戦略が未定義（B-002 の一部） → **直す（B-002 と一体）**
- [W-001 frontend] aria-label が hidden input に置かれている → **見送り**（file input への明示 aria-label="メディアを挿入" は明確な accessible name を与えており a11y 上適切。label のテキストは視覚的説明として両立）
- [W-002 frontend / W-003 arch] formatMegabytes が複数箇所で重複定義 → **直す**（validation.ts で export し media 内で共有。ingestion 等の別ドメインのコピーはスコープ外）
- [W-001 arch] "上限 5 GB" がハードコード → **直す**（BYTE_SIZE_MAX から導出して SSOT 整合）
- [W-002 arch] UploadState.kind_ の awkward な命名 → **直す**（mediaKind へ改名）
- [W-004 test] 空 MIME / 0 bytes のテストケース欠落 → **直す**
- [W-005 test] unsupported vs oversized の優先順位テスト不足 → **直す**

## 修正方針

1つの修正サブエージェントに依存順でまとめて委譲（formatMegabytes export と component test が validation.ts/MediaUploader.tsx で干渉するため並列にしない）。
