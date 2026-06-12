# Review 001 — デザイン整合性（PR #648 / Issue #626）

レビュー観点: デザイン言語・トークン準拠・モック間整合（P10 デスクトップ / モバイル / スケルトン / 比較ドラフト）

対象差分: `spec/design/pages/P10-home.html`, `spec/design/pages/mobile/P10-home.html`, `spec/design/pages/P10-home-skeleton.html`, `spec/design/pages/drafts/P10-toolbar-options.html`（新規）, `.issue/626/`（plan / adr / testing / manual-test）

---

## Blockers

なし

---

## Warnings

### W-001: 表示モード segmented のアイコン寸法が tokens.md の `--icon-xs` 定義と乖離（13px → 14px）

- **場所:** `spec/design/pages/P10-home.html` L1065-1073（svg width/height 14）、`spec/design/pages/mobile/P10-home.html` L989-997、`spec/design/pages/drafts/P10-toolbar-options.html`（案1-A/1-B/2-a 各所）
- **理由:** `spec/design/tokens.md` §5.5（L207）は `--icon-xs: 13px` の用途を「**segmented control の表示形式アイコン**」と明記しており（`app/styles/tokens.css` L110 にも実装済み）、実装側 `DisplayModeSwitch` もこのトークンを参照する前提になっている。本 PR は表示モード segmented のアイコンを 13px から 14px に変更したが、tokens.md は未更新のまま。14px は `--icon-sm` だが、その documented 用途は「フィルターボタンの `SlidersHorizontal`」であり、現状のままだと SSOT（tokens.md）と正モックが矛盾する。なお変更前の白カード版モックは 13px（`--icon-xs` 準拠）だった。
- **提案:** いずれかに揃えること。(a) モック・ドラフトのアイコンを 13px に戻して `--icon-xs` 準拠を維持する、または (b) アイコンのみ化に伴い 14px へ拡大する判断なら `tokens.md` §5.5 の用途表を更新（`--icon-xs` の用途文言の差し替え、または `--icon-sm` の用途拡張）し、実装フォローアップ Issue に「`DisplayModeSwitch` のアイコン寸法トークン変更」を含める。どちらでも成立するが、未記録のまま放置すると #620 → #626 で積み上げたトレーサビリティが壊れる。

---

## Notes

### N-001: ADR-001 の「`aria-label` と `title` を必須」がモバイルモック・ドラフトでは title 省略

- **場所:** `.issue/626/adr.md` ADR-001 Decision、`spec/design/pages/mobile/P10-home.html` L988-996（aria-label のみ）、ドラフトのモバイル幅プレビューも同様
- **理由:** タッチデバイスで `title` ツールチップが機能しないため省略自体は妥当だが、ADR はデバイス例外を書いていない。デスクトップ正モックは aria-label + title 両方あり。
- **提案:** ADR-001 か mobile モックコメントに「モバイルは title 省略（タッチでは無効なため）」と一行注記すると、実装フォローアップ時の aria 契約テスト設計で迷わない。

### N-002: segmented ボタン寸法のデスクトップ / モバイル差（32×28 vs 36×32）の根拠が未記録

- **場所:** `spec/design/pages/P10-home.html` L544-545（32×28px）、`spec/design/pages/mobile/P10-home.html` L536-537（width 36 / min-height 32）
- **理由:** ADR-001 は「32×28px」のみ記載。モバイルの拡大はタッチターゲット配慮として正しい判断だが、寸法差の理由がモックコメントにも ADR にも残っていない。モバイルヘッダーの pill-btn が 44px に拡大される前例（#628 ドラフト）と同系の判断なので、揃えて記録しておきたい。
- **提案:** mobile モックの `.segmented button` コメントに「タッチターゲット確保のため desktop（32×28）より拡大」と注記。

### N-003: スケルトンの `segmented-ph` 幅 104px は実寸 100px と 4px ずれ

- **場所:** `spec/design/pages/P10-home-skeleton.html` L519（104×32）
- **理由:** デスクトップ確定形の segmented 実寸は 32×3 + padding 2×2 = 100px 幅 / 32px 高。高さは一致しているが幅が 4px 大きい。`btn-ph`（92px）や `select-ph`（150px）は実寸合わせで作られているため、揃えるなら 100px。プレースホルダの近似として許容範囲であり修正必須ではない。
- **提案:** 次回スケルトン触る際に 100px へ。

### N-004: 良かった点（記録）

- 比較ドラフトは前例 `drafts/P10-header-options.html` と同形式（:root 簡易トークン・frame/opt-label 構造・利点/欠点併記・320px 幅検証）で品質良好。案2-b/2-c のモック省略も plan の方針どおりで、省略理由が opt-desc に明記されている。
- ink 濃度差 active（ink-tertiary → ink、hover で ink-secondary）は quiet/editorial の設計言語（装飾排除・低ノイズ）と整合し、使用トークンはすべて既存（新トークン・任意の生色値の混入なし。`9px`/`7px` radius と `#fff` 廃止後の構成は #620 時点の既存値の踏襲）。
- 非表示モード用途の `.segmented`（P15-export / P16-export-jobs / P18-tags / mobile/P15）への波及なしを確認（差分は P10 系 + drafts + .issue/626 のみ。P30 は ADR どおり意図的に未追従でフォローアップ委ね）。
- モバイル陳腐化コメント「下部固定 CTA へ退避」は 2 箇所とも解消され、残る「下部固定」言及（L517 / L734）はいずれも有効な廃止注記。デスクトップのヘッダー CTA 序列（アップロード primary / 新規作成 text）は #628 ADR-003 準拠で矛盾解消済み。
- スケルトンの `icon-ph` 削除に伴う orphan 参照なし。

---

## 判定

**APPROVE（条件付き）** — Blocker なし。W-001（`--icon-xs` と 14px の乖離）のみ、マージ前のモック修正（13px 戻し）か tokens.md 更新＋フォローアップ Issue への明記のどちらかで解消すること。
