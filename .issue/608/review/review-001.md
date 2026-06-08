# PR Review #001 — fix: ヘッダー/フッターのロゴ(BrandLockup)の途切れ解消＋サイズ調整

**PR:** #609
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 4
- Verdict: **BLOCKED**（Warning を解消するため修正後に再レビュー）

---

## General Review

検算結果（レビュアーが再計算し plan と一致を確認）:

- マーク stroke 半幅(外側) = 0.75 × 5.83 = 4.3725
- 左端 stroke込み x' = -4.3675（viewBox 左端 -5 内）
- 上端 stroke込み y' = -0.0275（viewBox 上端 -1 内）
- 下端 stroke込み y' = 84.5075（viewBox 下端 85 内）
- 右端: マーク右円 stroke込み 115.15 / ワードマーク右端 473.84（viewBox 右端 475 内）
- glyph px @height=16 = 16 × 84.48/86 = 15.717px（Issue目安「15〜16px」に整合）
- アスペクト比 新 480/86=5.581 / 旧 473.84/84.48=5.609（ともに ≈5.6、JSDoc 記述と矛盾なし）

座標・サイズ計算はすべて正しい。

### Blockers

- なし

### Warnings

- **[W-001]** コメント中の「wordmark-derived 0 0 473.84 84.48 box」という表現がやや不正確
  - 場所: `app/components/common/BrandLogo.tsx:113-117`
  - 理由: box の左端 x=0 は実際にはワードマーク由来ではなく、マーク左円のアウトライン（X(2.5)≈0）が定義している。ワードマークは x=150.77 から始まる。height(84.48)と右端(473.84)はワードマーク由来だが、原点(0,0)はマーク由来。一括りにすると WHY が曖昧。
  - 提案: box の各辺の出所を区別する。

- **[W-002]** 右マージンが約1.16ユーザー単位と狭い点がコメントに残されていない
  - 場所: `app/components/common/BrandLogo.tsx:121`（viewBox 行）
  - 理由: plan の「リスクと注意点」に「右端マージン≈1.16 と狭い。将来ワードマーク変更時は再確認」とあるが、コードコメントは左・上・下のみ言及。将来ワードマーク差し替え時に気づきにくい。
  - 提案: 右端がワードマーク端ギリギリである旨を一文追加。

### Notes

- **[N-001]** 全使用箇所（計9箇所）がすべて props なしで `<BrandLockup />` を呼び、明示 height なし。デフォルト変更が一律反映。className も色指定のみで height/width 上書きなし。
- **[N-002]** `BrandMark`（viewBox 0 0 24 24）は無変更で回帰なし。
- **[N-003]** 追加 inline コメントは CLAUDE.md のコメント方針に沿い、WHY を簡潔に説明。冗長でない。
- **[N-004]** `pnpm typecheck` 通過。計画・Issue 要件を正しく満たす。

---

## Design Decisions

特になし（座標・サイズの方針は plan / adr 相当の内容を計画段階で確定済み）。
