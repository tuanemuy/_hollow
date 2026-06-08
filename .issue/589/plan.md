# 実装計画 — Issue #589: モバイルモック(#536)の実装追従 ③ admin 高密度テーブルのカード化（P40〜P47）

**Issue:** #589
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

#536 / PR #584 のモバイルモック（実体は `spec/design/pages/mobile/{name}.html`、390px基準・320〜430px overflow=0）を実装(`app/`)に追従させるシリーズの **③admin 高密度テーブルのカード化**。admin（P40〜P47）の高密度 `<table>` を、狭幅でのみカード／縦積みへ畳むモバイル導線を実装する。デスクトップ幅の高密度テーブル（密度優先・ADR-005）は維持し回帰させない。

## スコープ

> **注:** Issue 対象表の「P43-admin-tokens（トークン一覧）」は、実体としてトークン設定フォーム `app/components/admin/DesignTokensForm` を指すと解釈した（admin にトークン一覧専用コンポーネントは存在しない）。

### 含まれるもの

- **P45 ユーザー一覧**（`UsersTable/index.tsx`）の `<table>` を `max-sm:` でカード化（主対象）
- **P46 ジョブ監視**（`Jobs/index.tsx`）の取り込み／エクスポート／Cleanup テーブル + 操作セクション群を `max-sm:` でカード化／縦積み（主対象）
- **P43 デザイントークン行**（`DesignTokensForm/index.tsx`）の `grid-cols-[220px_1fr]` を `max-sm:grid-cols-1` へ縦積み
- P40/P41/P42/P44/P47 の 390px 目視による非回帰確認（変更は出た場合のみ最小修正）

### 含まれないもの

- デスクトップ幅のテーブル表示変更（モバイルのみ分岐、非回帰が絶対条件）
- 機能追加（P40 のチャート／アクティビティ、P45/P46 のサブタイトル件数表示などの feature 差分）
- 新規共通基盤・新規 `admin/styles.ts` の新設（#587/#588 の既存基盤を消費するのみ）
- DTO・server-fn・フィルタロジックなどの非表示系の変更

## ①②共通基盤（#587/#588）の消費物

- `pillBtn`（`max-sm:min-h-[44px]` タッチ床内蔵）／`pillBtnSm`（`data-[sm]:max-sm:min-h-0` で床を打ち消す）／`fieldControl`（44px 床）を消費。
- `max-sm:`/`lg:hidden`/`data-*` variant・トークン経由・新規 px を持ち込まない実装規約（CLAUDE.md / #588）を踏襲。

## 実装ステップ

### Step 1: P45 ユーザー一覧のカード化（`UsersTable/index.tsx`）— 主対象

実装方式は **P47 Metrics と同じ「同一 `<table>` に `max-sm:block` を当ててリフロー」**（設計判断1）。

- `<table>` の `min-w-[880px]` を `max-sm:min-w-0` で解除。`<table>` に `max-sm:block`、`<thead>` に `max-sm:hidden`、`<tbody>` に `max-sm:block`。外側 wrap は `max-sm:overflow-x-visible max-sm:border-none max-sm:rounded-none`（mock `.table-wrap`/`.table-scroll`）。
- `<tr>`（UserRow）: `max-sm:block max-sm:border max-sm:border-hairline max-sm:rounded-lg max-sm:mb-3 max-sm:p-4 max-sm:bg-bg`（mock `tr.row-main`）。
- `<td>` 共通: `max-sm:flex max-sm:gap-3 max-sm:items-start max-sm:py-1`。補助セル（登録日/ロール/状態）に実 DOM `<span>` ラベルを前置（`hidden max-sm:inline-block max-sm:w-[84px] text-ink-tertiary text-xs uppercase tracking-[0.04em]`、設計判断2）。
- ユーザーセル（見出し）: ラベルなし。`max-sm:pb-3 max-sm:mb-2 max-sm:border-b max-sm:border-hairline`（mock `td.user-td`）。アバターは既存 `w-8 h-8` 維持。
- アクションセル: `max-sm:pt-3 max-sm:mt-2 max-sm:border-t max-sm:border-hairline`。内側 flex を `max-sm:flex-col max-sm:items-stretch` にし、**タッチ床回復は親スコープ `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full [&>button]:max-sm:justify-center`**（ADR-004 / `LINK_MINI_ROW` 同手法、各ボタン無改修）。
- **空状態セル（`<td colSpan={5}>`）**: `display:block` 化で `colSpan` は無視されるため、補助セル用の `max-sm:flex`・ラベル span は当てず `max-sm:block max-sm:text-center` のみ当てる分岐にする（カード崩れ防止）。
- **対応 mock**: `spec/design/pages/mobile/P45-admin-users.html`。

### Step 2: P46 ジョブ監視のカード化（`Jobs/index.tsx`）— 主対象

P46 mobile mock はテーブルを `job-card`+`dl` 別マークアップにしているが、**P45 と同じ「同一テーブルを `max-sm:` でリフロー」方式に統一**（設計判断1）。視覚的に等価なカードになる。

- 取り込み/エクスポート 2 テーブル: Step 1 と同一の table/thead/tbody/tr/td 分岐。`min-w-[920px]` を `max-sm:min-w-0` で解除。`ROW_CLASS` に `max-sm:block max-sm:border ... max-sm:rounded-lg max-sm:p-4 max-sm:mb-3`、`TD_CLASS`/`TD_RIGHT_CLASS` に `max-sm:flex max-sm:gap-3 max-sm:py-1`。
- ジョブ見出しセル（ジョブID+ファイル名）: ラベルなし見出し + 下境界。補助セル（種別/所有者/更新/エラー）に実 `<span>` ラベル前置。所有者ID・エラーコードは `max-sm:break-words`（mock の `overflow-wrap:anywhere`）。
- アクションセル: `max-sm:flex-col max-sm:items-stretch` + 親スコープ床回復 `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full [&>button]:max-sm:justify-center`（ADR-004）。
- CleanupSection の項目/説明テーブル: 同様に `max-sm:` リフロー。
- 操作セクション群（検索インデックス/バックフィル/再暗号化）: `flex items-center gap-3` を `max-sm:flex-col max-sm:items-stretch` + 親スコープ床回復（mock `.op-row`、ADR-004）。
- 空状態セル（あれば）は Step 1 と同じ `max-sm:block max-sm:text-center` 分岐。
- **対応 mock**: `spec/design/pages/mobile/P46-admin-jobs.html`。

### Step 3: P43 デザイントークン行の縦積み + タッチ床（`DesignTokensForm/index.tsx`）

mock（`P43-admin-tokens.html`）は `.token-row` を `flex-direction:column` の 3 段縦積み（キー行 / スウォッチ+値入力 / 操作）にし、`.token-input` と操作ボタンに `min-height:44px`、ボタンは `width:100%` を付与している（ADR-005）。「グリッド解除だけ」では受け入れ基準のタッチ床を満たさないため、以下まで対応する。

- トークン行 `grid grid-cols-[220px_1fr] gap-3` に **`max-sm:grid-cols-1`**（220px 固定列が 320px で溢れないよう縦積み）。
- キー入力・値入力（現状 `h-8`/`INPUT_CLASS` の `h-10`）に **mobile 44px 床** `max-sm:h-11`（または `max-sm:min-h-[44px]`）を付与。
- 値列 `flex items-center gap-2`（スウォッチ+値入力+削除ボタン）を `max-sm:flex-wrap` 等で折り返し可能にし、削除ボタンを全幅・床回復。床回復は親スコープ `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full`（ADR-004）。スウォッチ+値入力は 1 行を維持。
- **対応 mock**: `spec/design/pages/mobile/P43-admin-tokens.html`。
- P43 は「目視のみ」ではなくコード変更ありの対象。

### Step 4: P40/P41/P42/P44/P47 の非回帰確認（コード変更なし想定）

- **P47 Metrics**: limits table の `max-md:block` リフロー + メトリクスカード 1 カラムは既に SSOT 一致。変更不要、390px 目視のみ。
- **P40 Dashboard**: テーブルなし・グリッド対応済。変更不要。
- **P41/P42/P44 フォーム**: テーブルなし・1 カラム・`fieldControl` 44px 床継承済。変更不要、目視のみ。
- 万一 390px 目視で溢れ要素が出たら、その要素だけ `max-sm:` で最小修正。

### Step 5: 重複クラスの集約（最小化）

- UsersTable と Jobs で重複する table リフロー用 `max-sm:` クラス群は、各ファイルの既存定数（`TABLE_CLASS`/`ROW_CLASS`/`TD_CLASS` 等）に追記して完結させる。**新規 `admin/styles.ts` の新設はしない**（重複が大きければ片方の定数を共有 import する程度）。

## 設計判断

詳細は adr.md を参照。

- **ADR-001**: カード化方式は「同一 `<table>` を `max-sm:block` でリフロー」に統一（mock の別マークアップは採らない）。P47 Metrics の既存パターンに一貫、desktop 非回帰を CSS だけで保証。
- **ADR-002**: セルのラベルは `data-label::before` 擬似要素ではなく実 DOM `<span>`（a11y 優位 + Metrics 既存パターン踏襲）。
- **ADR-003**: ブレークポイントは画面別 mock の desktop 境界に従う（P45/P46 = `max-sm`、P47 limits = `max-md` 据え置き）。
- **ADR-004**: カード化行アクションのタッチ床（§3）回復は親スコープ `[&>button]:max-sm:min-h-[44px] [&>button]:max-sm:w-full [&>button]:max-sm:justify-center` で行う（#588 `LINK_MINI_ROW` 同手法、specificity 確定的）。
- **ADR-005**: P43 はグリッド解除（`max-sm:grid-cols-1`）に加え、入力の 44px 床・削除ボタン全幅+床回復まで対応する（mock は 44px 床あり）。

## リスクと注意点

- **desktop 非回帰が絶対条件**: 全変更を `max-sm:`（Metrics のみ `max-md:`）で囲い、`sm:`/`md:` 以上の既存クラスは素のまま残す。`min-w-[880px]`/`[920px]` は `max-sm:min-w-0` で打ち消す形にし desktop 値は変更しない。
- **`pillBtnSm` の床打ち消し対策**: `data-[sm]:max-sm:min-h-0` と同一 specificity の上書きは生成順依存で不安定。親スコープ `[&>button]:max-sm:min-h-[44px]`（子結合子で specificity を上げる、#588 `LINK_MINI_ROW` 実績）で確定的に勝つ（ADR-004）。
- **`<table>` の `display:block` 化での a11y**: thead 非表示時に列ラベルが失われる → 実 `<span>` ラベルで担保（ADR-002）。
- **トークン逸脱回避**: 新規 px は持ち込まない。`w-[84px]`/`w-[132px]` ラベル幅は mock 値・Metrics 既存値に合わせる。
- **機能追加の越境禁止**: レイアウト畳み込みのみ。
- **Jobs は client component**（`"use client"`）だが変更は className のみでロジック不変。

## テスト方針

- 静的ゲート: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- agent-browser で **P45 / P46 / P47 を 320px / 390px / 430px** で実測: 各幅で `scrollWidth <= clientWidth`（overflow=0）+ カード化を確認。特に **320px 下限**は P43 の 220px 固定列・P45/P46 の固定幅テーブルで溢れやすいため必ず実測する。
- 非回帰: **lg 以上**で UsersTable/Jobs/Metrics の高密度テーブルが従来通り（横スクロール込み）であることを確認。
- カード内タッチターゲット: 行アクションが mobile で 44px 高 + 全幅。
- 念のため P40/P41/P42/P44 も 390px で overflow=0 を確認。P43 はコード変更対象のため 320px でトークン行が溢れないこと・入力/削除ボタンが 44px 床であることを実測。

## レビュー履歴

### 1周目（2視点並列）
**修正した点**:
- [要件 P-001 / アーキ P-002] Step 3（P43）の根拠を訂正。mock の「`@media(max-width:640px)` で grid 解除」は事実誤認で、実際は `.token-row` が `flex-direction:column` の 3 段縦積み + `.token-input`/操作ボタンに `min-height:44px`。Step 3 を「グリッド解除 + 入力44px床 + 削除ボタン全幅・床回復」へ拡張し、ADR-005 を新設。P43 を「目視のみ」グループから明確に除外。
- [アーキ P-001] ADR-004 のタッチ床回復を `data-[sm]:max-sm:min-h-[44px]` 直接上書き（specificity 等価で生成順依存・不安定）から、親スコープ `[&>button]:max-sm:min-h-[44px] ...`（#588 `app/components/publication/styles.ts` `LINK_MINI_ROW` の確立パターン、子結合子で specificity 確定）へ変更。Step 1/2/3 のアクション行・操作セクションすべてに反映。
- [要件 P-002] スコープ節に「P43『トークン一覧』= `DesignTokensForm`（トークン設定フォーム）と解釈」を明記。
- [要件 S-001] テスト方針の agent-browser 実測を 390px 中心から **320px / 390px / 430px の3幅実測**へ明記（320px 下限がクリティカル）。

**取り込んだ改善提案**:
- [アーキ S-001] Step 1 に空状態セル（`<td colSpan>`）の `max-sm:block max-sm:text-center` 分岐を追記（`display:block` 化で colSpan 無視によるカード崩れ防止）。
- [アーキ S-002] ADR-002 に「`<thead>` の `max-sm:hidden` = `display:none` 前提で span ラベルが SR 唯一の列見出し」依存関係を追記。

**見送った提案とその理由**:
- [アーキ S-003] UsersTable/Jobs の重複クラスを `common/styles.ts` へ共有プリミティブ化 → 実装時判断に委ねる（Step 5 で「重複が大きければ片方を import 共有」と既記載）。スコープ拡大は避ける。

両視点とも上記反映で要修正は解消。次周は不要と判断（軽微・実装時判断に委ねた S-003 のみ残存、未解決事項ではない）。
