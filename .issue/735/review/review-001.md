# PR Review #001 — fix(public): #735 公開系ルートで存在しない/非公開リソースに HTTP 404 を返す

**PR:** #768
**Date:** 2026-06-21
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 17
- Verdict: **BLOCKED**（Warning 修正のため次ラウンドへ。直すべき指摘: 2件）

## レイヤー別ファイル

- Presentation: review-001-presentation.md（B: 0 / W: 2）
- Security: review-001-security.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧と仕分け

- [Test W-001] `check()` が呼ばれることを未検証 — `__tests__/publicStatusBridge.test.ts:7-11`（**このPRで直す**）
- [Presentation W-001] 404+gone画面の意図的乖離が誤読されうる — `$noteId.tsx:113` / `$noteSlug.tsx:121`（**このPRで直す** — 明示コメント追加）
- [Presentation W-002] meta の NotFound 握り潰しが `$username` だけインライン非対称 — `u/$username/index.tsx:97-125`（**見送り**: 既存コード・本PRスコープ外）
- [Security W-001] TOCTOU 競合時のみ 404→200 — `$noteId.tsx:35-44` ほか（**見送り**: ADR-003/ADR-004/AC-5 で許容済みの既知リスク、攻撃者がタイミングを起こせず実害なし）
- [Test W-002] NotFoundError サブクラスの代表検証なし — `__tests__/publicStatusBridge.test.ts:13-25`（**見送り**: サブクラス不在で実害小）
