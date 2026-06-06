# PR Review #005 — PR518 レビューコメント対応（14 指摘の充足監査）

**PR:** #518
**Date:** 2026-06-06
**Round:** 5回目（レビューコメント対応分）

---

## Summary

- Blockers: 0
- Warnings: 1
- Nits: 4
- Verdict: **APPROVED**（W-001 はモック自身の自己整合の微小ズレ。意味伝達・破綻はなく、出荷を止めない）

PR518 のレビューコメント 14 項目への対応を、設計 SSOT（`spec/design/index.md` / `tokens.md`）準拠と指摘充足の両面で監査。14 項目すべてが意図どおり反映され、構造破綻・横スクロール誘発・トークン規約の重大違反は無し。トースト導入（`common-toast.html` 新規 + index.md §フィードバック原則の 2 系統明文化）と `.alert` 統一（案D）は両立しており、矛盾は無い。検出は軽微（toast モバイル例の shadow 自己不整合 1 件、密度優先の固定 px・タップ幅の nit 数件）にとどまる。

---

## 指摘充足マトリクス（PR518 #1〜#14）

| # | 指摘 | 判定 | 一言 |
|---|------|------|------|
| 1 | 「完全削除」→「完全に削除」（P17 / confirm-dialog） | ✅ | UI ラベル全箇所を置換。残存「完全削除」は CSS コメント・退避案内 prose のみ（ラベルではない）。 |
| 2 | パスワード強度バーをセマンティックカラーへ（P05 level3） | ✅ | 全段 error/warning/success/success に。バー・ラベルとも `--color-accent` 排除。 |
| 3 | ランディング見出しの横幅（P07 hero-title CJK） | ✅ | `max-width:16em` + `word-break:keep-all` + `text-wrap:balance`。em ベースで fluid 思想に整合、句中改行を抑制。 |
| 4 | ランディング文言が仮（P07 "Apple Calm" 露出） | ✅ | eyebrow を「個人のための、静かなノートサーバー」へ、subtitle も自然なコピーに。内部用語の露出を除去。 |
| 5 | ノート一覧ツールバー/フィルターの混雑・左ズレ（P10-home） | ✅ | `filter-bar` を `padding:0`（先頭チップ左端＝見出し/ツールバーと整列）、`border-bottom` 撤去で二重線解消、`margin-bottom:--space-5` で余白分離（§2.2 準拠）。 |
| 6 | エクスポートジョブ UI（P16） | ✅ | `.jobs-scroll`（テーブル単体 `overflow-x:auto`）+ grid `min-width:820px`、`.main` 1100px。アクションを icon-only（aria-label/title/aria-hidden）に整然化。モバイル 44px 拡張あり。ページ全体横スクロール無し。 |
| 7 | 設定ページの見出しパターンは意図的か（index.md 明文化） | ✅ | §2.4 に「設定（P21〜P24）の見出しパターンは意図的」を追記（h1 不在＝セクションカード h2 積み上げ、a11y は視覚非表示 h1 で担保）。 |
| 8 | 保存ビュー UI の洗練（P20-views / save-view-dialog） | ✅ | 6 連テキストボタン→「適用（主）+ ⋯ メニュー（副）」に集約、代表 1 行のみメニュー open 表示。ダイアログのラジオに説明文（flex-start 整列、§10.5）。 |
| 9 | 個人公開ページの画像/プロフィール中央バランス（P30） | ✅ | avatar+名前/ユーザー名を `.profile-head`（縦中央揃え）上段グループ化、bio/stats を下に全幅縦置き。`.profile-info`→`.profile-id` のリネーム残骸なし。 |
| 10 | 公開検索と個人公開ページの不揃い（P32） | ✅ | `result-card` の padding/gap を P30 ノート行のリズムへ、固定 px（12/14px）をトークン（`--text-xs`/`--text-sm`）へ。 |
| 11 | 設定と admin のパーツ差は意図的か（index.md 明文化） | ✅ | §2.4 に「設定と admin で UI パーツが異なるのは意図的」を追記（文脈差の反映であり不統一ではない）。 |
| 12 | 管理者ページ横幅の不揃い（P40〜P47） | ✅ | P41（880px）/ P44（760px）を `--container-max` へ。P40/P42/P43/P45/P46/P47 を含む全 8 画面が `--container-max` で統一。 |
| 13 | admin トークンページのフォーム伸縮・「上書き中」溢れ（P43） | ✅ | 2 列→3 列固定（220px \| 1fr \| 108px）、「上書き中」を専用アクション列へ（右上スタック）、value 入力に `min-width:0`、btn に `white-space:nowrap`。溢れ解消。 |
| 14 | トースト導入 + `.alert` 統一維持 | ✅ | index.md §フィードバック原則に「トースト/インラインアラート 2 系統」と棲み分けを明文化。`common-toast.html` は Apple Calm/トークン準拠で破綻なく描画。`.alert`（案D）統一は不変。 |

---

## 検出事項

### Blockers

なし

### Warnings

- **[W-001]** トーストのモバイル例で `--shadow-lg` を使用（index.md は toast = `--shadow-md` と規定）
  - 場所: `spec/design/pages/common-toast.html:318`（`.phone .toast { box-shadow: var(--shadow-lg); }`）
  - 問題: index.md §フィードバック原則のトースト「構造」は **白地 + `--shadow-md` + `--radius-lg`** と明記し、本ファイル冒頭コメント（202行）・lead 文（371行）・基底 `.toast`（218行 `--shadow-md`）もすべて `--shadow-md` で揃えている。モバイル位置のステージ表現だけが `--shadow-lg` に上振れしており、モック自身の自己整合がわずかにズレる。
  - 根拠: `spec/design/index.md` §フィードバック・エラー表示原則「**白地（`--color-surface-elevated`）+ `--shadow-md` + `--radius-lg`**」/ `tokens.md` §6（`--shadow-lg` はモーダル/ダイアログ用途）。
  - 推奨: `.phone .toast` の `box-shadow` を `--shadow-md` に揃える（モバイルで影を強めたい意図があるなら index.md 側に「モバイルは `--shadow-lg`」と一文追記して SSOT と一致させる。どちらかに寄せる）。
  - 注: `--shadow-lg` 自体は `:root` 正準トークン（新規追加ではない）。視覚破綻・横スクロール・意味誤りは無いため出荷ブロッカーではない。

### Nits

- **[N-001]** P20-views の `row-menu-btn`（icon-only）のモバイル幅が 44px 未達
  - 場所: `spec/design/pages/P20-views.html`（`.row-menu-btn { width:30px; height:30px }`、global mobile MQ 158〜168 行は `button` に `min-height:44px` を当てるが `min-width:44px` は `.icon-btn` 限定）
  - 問題: `.row-menu-btn` は `<button>` なのでモバイルで高さ 44px は確保されるが、幅は 30px のまま。タッチ目標 44×44 のうち幅が目標未達。
  - 根拠: index.md §3 / §7.1「タップ領域」（タッチ主体では 44 を確保。AA 床 24 は満たす）。
  - 推奨: モバイル MQ に `.row-menu-btn { min-width:44px }`（または `.icon-btn` 相当のクラス付与）を追加。AA 床（24px）は満たすため軽微。`.apply-btn` は icon+label なので問題なし。

- **[N-002]** P43 アクション列の固定値 `108px`（grid 第3列）
  - 場所: `spec/design/pages/P43-admin-tokens.html:116`（`grid-template-columns: 220px 1fr 108px`）
  - 問題: 新規の固定 px 列幅。admin 高密度の役割差として許容範囲だが、220px と並ぶマジックナンバー。
  - 根拠: #461 ADR-001（固定 px 任意値を増やさない / 意図的な差は役割差として残す）。
  - 推奨: 現状維持で可（バッジ + 「既定に戻す」を nowrap で収める実測値）。トークン化の必要はないが、列幅の意図をコメントに残すと将来の改変耐性が上がる。

- **[N-003]** P30 プロフィールヒーローの新規固定 px（`gap:18px` / `.profile-head gap:24px` 等）
  - 場所: `spec/design/pages/P30-user-public-top.html:271-279`（`gap:18px` / `24px`、avatar `96px` 等）
  - 問題: レイアウト再構成で 18px/24px の固定 gap を導入（24px は `--space-6` 相当だが直値）。元から P30 は px 直値が多い画面で本変更だけの問題ではない。
  - 根拠: tokens.md §3（`--space-6=24px`）。
  - 推奨: `gap:24px`→`var(--space-6)`、`gap:18px`→近傍トークン（`--space-5`=20px 等）への寄せを検討（公開シェル全体の px 直値整理は別 Issue 規模）。視覚影響は軽微。

- **[N-004]** P16 行アクションの詳細アイコンが「ⓘ 風の円+点」で意味判別がやや弱い
  - 場所: `spec/design/pages/P16-export-jobs.html` 各 `row-icon-btn`（`aria-label="詳細を開く"` の円+縦線+点 SVG）
  - 問題: ダウンロード/再エクスポートは判別容易だが「詳細」アイコンは情報アイコン風で、同種 icon-only が並ぶと一目の判別性が落ちうる（§7.1「並置は判別性低下に注意」）。
  - 根拠: index.md §7.1「同種の icon-only ボタンが並ぶと意味が判別しづらくなるため並置は避けたい」。
  - 推奨: `aria-label`/`title` は付与済みで a11y 床は満たすため許容。気になるなら「詳細」のみラベル併用 or アイコン差別化を検討。admin ではなくアプリシェル（P16）だがデスクトップ密度の行アクションとして妥当。

---

## 確認した健全性（問題なし）

- **トークン準拠**: `common-toast.html` の `:root` は正準トークンに一致。`--toast-*` 等の新規トークンは作っておらず、`.alert` と同じ `--alert-accent` 1 変数で切替（index.md §フィードバック原則どおり）。中間 `text-[13px]` 等の任意値は新規導入なし（P32 はむしろ固定 px をトークンへ寄せた）。
- **ADR-003 角丸**: P16 `row-icon-btn`・P20 `row-menu-btn`・P43 `btn-sm-ghost-danger` の icon-only/小型ボタンはいずれも `--radius-pill`。`--radius-full` の誤用なし。toast の close は `--radius-pill`（24px 円形でも pill=full 視覚不変）。
- **横スクロール禁止**: P16 はテーブルを `.jobs-scroll`（単体 `overflow-x:auto`）に隔離し `.main` 1100px、モバイルで `min-width:0` 解除。ページ全体の横スクロール誘発なし。toast の table も `.table-wrap overflow-x:auto` に隔離。
- **Apple Calm**: 白基調維持、彩度の高い差し色の新規追加なし（強度バーは既存セマンティック、toast の info は無彩色グレー `--color-info` 維持）。区切りは線より余白へ（P10 filter-bar）。シャドウは浮く要素（toast/メニュー）に限定（W-001 の 1 箇所を除き `--shadow-md`/`--shadow-sm`）。
- **a11y**: toast/P16/P20 の icon-only に `aria-label` + `title`、装飾 SVG に `aria-hidden`。toast は `role=status`/`alert` + `aria-live=polite`/`assertive` を使い分け。P20 メニューに `role=menu`/`menuitem`/`aria-haspopup`/`aria-expanded`。モバイル 44px 拡張（toast/P16/P20 global MQ）あり（W-001 N-001 の幅未達を除く）。
- **整合性**: 同種 admin 8 画面が `--container-max` に統一。P30↔P32 のリズム整合。`.alert` 案D 統一は不変（トーストは別カテゴリとして矛盾なく追加）。
- **構造健全性**: 編集 6 ファイルのブレース balance 一致。P16 `.jobs-scroll` 入れ子は `.jobs > .jobs-scroll`、`.empty-state` は sibling で well-formed。P30 の `.profile-info` 旧クラス残骸なし。

---

## Design Decisions

- 通知 2 系統（トースト / インラインアラート `.alert`）の棲み分けを index.md §フィードバック・エラー表示原則に明文化（トースト＝一時的・文脈に残さない結果、`.alert`＝恒常的・文脈に紐づく情報、二重提示禁止）。参照モック `common-toast.html` を新設。実装基盤（グローバルトースト Provider）の追従は別 Issue。
- 設定（P21〜P24）の見出しパターン、設定と admin の UI パーツ差を、いずれも「意図的な文脈差」として §2.4 に明文化（揃えるべき不統一ではない）。
- 本ラウンドの新規設計判断は上記の SSOT 追記のみ。W-001（toast モバイル shadow）は SSOT とモックのどちらかへ寄せて解消する小タスクとして残す。
