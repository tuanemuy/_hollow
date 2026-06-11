# Review 002 — デザイン整合性（PR #648 / Issue #626）ラウンド2

レビュー観点: デザイン言語・トークン準拠・モック間整合（ラウンド1 = review-001-design.md のフォローアップ）

対象差分: `git diff origin/main`（未コミット分含む）— `spec/design/pages/P10-home.html`, `mobile/P10-home.html`, `P10-home-skeleton.html`, `drafts/P10-toolbar-options.html`, `.issue/626/`

---

## ラウンド1指摘の検証

### W-001（segmented アイコン 14px → 13px 戻し）: 解消を確認

- `spec/design/pages/P10-home.html` L1066-1074: 表示モード segmented の svg は全て `width="13" height="13"`。
- `spec/design/pages/mobile/P10-home.html` L995-1003: 同じく 13px。
- `spec/design/pages/drafts/P10-toolbar-options.html`: 案1-A（L143-145）・案1-B desktop（L169-171）・モバイル幅プレビュー（L206-208 / L222-224）・案2-a（L250-252）の全 segmented が 13px に統一（未コミット修正で対応済み）。
- `spec/design/tokens.md` §5.5 は未変更（`--icon-xs: 13px` = segmented control の表示形式アイコン）。モックが 13px に戻ったことで SSOT とモックの矛盾は解消。`app/styles/tokens.css` L525 とも一致。
- 残存する `width="14"` は pill-btn 内アイコン（選択 / ビュー保存 / 新規 / アップロード）のみで、これらは segmented 用途外・変更前からの既存値。非対象の `.segmented`（P15 / P16 / P18 / mobile/P15）への波及もなし。

**→ W-001 クローズ。**

### N-001 / N-002（Notes、対応任意）: 対応済みを確認

- N-001: `.issue/626/adr.md` ADR-001 Decision に「`title` はデスクトップ（hover 可能環境）のみ必須、モバイルは省略可」が追記され、Consequences の文言も整合するよう修正。mobile モックコメント（L527-532）にも同旨の注記あり。正モックの実態（desktop = aria-label + title / mobile = aria-label のみ）と一致。
- N-002: ADR-001 に「寸法: デスクトップ 32×28px / モバイル 36×32px（タッチターゲット配慮、#628 ドラフトと同系の判断）＋実装時は当たり判定 44×44px 相当へ拡大」が追記され、mobile モックコメントにも同内容を記載。寸法差の根拠が記録された。

### N-003（skeleton segmented-ph 104px vs 実寸 100px）: 未対応（許容範囲のまま持ち越し）

`P10-home-skeleton.html` L520 は `104×32` のまま。実寸（32×3 + padding 2×2 = 100px）と 4px 差。プレースホルダ近似として許容。次回スケルトンに触る際に 100px へ。

---

## Blockers

なし

## Warnings

なし

## Notes

### N-001 (R2): N-003 (R1) の持ち越しのみ

上記のとおり `segmented-ph` 幅 104px の 4px ずれが残るが、修正必須ではない。新規の指摘事項なし。

### 追加確認（記録）

- ADR 追記文中の「Apple HIG 44pt」当たり判定方針は、見た目寸法（32×28 / 36×32）と分離して書かれており、モックの視覚仕様と矛盾しない。
- ラウンド2修正はアイコン寸法と ADR 文言のみで、レイアウト・トークン・色・radius（9px / 7px、#620 既存値踏襲）に新たな変更はない。新トークン・生色値の混入なし。

---

## 判定

**APPROVE** — W-001 解消、N-001 / N-002 も記録面で対応済み。残るのは任意の N-003（スケルトン幅 4px 近似）のみで、マージを妨げない。
