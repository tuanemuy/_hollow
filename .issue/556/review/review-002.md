# PR Review #002 — feat(#556): wikilink/hashtag 表示レンダリングの横展開とタグ導線

**PR:** #598
**Date:** 2026-06-08
**Round:** 2回目（前ラウンド Warning 修正の検証）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: -
- Verdict: **APPROVED**

---

## 検証結果

### arch-W-001 — 解消 YES
- `app/core/domain/note/ports/noteBodyRenderer.ts` に `export type NoteBodySurface = "auth" | "public"` を定義、`renderForDisplay` の options 型がそれを使用。
- `app/core/adapters/renderer/noteBodyRenderer.ts` は `type Surface` を削除し port から `NoteBodySurface` を `import type`。全 7 箇所を置換、旧 `Surface` 残存ゼロ。挙動不変・レイヤー方向（adapter → domain）正しい・typecheck クリーン。

### test-W-001 — 解消 YES
- `getNoteRevision.integration.test.ts` に `resolves revision-body wikilinks via the current note refs and degrades unmatched ones` を追加。
- 解決リンク化（過去版本文 `[[target]]` が現行 refs で `<a class="wikilink" href="/notes/$target">`）と未解決 degrade（現行本文から落とした `[[古い参照]]` が `<span class="wikilink" data-unresolved>` に倒れ、誤リンクを出さない）の双方を検証。
- 2 回 save して現行 refs と過去版本文を本物の divergence でずらす方式により、実装の実挙動（save 時の refs 再構築）に忠実。refs 供給に退行すると解決アサーションが FAIL する＝検出力あり（前ラウンドの「空でも緑」懸念は解消）。

### 新規 Blockers / Warnings
- なし。変更は型名 SSOT 化（挙動不変）とテスト追加のみでスコープ逸脱なし。adapter 単体 24件・関連統合 29件すべて PASS、typecheck クリーン。

---

## Design Decisions

特になし。

## 完了

1ラウンドクリーン（Round 2 で Blocker 0・Warning 0）に到達。レビュー完了 → PR を Ready for review に切替。
