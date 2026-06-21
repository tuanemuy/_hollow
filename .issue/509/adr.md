# ADR — Issue #509: エクスポート画面（P15/P16）のデザイン未実装解消

## ADR-001: P16 ジョブ一覧を「card-list」で実装する（desktop table grid-areas reflow を採らない）

### Status
Accepted

### Context
デスクトップモック `P16-export-jobs.html` は `.jobs-head`/`.job-row` を `grid-template-columns: minmax(200px,2fr) 110px 70px 150px 120px 120px auto`（`min-width: 820px`）の 7 カラム表として描き、`@media (max-width:1023px)` で `grid-template-areas` を使って 2 カラムへ折り返す。一方、専用モバイルモック `mobile/P16-export-jobs.html` は同じデータを `.job-card`（border + radius-lg のカード、`.job-meta` 2 カラムグリッド、`.job-actions` フル幅ボタン）で描く。実装 `ExportJobsListView` は `<ul><li>` を 1 ジョブ 1 アイテムで描画しており、固定列幅のテーブルではなく可変メタを持つリスト構造。

選択肢:
- (A) デスクトップ表（grid-template-areas reflow）を `max-sm:[grid-template-areas:...]` の arbitrary ユーティリティで忠実移植。
- (B) card-list を基準にし、`lg:` でメタを横並びに寄せる（モバイルモックの意匠を主、デスクトップは横並び密度を上げる）。

プロジェクト先例 `app/components/admin/Jobs/index.tsx` は「table → block-card reflow」（#589 ADR）を採るが、これは `<table>` を持つ admin 画面の都合。export 実装は `<ul><li>` であり、`<table>` への作り替えは「ロジック・DOM 構造の変更」に踏み込みすぎる（本 Issue はスタイリングのみ）。

### Decision
(B) を採用する。`<ul><li>` の DOM 構造を維持したまま各 `<li>` を `.job-card` 意匠（border/radius-lg/padding/flex-col）にし、`lg:` でメタ・アクションを横並びに広げる。`grid-template-areas` の 7 カラム表移植（A）は採らない。

### Consequences
- 良い点: 既存 DOM 構造（`<ul><li>`、ジョブごとの可変メタ）を壊さず、スタイリングのみで完結。モバイルモック（card）とデスクトップモック（横並び）双方の意匠意図を満たす。#588 の overflow=0 もカードなら自然に満たせる。
- トレードオフ: デスクトップで厳密な「表（揃った列）」にはならず、横並びカードになる。モックの列ヘッダー（ジョブ名/形式/件数/状態/作成日時/有効期限/アクション）は出さない。意匠の忠実度より構造維持・スコープ厳守を優先した結果。

---

## ADR-002: 動的な進捗バー幅は inline `style` で表現する

### Status
Accepted

### Context
進捗バー `.progress-bar { width: N% }` の `N` は `job.progress.processed/total` から算出する実行時の値。Tailwind の arbitrary value（`w-[62%]`）は**静的リテラルのみ** JIT がスキャンするため、`w-[${pct}%]` のような動的生成は機能しない（クラスが生成されない）。CLAUDE.md の utility-first 原則は「ハンドコード CSS / @apply の禁止」であって、データ駆動の単一プロパティ inline style を禁じてはいない。

### Decision
バーの色・高さ・角丸・トランジションは Tailwind ユーティリティ（`bg-accent h-full rounded-pill transition-[width]`）で表現し、**幅だけ** `style={{ width: \`${pct}%\` }}` で与える。

### Consequences
- 良い点: JIT の制約を回避しつつ、見た目はユーティリティで管理。プロジェクト内で動的寸法を inline style にする一般的パターンに沿う。
- トレードオフ: 1 プロパティだけ className 外に出る。コメントで WHY（動的値・JIT 制約）を最小限添える。

---

## ADR-003: 行アクションはテキスト付き小ピル（`pillBtnSmDense`）で実装し、icon-only `.row-icon-btn` を新設しない

### Status
Accepted

### Context
デスクトップモック P16 は行アクションを 28px 角の icon-only `.row-icon-btn`（hover で `.primary`=accent / `.danger`=error、モバイルで 44px）として描く。一方、実装 `ExportJobRow`/`ExportJobDetailView` のアクションはテキストラベル付きボタン（「ダウンロード」「キャンセル」「詳細」）で、`displayError` のメッセージ表示や `aria-label` ではなく可視テキストでアクセシビリティを担保している。モバイルモック `mobile/P16` の `.job-actions` はフル幅テキストボタン（`.pill-btn`）であり、icon-only ではない。

選択肢:
- (A) 新規 `ROW_ICON_BTN` 定数を作り、ラベルを `aria-label`/`title` に退避して icon-only 化（デスクトップモック忠実）。
- (B) 既存 `pillBtn` + `pillBtnSmDense`（+ `pillBtnPrimary`/`pillBtnGhostDanger`/`pillBtnGhost`）でテキスト付き小ピルにし、可視ラベルを維持（モバイルモック寄り、既存 a11y 保持）。

### Decision
(B) を採用する。行アクションは `pillBtn` 系の小サイズ（`pillBtnSmDense`）でテキストラベルを保ったまま意匠化する。新規 icon-only 定数 `ROW_ICON_BTN` は作らない（モバイルモックもテキストフル幅ピルであり、icon-only はデスクトップモック固有）。

**ペア `data-*` 属性が必須**: `pillBtnPrimary`(L48) / `pillBtnDanger`(L62) / `pillBtnGhostDanger`(L86) / `pillBtnGhost`(L105) は、色を `data-[primary]:` / `data-[danger]:` / `data-[ghost-danger]:` / `data-[ghost]:` バリアント側に持つ設計（同一プロパティの生成順対策で意図的）。よって対応する `data-primary=""` / `data-danger=""` / `data-ghost-danger=""` / `data-ghost=""` 属性を要素に**必ず**付与する（admin/Jobs が `data-sm=""` を付けているのと同じ要領）。属性を落とすと「クラスは当たっているのに色が出ない」沈黙バグになり、ビルド/型/テストでは検出されず目視レビュー頼みになる。詳細 Link（`<a>`）に danger/ghost 系を当てる場合も同様に属性が要る（`pillBtn` は anchor 対応済み）。

### Consequences
- 良い点: 既存の可視テキストラベル（a11y）を保持。共通 `pillBtn` 系を流用でき新規定数を増やさない。モバイルモックのフル幅テキストボタンとも整合。`Link`（詳細）と `<button>`（download/cancel）の両方に同系統スタイルを当てられる（`pillBtn` は anchor 対応済み）。
- トレードオフ: デスクトップでの「28px 高密度 icon-only 行」というモックの密度感は再現しない。意匠の密度よりアクセシビリティ・既存構造維持・共通定数流用を優先。

---

## ADR-004: status チップ／dot の色は既存 `exportStatusTag(status): Tone` を共通化して流用する（`data-status` 多分岐を採らない）

### Status
Accepted

### Context
DTO の `status` は 6 値（`pending`/`processing`/`completed`/`failed`/`cancelled`/`expired`）だが、デスクトップモック `P16-export-jobs.html` の `.status` CSS（L556-570）は `running`/`done`/`failed`/`queued`/`cancelled` の **5 分類**しか dot 色を定義しておらず、`expired` 専用の dot 色は存在しない。AC-3 の「6 status すべてにバリアント」を `data-status={job.status}` + `data-[status=...]:` の 6 分岐 CSS で素朴に実装すると、(1) `expired` の色をモックに無いまま決め打ちすることになり「モックを正とする」前提と衝突し、(2) 基底デフォルト色 + variant 上書きの構成だと同一プロパティ（background/text-color）の上書き順が生成 CSS 順勝負になり（common/styles.ts ADR-003）、多分岐ゆえ上書きが効かないケースが出やすい。

一方、`app/components/admin/Jobs/index.tsx` に **6 つの export status を Tone（info/success/warning/error）へ写す純関数 `exportStatusTag` が既に存在**し、`tagBadge`+`tagTone[exportStatusTag(status)]` で status チップを描く先例が動いている（同一ドメイン・同一 6 status）。ただし現状この関数は admin/Jobs 内のローカル（非 export）定義であり、そのまま import すると admin → export の横依存が生じる。

選択肢:
- (A) export 側に `data-status` の 6 分岐バリアント CSS を新設（dot 色 + text 色を variant で網羅）。
- (B) `exportStatusTag` を共通の純関数として括り出し、チップ tone（`tagTone[...]`）と dot 色の両方を同一マッピングから導く。

### Decision
(B) を採用する。`exportStatusTag(status): Tone` を共通モジュール（`app/components/common/styles.ts` 近傍、ないし `app/components/common/` の status ヘルパ）へ移して export し、admin/Jobs と export の両方が同一の純関数を参照する。マッピングは admin の既存定義を**正**としてそのまま流用する:

| DTO status | Tone | チップ（`tagTone`） | dot 色 |
|---|---|---|---|
| `pending` | `info` | `bg-accent-surface text-accent-ink` | accent |
| `processing` | `info` | `bg-accent-surface text-accent-ink` | accent（+ `motion-safe:animate-pulse`） |
| `completed` | `success` | `bg-success-surface text-success` | success |
| `failed` | `error` | `bg-error-surface text-error` | error |
| `cancelled` | `warning` | `bg-warning-surface text-warning` | warning |
| `expired` | `warning` | `bg-warning-surface text-warning` | warning |

チップ本体は `tagBadge`+`tagTone[exportStatusTag(status)]` で描き、`data-status` 多分岐 CSS は持たない。dot（円）はチップに無い要素なので、Tone → dot 色の小マッピング（4 系統 = accent/success/warning/error）を 1 つ持ち、`exportStatusTag` の戻り値から引く（status 値そのものでなく Tone で分岐するため分岐は 4 系統に閉じる）。`processing` の pulse のみ status 値で個別判定する。

戻り値型 `Tone` の所在も同時に解決する。現状 `Tone`（`"info" | "success" | "warning" | "error"`）は `admin/Jobs/index.tsx` L45 に**ローカル `type Tone`** として宣言されており、`common/styles.ts` には Tone 型の export が無い（`tagTone` は値のみ、`tagTone` L278-283 のキー型 export も無い）。`exportStatusTag` を共通へ移すと戻り値型 `Tone` も共通側で定義・export する必要があり、dot 色の `Record<Tone, string>` マッピングも `Tone` に依存する。よって `Tone` 型を `common/styles.ts`（`tagBadge`/`tagTone` と同居）へ `export type Tone = keyof typeof tagTone` として定義・export し、`exportStatusTag`／dot マッピングから参照する。admin/Jobs 側の `type Tone` ローカル宣言（L45）は削除して共通 import に差し替える（`ingestionStatusTag` L109 も同じ `Tone` を返すため、ローカルに残すと「共通 Tone」と「admin ローカル Tone」の二重定義になる。DRY で共通へ寄せる）。

### Consequences
- 良い点: 色マッピングのロジックを二重に持たない（DRY）。`expired` は `cancelled` と同じ `warning` に寄り、モックに無い色を新規決め打ちしない。AC-3 は「6 status すべてが**いずれかの** Tone バリアントにマップされる」と読み替えられ、4 系統に閉じるため `data-status` 6 分岐の上書き順リスクが消える。admin/export 間で表示が将来ズレない。
- トレードオフ: `exportStatusTag` の置き場所を admin/Jobs から共通モジュールへ移す軽微なリファクタ + `Tone` 型の共通化（export 化と admin ローカル宣言の削除）が入る（admin 側の import 差し替え）。スタイリングのみの本 Issue にロジック・型の移動が混じるが、二重定義回避のため許容する。

---

## ADR-005: segmented active の影は `--shadow-xs` トークンを arbitrary 内で合成して表現する

### Status
Accepted

### Context
P15 モックの segmented active 影は `box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)`（L506）。第1レイヤー `0 1px 2px rgba(0,0,0,0.04)` は `tokens.css` の `--shadow-xs`（L118）と**完全一致**する。第2レイヤー（`0 0 0 0.5px` の極薄リング）のみ非トークン。CLAUDE.md の「影はトークンで一元管理」の趣旨に照らすと、第1レイヤーを生 rgba でベタ書きするのは避けたい。ただし Tailwind の `shadow-xs` ユーティリティと arbitrary `shadow-[...]` は後勝ち上書きで単純に積めない。

### Decision
1 ユーティリティで 2 レイヤーを表現するため、トークン変数を arbitrary 内で参照する形 `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` を使う。第1レイヤーは生 rgba ではなくトークン変数経由とし、第2レイヤーのみ arbitrary リテラルで重ねる。

### Consequences
- 良い点: トークン一元管理（`--shadow-xs` 変更が segmented にも波及）と忠実再現を両立。生 rgba のベタ書きを避ける。
- トレードオフ: 第2レイヤーは非トークンの arbitrary リテラルのまま残る（モック固有の極薄リングでトークン化対象外）。

---

## ADR-006: 共通化した `exportStatusTag` は `common/styles.ts` でなく新規 `common/exportStatus.ts` に置く

### Status
Accepted（実装時に確定）

### Context
ADR-004 は `exportStatusTag(status): Tone` を「`common/styles.ts` 近傍、ないし `common/` の status ヘルパ」へ移すと述べるが、置き場所を一意に定めていなかった。`common/styles.ts` は純粋な Tailwind ユーティリティ文字列定数のモジュール（JIT スキャン対象のリテラル群）で、ドメイン DTO（`ExportJobDTO`）への型依存を持たない。`exportStatusTag` は `ExportJobDTO["status"]` を引数に取る純関数であり、スタイル定数モジュールに DTO 依存を持ち込むと責務が混ざる。

### Decision
`exportStatusTag` は新規 `app/components/common/exportStatus.ts` に純関数として置き、戻り値型 `Tone` のみ `common/styles.ts`（`tagBadge`/`tagTone` と同居、`export type Tone = keyof typeof tagTone`）から import する。admin/Jobs と export 3 画面はこの 1 関数を共有する。

### Consequences
- 良い点: スタイル定数モジュール（`styles.ts`）を DTO 依存から切り離したまま、色マッピングの DRY（ADR-004 の意図）を達成。`Tone` 型だけは `tagTone` の隣に置くのが自然なので styles.ts に残す。
- トレードオフ: export ドメインの status ヘルパが `common/` に 1 ファイル増える（admin/export 双方が参照する横断ヘルパなので `common/` が妥当）。

---

## ADR-007: segmented control のフォーカスリングは `focus-within:` でなく `has-[:focus-visible]:` で label に引き上げる

### Status
Accepted（レビュー指摘 B-001 で確定）

### Context
plan L199 は「フォーカスリングは label 側で `focus-within:` 表現」と方式を確定していたが、初回実装は `<label>` 自身に `focus-visible:` を当てていた。segmented は `<label>` で `sr-only` な `<input type="radio">` を包む構造で、実フォーカスは内側 radio が受け、`<label>` 自身はタブ移動でフォーカスを受けない。よって `<label>` の `:focus-visible` は発火せず、キーボードでセグメントを巡回してもフォーカスリングが出ない（WCAG 2.4.7 Focus Visible 抵触）。plan が指定した `focus-within:` なら内側 radio のフォーカスが親 label に伝播して発火するが、`focus-within:` はマウスクリックでも発火するため不要なリングが出る。

### Decision
内側 radio のフォーカスを親 label に伝播させる方式とし、`focus-within:` ではなく `has-[:focus-visible]:`（`has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent`）を採用する。`:focus-visible` セマンティクスをそのまま親へ引き上げるため、キーボード巡回時のみリングが出てマウスクリック時には出ない。plan の「内側 radio のフォーカスを親 label に伝播させる」意図は満たしつつ、表現を `focus-within:` から `has-[:focus-visible]:` に差し替える。

### Consequences
- 良い点: キーボードユーザーに現在位置のフォーカスリングが可視化され WCAG 2.4.7 を満たす。マウスクリックでは不要なリングが出ない。
- トレードオフ: plan の文言（`focus-within:`）と実装表現が乖離するが、`focus-visible` セマンティクス保持の方が UX 上望ましいため本 ADR で差分を記録する。`:has()` は対象ブラウザで広くサポート済み。
