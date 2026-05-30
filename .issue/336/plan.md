# 実装計画（初稿） — Issue #336: UI ボタンとリンクのスタイルを整理・統一する

**Issue:** #336（親 / umbrella Issue。本文に "Consider breaking into smaller tasks if scope is large" と明記）
**作成日:** 2026-05-29
**ステータス:** 初稿
**系譜:** #273（pill ボタンの 2 系統 [common/layout] 統合・マージ済み） / #152（disabled pill ボタンの hover/active 無効化・マージ済み）の延長線上

> 本計画の「現状分析」は、`app/components/{common,layout,auth,public,tag,directory}/styles.ts` を**全文通読**し、候補対象の consumer 数を grep で実際に確認した結果に基づく（確定済み）。

---

## 1. 背景・目的

ボタンとリンクのスタイルが、複数の `*/styles.ts` 定数群と各コンポーネントのインライン utility 文字列に分散している。#273 で **common と layout の pill ボタンを common 1 本に集約**し、#152 で disabled 時の hover/active を無効化した。これにより「authenticated app 内の pill ボタン」という 1 つの primitive は統一されたが、umbrella #336 が狙うのは「ボタンとリンク全般」の整理であり、調査の結果**他にも複数の独立したボタン/リンク系統と、明確な重複・死蔵**が残っていることが分かった（後述 2.2）。

本 Issue の目的:

1. ボタン・リンクのスタイル実装の現状を棚卸しし、統一済み / ばらつきを文書化する（umbrella の見取り図）。
2. その中から **1 PR で安全に完結できる現実的な一塊**を切り出して統一を進め、残りはフォローアップに分割する。

全画面の全ボタン・リンクを一度に置換するのはスコープ過大であり、回帰リスク・レビュー負荷とも高い。本計画は意図的にスコープを絞る。

---

## 2. 現状分析

### 2.1 既存の pill 統一基盤（#273 / #152 の成果）= 触る必要が薄い

`app/components/common/styles.ts`（全文確認済み）の pill 系:

- `pillBtn`（base）: `inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-surface text-sm font-medium text-ink … hover:not-disabled:not-aria-disabled:bg-surface-hover active:not-disabled:not-aria-disabled:bg-surface-hover active:…scale-[0.985] motion-reduce:active:scale-100 disabled:opacity-55 disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:cursor-not-allowed max-sm:min-h-[44px]`
- `pillBtnPrimary`: `data-[primary]:` 駆動の add-on
- `pillBtnDanger`: `data-[danger]:` 駆動の add-on

この基盤の特徴:

- **base + data 駆動 add-on** の variant 機構（`${pillBtn} ${pillBtnPrimary}` + `data-primary=""`）。#273 ADR-001/ADR-003 で確立。
- hover / active / disabled をすべて Tailwind variant で表現（CLAUDE.md「State styles use data-* attributes plus Tailwind's data-[name]: variants」準拠）。
- 押下フィードバック `active:scale` と reduced-motion 対応を内包。
- disabled の hover/active 抑止を `not-disabled:not-aria-disabled:` ガード + `aria-disabled:*` で `<button>` / `<a>`(=`<Link>`) 両対応（#152 ADR-001）。
- 色はすべてトークン utility（`bg-surface` / `text-ink` / `bg-accent` / `bg-error-surface` …）経由。

→ **authenticated app 内の主要 pill ボタンは統一済み**。本 Issue で再度触る必要は薄い。

### 2.2 確定した「ばらつき・重複・死蔵」インベントリ（#336 の素材）

全 styles.ts 通読 + grep で確認した、pill 統一基盤の**外側**にある系統。consumer 数はすべて実 grep 値。

| # | 区分 | 場所 | 内容 | consumer | 評価 |
|---|------|------|------|----------|------|
| a | 死蔵 small pill | `layout/styles.ts` `ROW_ACTIONS_SMALL_PILL` | 高さ 30px の小型 pill（`data-[primary]`/`data-[danger]` 内包、disabled ガード・`active:scale` なし） | **0 件**（grep 確認済み） | **削除候補（最小リスク）**。#273 ADR-001 補足で「将来 small pill が要れば common 側 variant で足す」方針が既定済み |
| b | nav-item リンクの重複 | `layout/styles.ts` `NAV_ITEM` と `directory/styles.ts` `TREE_ITEM_LINK` | どちらも `px-3 py-[7px] rounded-md text-sm text-ink … transition-colors … no-underline … data-[active]:bg-surface data-[active]:font-medium aria-[current=page]:bg-surface aria-[current=page]:font-medium` を共有（TREE_ITEM_LINK は加えて `flex-1 min-w-0 … truncate`） | NAV_ITEM=Sidebar、TREE_ITEM_LINK=DirectoryTree/TreeItem | **重複の SSOT 化候補**。共通の nav-item base を common に切り出し、tree 固有差分を add-on で重ねる |
| c | public pill 別系統 | `public/styles.ts` `PILL_BTN` | `h-9 px-4 rounded-pill … data-[primary]:…`。common pill と違い **`data-[danger]` なし / `active:scale` なし / disabled ガードなし** | **4 件**（PublicLayout / ErrorPage / PublicSearch / UserPublicTop） | #273 が明示的にスコープ外とした別系統。color/形は common pill にほぼ一致。意図的差分か要判断 |
| d | public テキストリンク | `public/styles.ts` `PUBLIC_TEXT_LINK`(+`_SIGNUP`) | `rounded-md hover:bg-surface` のリンク風ボタン | public ヘッダ | リンクと pill の中間。別 primitive |
| e | auth ボタン系統 | `auth/styles.ts` `BTN_PRIMARY` / `BTN_PRIMARY_INLINE` / `BTN_SECONDARY` / `BTN_SECONDARY_TALL` | 縦長 pill（`h-12`/`h-11`、`disabled:opacity-60`、`active:not-disabled:` ガード、**`aria-disabled` 対応なし**、`active:scale` なし） | **~12 ファイル**（auth フォーム・landing・admin フォーム） | 大きな独立系統。common pill と寸法・disabled 値（55 vs 60）・anchor 対応が異なる |
| f | public フォーム送信 | `public/styles.ts` `GATE_SUBMIT` / `SEARCH_FORM_BUTTON` | accent 背景の送信ボタン（`GATE_SUBMIT`=`disabled:opacity-60`、`SEARCH_FORM_BUTTON`=disabled ガードなし） | gate / search | accent ボタンの個別実装 |
| g | リンク装飾の重複 | `auth/styles.ts` `AUTH_FOOTER_LINK` ≒ `FIELD_LINK` ≒ `CALLOUT_ACTION` | いずれも `text-accent hover:underline hover:[text-underline-offset:3px]` を含む | auth 配下 | テキストリンク装飾が 3 定数に分散 |
| h | focus-visible リング | `pillBtn` / `BTN_*` / `PILL_BTN` / `NAV_ITEM` / `TREE_ITEM_LINK` 系**いずれも無し**。`focus-visible:` を持つのは `dialogCloseButton`（common）と `INPUT`（auth）のみ | — | 全ボタン/リンク | キーボード focus リングの統一が未着手（a11y 課題） |

### 2.3 ばらつきの軸（まとめ）

- **角丸**: ボタン=`rounded-pill`、ナビ/テキストリンク=`rounded-md`（概ね一貫）。
- **disabled opacity**: common pill=`opacity-55` / auth・public ボタン=`opacity-60`（不一致）。
- **disabled の anchor 対応**: common pill のみ `aria-disabled` 対応。auth/public 系は `disabled:` のみで `<a>` 非対応。
- **押下アニメ**: common pill のみ `active:scale`。他系統は無し。
- **focus-visible**: ほぼ全ボタン/リンクで欠落（`dialogCloseButton` / `INPUT` のみ）。
- **同一/近似定義の重複**: `NAV_ITEM` ⇄ `TREE_ITEM_LINK`（nav-item リンク）、リンク装飾（auth 3 定数）。

> 注（前バージョンからの訂正）: 当初 `TAG_LINK` の重複を素材に挙げたが、grep の結果 `TAG_LINK` はコード上に**存在しない**（`tag/styles.ts` は progress バー系のみ、`directory/styles.ts` は tree 系のみ）。実 grep で確認済みの b（NAV_ITEM ⇄ TREE_ITEM_LINK）に差し替えた。

---

## 3. スコープ定義（umbrella のため明示）

umbrella を一度に潰さず、**「死蔵 pill 定数の削除 + nav-item リンクの重複 SSOT 化」**に絞る。回帰リスクが最小（死蔵削除 + 等価集約）で、#273 が示した「common SSOT + variant」方針の自然な続きになる一塊を選ぶ。

### 3.1 このPRで対応する範囲

- **A. 死蔵 `ROW_ACTIONS_SMALL_PILL` の削除。** consumer 0 件（確認済み）。`layout/styles.ts` から除去するだけ。視覚回帰なし。
- **B. nav-item リンクの common 集約（`NAV_ITEM` ⇄ `TREE_ITEM_LINK` の重複解消）。**
  - 共通する nav-item base（`px-3 py-[7px] rounded-md text-sm text-ink transition-colors motion-reduce:transition-none select-none no-underline data-[active]:bg-surface data-[active]:font-medium aria-[current=page]:bg-surface aria-[current=page]:font-medium`）を **common** に正規定義として切り出す（例: `navItem`）。
  - `layout/styles.ts` `NAV_ITEM` を common 定義の re-export か参照に置換（`relative flex items-center gap-2 cursor-pointer hover:bg-surface` などレイアウト固有差分は合成で保持）。
  - `directory/styles.ts` `TREE_ITEM_LINK` を `${navItem}` + tree 固有差分（`flex-1 min-w-0 flex items-center gap-2 truncate cursor-pointer`）の合成へ置換。
  - **class 内容を現行と等価に保ち、視覚回帰ゼロを原則**とする。差分が出る場合は ADR に明記。
- **C.（任意・軽微なら同梱）public `PILL_BTN` の判断記録。** 4 consumer の意匠が common pill と意図的に異なるか #0 で確認。寄せられるなら本 PR で common へ移行、別意匠が妥当なら**本 PR では変更せず** ADR に「別系統として残す根拠」を記録（#273 と同じ判断を踏襲）。判断のみで実装が重ければ C は子 Issue へ。

### 3.2 このPRで対応しない範囲（フォローアップ Issue / #336 チェックリストへ）

- **auth `BTN_*` 系統（~12 consumer）の統一**（インベントリ e）。寸法・disabled 値・anchor 対応が common pill と異なり、安易に寄せると回帰が広い。独立した子 Issue。
- **public `GATE_SUBMIT` / `SEARCH_FORM_BUTTON` など accent 送信ボタンの統一**（f）。子 Issue。
- **リンク装飾の統一**（g: `AUTH_FOOTER_LINK` / `FIELD_LINK` / `CALLOUT_ACTION` / `PUBLIC_TEXT_LINK` / 本文リンク）。下線・hover 色など意匠判断を伴う別 primitive。子 Issue。
- **focus-visible リングの全ボタン/リンク統一**（h、a11y 専用タスク）。子 Issue。
- **disabled opacity の 55/60 統一**（値の正規化はデザイン判断）。子 Issue または上記統一に内包。
- 新規 variant の意匠刷新・トークン追加。
- `.note-detail-content`（CLAUDE.md 文書化済み例外）の内部スタイル。

> 本 PR 完了時に、上記を **#336 のチェックリスト or 子 Issue** として起票し umbrella 残務を可視化する。

---

## 4. 対応方針（アーキテクチャ観点）

CLAUDE.md「Styling」原則を厳守。

- **utility-first のみ。** 新規 CSS ファイル・`@apply` は作らない。`.note-detail-content` 以外の例外を増やさない。
- **共通 primitive は `app/components/common/styles.ts`（domain-agnostic primitive の正規の住所）に置く。** layout/directory/public の狭い住所に共通 primitive を生やさない（#273 ADR-001 の再多系統化予防）。
- **variant は base + add-on の合成で表現。** nav-item を common に足すなら、`pillBtnPrimary` / `pillBtnDanger` と同じく `${navItem} <surface固有差分>` で合成できる形にし、固有差分のみ重ねる。`data-[active]:` / `aria-[current=page]:` の機構は現行を踏襲。
- **状態は data-* + variant で表現。** `data-x={value || undefined}`（動的）/ `data-x=""`（静的 on）規約（#273 ADR-003 / #152 ADR-001）。
- **色・サイズはトークン経由。** `tokens.css`（SSOT）→ `@theme inline`（`index.css`）橋渡し utility を使う。本 PR でトークン追加はしない。
- **視覚回帰ゼロを原則。** 集約は class 内容等価で行う。意図的変化は ADR と testing.md に明記。
- **ADR を残す。** 集約 / 別系統据え置きの判断は `.issue/336/adr.md`（新規。#273 と同じ運用）。

---

## 5. 作業項目

- [ ] **#0 事前調査（本 PR 着手前）**
  - [ ] `grep -rn "ROW_ACTIONS_SMALL_PILL" app/` で 0 件を再確認
  - [ ] `NAV_ITEM`（Sidebar）/ `TREE_ITEM_LINK`（TreeItem）の JSX 使用箇所を読み、共通 base と固有差分の境界を確定。`data-active` の付与形（`data-active={... || undefined}`）も確認
  - [ ] `grep -rn "PILL_BTN" app/` で public `PILL_BTN` の 4 consumer の使われ方（primary 有無等）を確認し 3.1-C を確定
  - [ ] 調査結果を本 plan.md に反映し A/B/C を最終確定
- [ ] **#1 死蔵 `ROW_ACTIONS_SMALL_PILL` 削除**（`layout/styles.ts`）
- [ ] **#2 nav-item リンクの common 集約**
  - [ ] common に `navItem` base を追加（現行と等価な共通 class、data 駆動）
  - [ ] `layout/styles.ts` `NAV_ITEM` を `${navItem} <layout固有差分>` へ置換
  - [ ] `directory/styles.ts` `TREE_ITEM_LINK` を `${navItem} <tree固有差分>` へ置換
  - [ ] 両ファイルの import を整理
- [ ] **#3（C 採用時）public `PILL_BTN` を common へ移行 or 据え置き + ADR 記録**
- [ ] **#4 ADR 記録**（`.issue/336/adr.md`）
- [ ] **#5 umbrella 残務の起票**（3.2 を子 Issue / チェックリスト化）
- [ ] **#6 検証** `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test` → ブラウザ目視（testing.md）

---

## 6. 影響範囲

- `app/components/common/styles.ts` — `navItem` base 追加（#2）
- `app/components/layout/styles.ts` — `ROW_ACTIONS_SMALL_PILL` 削除（#1）、`NAV_ITEM` を合成へ置換（#2）
- `app/components/directory/styles.ts` — `TREE_ITEM_LINK` を合成へ置換（#2）
- consumer: `app/components/layout/Sidebar.tsx`（NAV_ITEM）、`app/components/directory/DirectoryTree/TreeItem.tsx`（TREE_ITEM_LINK）— import 整理のみ（定数名を保てば JSX 変更不要）
- `app/components/public/styles.ts` + 4 consumer（PublicLayout / ErrorPage / PublicSearch / UserPublicTop）— C 採用時のみ
- `.issue/336/adr.md`（新規）
- **影響しない:** domain / application / adapter / presentation の各層、ポート、データフロー。本 PR は presentation のスタイル定数 + JSX className のみを触る純フロント変更。

---

## 7. テスト方針（概要。詳細は testing.md）

- 自動: `pnpm typecheck`（削除した定数の参照漏れ・未使用 import を検出）→ `pnpm lint:fix && pnpm format` → `pnpm test`。
- 参照漏れ確認: `grep -rn "ROW_ACTIONS_SMALL_PILL" app/` が 0 件。
- 手動（ブラウザ）: サイドバーのナビ項目（NAV_ITEM）とディレクトリツリーのリンク（TREE_ITEM_LINK）が、従来どおりの寸法・hover・選択中（data-active）表示で見えること。C を触る場合は public 画面も。

---

## 8. リスク・懸念点

- **スコープ過大化（umbrella 特有）。** 対策: 死蔵削除 + nav-item 重複集約という最小リスクの一塊に絞り、auth/public/link/focus は子 Issue へ明示分離。
- **nav-item 集約での視覚回帰。** 対策: common 新定義を現行 class と等価に保つ。tree 固有の `flex-1 min-w-0 truncate` や layout 固有の `relative gap-2` を取りこぼさない。サイドバー / ツリーの選択中状態をブラウザで目視。
- **public `PILL_BTN` の意匠差を潰す退行。** 対策: #0 で意図的差分か確認し、別意匠なら据え置き + ADR（#273 と同判断）。安易に common へ寄せない。
- **consumer 移行漏れ・未使用 import。** 対策: `pnpm typecheck` + biome + grep（#273 と同手段）。
- **再多系統化の再発。** 対策: 新 base/variant は必ず common に置き、layout/directory/public に独自 nav-item/pill を生やさない（#273 ADR-001 補足の継続）。
- **Issue 番号の経緯。** 本計画は当初 `.issue/315/` 配下で作成されたが、GitHub #315 は別件（admin UsersTable 自己操作ガード）だったため、本「UI ボタンとリンクのスタイル整理・統一」umbrella を新規 Issue #336 として起票し、本ディレクトリを `.issue/336/` へ移設・番号参照を更新した（2026-05-30）。

---

## 付録: 参照

- `.issue/273/plan.md` / `.issue/273/adr.md` — pill ボタン 2 系統集約（common SSOT 化、base + data 駆動 variant、danger 灰色バグ修正、small pill は common variant で足す方針）
- `.issue/152/plan.md` / `.issue/152/adr.md` — disabled pill の hover/active 無効化（`not-disabled:not-aria-disabled:` ガード、`<a>` の aria-disabled 対応）
- `app/components/common/styles.ts` — 統一済み pill primitive（`pillBtn` / `pillBtnPrimary` / `pillBtnDanger`）
- `app/components/{layout,auth,public,tag,directory}/styles.ts` — 本 Issue のインベントリ対象
- `CLAUDE.md`「Styling」/「Frontend」 — utility-first・トークン・data-* 規約
- `app/styles/tokens.css` / `app/styles/index.css`（`@theme inline`） — デザイントークン SSOT と Tailwind 橋渡し
