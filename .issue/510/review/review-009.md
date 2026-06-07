# PR Review #009 — P32公開検索のP30統一 + ランディング組版調整 + `.alert`(案D)横展開（commit `7b4aab9`）

**PR:** #518
**Date:** 2026-06-07
**Round:** 9回目（commit `7b4aab9` の監査）
**対象:** `P07-landing` / `P12-editor` / `P14-publish-settings` / `P17-trash` / `P20-views` / `P24-settings-account-delete` / `P32-public-search` / `P33-share-link` / `P40-admin-dashboard` / `P41-admin-llm`（10ファイル）

---

## Summary

- Blockers: 0
- Warnings: 0
- Nits: 4
- Verdict: **APPROVED**

ユーザーフィードバック4点（(a) P32公開検索をP30に揃え統一感を出す、(b) フィルターバーと結果リストの幅不一致を解消、(c) ランディングの読点リズム改善、(d) section-titleの句中改行を防ぐ）は、すべて適切に対応されている。P32の`.result-card`は`grid 1fr auto` + 右寄せ日付列 + 著者をメタ行へ畳む構造へ刷新され、P30の`.note-row`と行アナトミー・トークン値（`padding:20px 12px` = `--space-5 --space-3`、`gap:24px` = `--space-6`、`.result-date`の`--text-sm`/`--color-ink-tertiary`/`white-space:nowrap`）まで一致した。820px読書カラム制約の撤去で`filter-bar`と結果リストは`main-wrap`の`--container-max`幅を共有し、幅不一致が解消。旧flex-column構造の残骸はゼロ。8ファイルの`.alert`(案D)移行は基底＋サブ要素がcanonical（P04:291-312）とプロパティ単位で一致し、`comma-hang`・旧banner/form-error系クラス・塗りつぶしセマンティック背景の残骸は全ファイルでgrep 0件。指摘は軽微（既存マジックナンバーの持ち越し、index.md参照モック列挙の追従漏れ、P40の死にCSS、P32レートアラートの幅感）にとどまる。

---

## 指摘充足マトリクス（ユーザーフィードバック）

| # | フィードバック | 判定 | 該当行・根拠 |
|---|------|------|------|
| (a) | P32公開検索をP30に統一し洗練 | ✅ | `P32` の `.result-card { display:grid; grid-template-columns:1fr auto; gap:var(--space-6); align-items:center; padding:var(--space-5) var(--space-3) }` は `P30` の `.note-row` と同型。`.result-main { min-width:0; flex-direction:column; gap:var(--space-1) }` と右寄せ `.result-date { font-size:var(--text-sm); color:var(--color-ink-tertiary); white-space:nowrap }` は `P30` と一致。著者は `.result-meta` 行内の `.result-author` へ畳まれた。HTMLも `div.result-main > title + snippet + meta(author·dot·tag)` + `div.result-date` の同型へ全7カード書換え済み。 |
| (b) | フィルターバーと結果リストの幅不一致解消 | ✅ | 旧 `@media(min-width:1024px){.results-panel{max-width:820px;margin:0 auto}}` を撤去。現在 `.results-panel { min-width:0 }` のみで幅制約なし。`.filter-bar` も幅制約なし。両者とも `.main-wrap { max-width:var(--container-max); margin:0 auto }` の同一幅を共有し、幅が揃った。 |
| (c) | ランディングの読点リズム改善（読点4→2） | ✅ | hero subtitleが「書きかけのメモも、取り込んだ Markdown も。Hollow が静かに整理して、必要なときにそっと取り出せます。」へ。読点（、）は2個に削減（旧文は4個）。eyebrowは「あなただけの、小さな書庫」へ更新。 |
| (d) | section-title等の句中改行を防ぐ | ✅ | `.hero-title`・`.hero-subtitle`・`.section-title` に `word-break:keep-all` + `text-wrap:balance` + `hanging-punctuation:allow-end` を付与。すべて標準CSSプロパティのみ。マークアップハック（`<span class="comma-hang">` + 負マージン）は完全撤去（grep 0件）。 |

---

## `.alert`(案D) canonical一致マトリクス

canonical定義 `P04:291-312` に対し、移行8ファイルの基底＋サブ要素を照合：

| ファイル | `.alert` 基底 | サブ要素 | margin | divergence |
|---|---|---|---|---|
| P12-editor | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.alert button`（lock解除）+ `@media(max-width:639px)` ローカル拡張（妥当） |
| P14-publish-settings | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.safety-check .alert{margin-bottom:0}`（妥当） |
| P17-trash | ✅ | ✅ | `margin-bottom:var(--space-6)` | なし（inline `style` で局所上書き） |
| P20-views | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.alert-body code` + `.alert .fix-btn` + `.view-main .alert` ネスト余白（妥当） |
| P24-account-delete | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.alert-content ul/li`（リスト本文の正当な拡張） |
| P32-public-search | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.rate-alert{margin-top:var(--space-6)}`（妥当） |
| P33-share-link | ✅ | ✅ | `margin-bottom:var(--space-6)` | なし |
| P41-admin-llm | ✅ | ✅ | `margin-bottom:var(--space-6)` | `.field .alert{margin-top:var(--space-3);margin-bottom:0}`（妥当） |

8ファイルすべて `--alert-accent` 変数切替・`background:var(--color-bg)`・`border:1px solid color-mix(in oklab,var(--alert-accent) 30%,transparent)`・`box-shadow:var(--shadow-xs)`・`.alert-icon{margin-top:1px}`・`.alert-content{gap:2px;min-width:0}`・`.alert-title{letter-spacing:-0.01em}`・`.alert-body{--color-ink-secondary;--leading-relaxed}` がcanonicalとプロパティ単位で一致。SVGは全件 `20×20 / stroke-width:2`、`.alert-icon` spanに `aria-hidden="true"` 付与で同型。

---

## 検出事項

### Blockers
なし

### Warnings
なし

### Nits

- **[N-001]** index.md §251 の `.alert` 参照モック列挙が今回の移行ページを未反映（SSOT追従漏れ）
  - 場所: `spec/design/index.md` §インラインアラート 参照モック列挙。本commitで `.alert`(案D) を採用した P12 / P14 / P17 / P20 / P24 / P32 / P33 / P41 が含まれていない。
  - 問題: SSOTの参照モックリストが実体（案D採用ページ）より狭い。違反ではないがドキュメントが古い。
  - 推奨: §251に移行8ページを追記する小タスク。

- **[N-002]** `P40-admin-dashboard.html` の `.banner.warning` / `.banner.error` が死にCSS（本文で未使用）
  - 場所: `P40` `.banner` 系。本commitで白地＋セマンティック枠へrecolorされたが `class="banner"` はHTML本文0件（使用は `.status-banner` 系のみ）。
  - 問題: 未使用ルールのrecolor。今回導入された問題ではない。`.status-banner.degraded` のrecolorは実体ありで正当。
  - 推奨: 別Issueで実使用 or 削除を検討。現状無害。

- **[N-003]** 移行ファイルに旧コンポーネント由来のマジックナンバーpxが持ち越し
  - 場所: `P12`（`.alert button { font-size:12.5px; padding:4px 10px }`）、`P20`（`.alert .fix-btn { padding:6px 12px }`）、`P24`（`.alert-content ul { padding-left:1.2em }`）等。
  - 問題: 旧ボタン/リストからの引き継ぎで本commitの新規導入ではない。回帰ではない。
  - 推奨: 現状維持で可。気になれば既存トークンへ寄せる微修正。

- **[N-004]** P32レートアラートが720px幅のheroの上に`main-wrap`全幅で配置され、視覚的に広く見える可能性
  - 場所: `P32` `.main-wrap > .alert.alert-info.rate-alert`。`.hero { max-width:720px }` に対しalertは`--container-max`幅一杯。
  - 問題: レートアラートだけが下のヒーロー検索（720px中央寄せ）よりかなり横長。role=status・info(無彩色)で主張は抑えられているため軽微。
  - 推奨: 視覚確認の上、必要なら `.rate-alert` にhero相当の `max-width` を与えると一体感が出る。

---

## 確認した健全性（問題なし）

- **P32↔P30 行アナトミー一致**: `.result-card`（grid 1fr auto / `align-items:center` / `padding:var(--space-5) var(--space-3)` / `gap:var(--space-6)`）は `.note-row` と構造・トークン値とも一致。`.result-main { min-width:0 }`、`.result-date` も `.note-main`/`.note-date` と同値。著者の `.result-author`（avatar-mini 18px + `--color-ink-secondary` strong）を `.result-meta` 行内へ畳む処理はクロスユーザー検索として妥当。モバイルMQで `.result-card { padding:var(--space-4) var(--space-2); gap:var(--space-3) }` / `.result-date { font-size:var(--text-xs) }` と縮退し、P30モバイルと整合。
- **旧flex-column構造の残骸ゼロ**: P32の旧 `.result-card { display:flex; flex-direction:column }` と旧縦積み著者ヘッダーは完全除去。HTMLも全7カード移行済み。
- **幅不一致の解消**: 820px capブロックは完全削除。`filter-bar` と `results-panel` は共に幅制約なしで `main-wrap` の `--container-max` を共有。
- **ランディング組版がセマンティックCSSのみ**: `word-break:keep-all` / `text-wrap:balance` / `hanging-punctuation:allow-end` は標準CSSプロパティ。Firefox未対応への言及コメントあり。`comma-hang`・負マージン・per-line `<span>` ハックは全ファイルでgrep 0件。
- **`.alert` canonical一致**: 8ファイルすべて基底＋サブ要素がP04/P15/P44とプロパティ単位で一致。
- **塗りつぶしセマンティック背景の全廃**: 移行コンポーネントから `background:var(--color-*-surface)` は全除去。残る `*-surface` 参照（hover・chip・tag・icon badge）は本commit対象外の既存用途。直値 `rgba(...)` も `color-mix` / `var(--color-surface)` へトークン化。
- **Apple Calm**: 全件白基調維持。alertのシャドウはcanonical `--shadow-xs` のみ。
- **a11y**: alertの `role` は用途別に正しく使い分け（破壊操作=`role="alert"`、案内=`role="status"`）。装飾SVGに `aria-hidden`、SVG 20×20。インタラクティブ `.alert button`/`.fix-btn` は各ページのモバイルMQ `button{min-height:44px}` でタッチ44px確保。
- **トークン準拠**: 移行 `.alert` 規則は新規トークン追加なし。新規マジックナンバーの導入なし（N-003は持ち越し）。
- **ブレースbalance**: 10ファイルすべて開閉一致（P32:163・P07:89・P12:158・P14:135・P17:110・P20:135・P24:144・P33:65・P40:118・P41:100）。
- **横スクロール**: `.alert-content { min-width:0 }` + flexで折り返し。P32 `.result-main { min-width:0 }`、`.result-date` のみ `white-space:nowrap`。Firefox実機で全画面 overflowX=0。

---

## Design Decisions

- **P32結果リストをP30の `.note-row` アナトミーへ統一**: 縦積み（著者ヘッダー → タイトル → スニペット → 折返しメタ行）から `grid 1fr auto`（本文左・日付右）へ移行し、著者を `.result-meta` 行内へ畳んだ。クロスユーザー検索でも「行の主役＝ノートタイトル、著者は所属情報」という情報階層を保ちつつ、個人公開ページ（P30）との視覚的一貫性を獲得。トークン値もP30と完全同期。
- **820px読書カラム制約の撤去**: フィルターバー（全幅）と結果リスト（820px cap）の幅不一致を、capを撤去して `main-wrap` の `--container-max` に揃えることで解消。読書カラムの可読性より、フィルター⇔結果の幅整合とP30との一貫性を優先。
- **ランディングCJK組版を標準CSSのみで実現**: 過去の `<span class="comma-hang">` + 負マージンというマークアップハックを `hanging-punctuation:allow-end` + `word-break:keep-all` + `text-wrap:balance` のセマンティックCSSへ置換。Firefox未対応はベンダー実装待ちとして許容（コメント明記）。読点削減（4→2）と併せ句読点リズムを調整。
- **`.alert`(案D) を運用/エディタ/ダイアログ系へ横展開**: review-007 でauth系へ広げた案Dを、本commitで P12/P14/P17/P20/P24/P32/P33/P41 の旧banner/notice/inline結果へ拡張。塗りつぶしセマンティック背景を全廃し、白地＋細枠＋アイコン＋見出し＋本文へ統一。
- **P40の `.banner` は別カテゴリとして残置**: admin運用ダッシュボードのstatus banner系はインラインアラートとは別構造として案D集約対象外（review-007 #4の判断を踏襲）。今回は配色のみApple Calm化。
