# PR Review #002 — refactor(#493): note-content adapter を markdown-it / ultrahtml へ置き換え

**PR:** #523
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 2（うち 1 件は pre-existing・スコープ外）
- Verdict: **APPROVED**

レビューレイヤー: Security / Adapter、Test / アーキテクチャ整合（2 視点並列）。1周目の B-001（XSS）+ W-001/W-002/W-003 はすべて修正済みで、両視点とも残課題ゼロを報告。

---

## Security / Adapter（2周目）

### Blockers
なし。

B-001（属性ブレイクアウト XSS）の修正は完全。実 `UltrahtmlHtmlSanitizer` を import し、HTML 取り込み経路（`runIngestionJob.ts` の `kind === "html"`）を 24 種の攻撃ペイロードで検証（FAILURES: 0）。確認した防御:
- 属性値ブレイクアウト文字は `"` のみ（ultrahtml parser が生 `>` をタグ終端扱い）→ `escapeAttrValue` で過不足なく閉塞。`>` 注入は再パースで実要素化され disallowed tag DROP / `on*` strip で除去。
- 属性名の危険文字は parse 時に分割・空値化 + allowlist 非通過で除去。名前経由注入は不成立。
- テキストは `<`/`>` escape。`"`/`&` は text コンテキストでブレイクアウト不能。
- sanitize は**冪等**（二重エンコードなし）。`&` 非 escape による double-decode 実行経路なし。
- URL 検査は escape 前の生値で実行（`javascript:`/`vbscript:`/`data:text/html`/数値実体 等すべて fail-closed）。
- disallowed タグ（svg/math/template/noscript/iframe/style）・comment はサブツリーごと空出力。
- markdown 経路: `html:false` + `allowedAttributes:["id"]` + `stripUnsafeIds` で id 注入を除去。

### Warnings
なし。

### Notes
- **[N-001]** プロトコル相対 URL `//evil.com/x` が `isSafeUrl` の `startsWith("/")` で通過する。**旧サニタイザと同一ロジックで本 PR の回帰ではない**（`git show main` で確認）。`<a>` 遷移であり XSS ではない（open-redirect 風）。本 Issue スコープ外だが将来の改善余地として記録。→ Phase 4 で起票検討。

---

## Test / アーキテクチャ整合（2周目）

### Blockers
なし。

### Warnings
なし。前回 W-001/W-002/W-003 すべて妥当に解消:
- W-003: event-handler テストが `disallowed attribute: onclick` を pin、`data:` テストが `unsafe URL scheme: src` を pin。属性ブレイクアウト回帰テスト 3 + 二重エンコード非回帰 1 を追加。
- W-001: text/element/root を spread で新オブジェクト化、parse 結果を非変異。
- W-002: `allowInternalLinks` コメントを実態に修正。

### Notes
- **[N-001]** `liveAttrNames` ヘルパーは真陽性のアサーション（エスケープ層を外せば確実に fail、偽陰性なし）。
- **[N-002]** スコープ逸脱なし。typecheck / biome lint（変更ファイル）クリーン、対象テスト全 pass。
- **[N-003]** `pnpm test:unit` 全体で `inlineEditor.test.tsx` が 1 件 flaky fail するが単体再実行で pass、本 PR と無関係（既存のフロントエンドエディタテストの timing 問題）。

---

## Design Decisions

このラウンドでの新規設計判断: 特になし（ADR-009 は review-001 時に記録済み）。

## 完了

Blocker 0 / Warning 0。レビューループ完了（1ラウンドクリーン）。PR を Ready for review に切り替える。
