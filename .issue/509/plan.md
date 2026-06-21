# 実装計画 — Issue #509: feat(ui): エクスポート画面（P15 フォーム / P16 ジョブ一覧・詳細）のデザイン未実装を解消する

**Issue:** #509
**作成日:** 2026-06-21
**複雑度:** 中〜大規模

---

## 目的

`spec/design/pages/P15-export.html` / `P16-export-jobs.html`（およびモバイル同名モック）の意匠を、className を一切持たない素の HTML だった export 系コンポーネントに適用する。**ロジック・データフロー・ルーティング構造には一切触れず、スタイリングのみ**を行い、`.issue/500` の P15/P16 フォローアップを解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | P15 `ExportForm` がモックの意匠（page-title/subtitle・section-label・segmented control・radio-row 風選択・check-row・input-text・alert・sticky form-footer）でスタイルされ、`pnpm build` の Tailwind が当該クラスを生成する | Issue本文 / `.issue/500/diffs/P15-export.md` | 3, 6 |
| AC-2 | P15 の「形式（HTML/Markdown/PDF）」「用紙サイズ（A4/Letter）」が segmented control の意匠（白カード active 状態）で表現され、active が `data-active` 属性で制御される | P15 モック `.segmented` | 2, 6 |
| AC-3 | P16 `ExportJobsListView` がモックの job-card / 状態チップ（status dot + 色）/ 進捗バー / メタ / 行アクション（download・cancel・詳細）でスタイルされ、6 つの status 値すべてが**いずれかの状態バリアント（Tone）にマップ**される（下表参照） | Issue本文 / `.issue/500/diffs/P16-export-jobs.md` | 2, 4, 7 |
| AC-4 | P16 `ExportJobDetailView` がモックの meta グリッド（dl）・進捗バー・状態チップ・アクション行・error/fail-summary バリアントでスタイルされる | Issue本文 / P16 モック | 5, 7 |
| AC-5 | P16 のジョブ詳細リンクは現状どおり別ルート `/exports/$jobId` を維持する（同一ページ展開化しない） | Issue スコープ / `.issue/500/decisions-pending.md` | 4, 5 |
| AC-6 | P15 は現状どおりページ型を維持する（モーダル化しない） | Issue スコープ / `.issue/500/decisions-pending.md` | 3 |
| AC-7 | デスクトップ・モバイル両モックに追従する（job-card はモバイルでカード／デスクトップで横並びメタ、form-footer はモバイルで縦積み） | #588 申し送り | 3, 4, 7 |
| AC-8 | 既存スタイリング規約に準拠（utility-first / tokens / `data-*` / 共通 `styles.ts` 流用）し、新規 CSS ファイル・`@apply`・素のリテラル px の不要な持ち込みをしない | CLAUDE.md Styling | 1, 全ステップ |
| AC-9 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通り、既存テスト（`ExportForm.test.tsx`）が緑のまま | CLAUDE.md | 8 |

### status 値 → 表示バリアントの対応表（AC-3 / AC-4 の検証基準）

DTO の `status` は 6 値だが、デスクトップモック `.status` CSS は 5 分類しか dot 色を持たず `expired` 専用色が無い。よってモックの色分岐をそのまま 6 分岐 CSS にするのでなく、**admin Jobs で既に動いている `exportStatusTag(status): Tone`（同一 6 status）を共通化して流用**し、チップ tone と dot 色の双方を同一マッピングから導く（二重定義回避。ADR-004）。マッピングは admin の既存定義を**正**とする:

| DTO status | Tone | チップ（`tagBadge`+`tagTone[...]`） | dot 色 | 備考 |
|---|---|---|---|---|
| `pending` | `info` | `bg-accent-surface text-accent-ink` | accent | |
| `processing` | `info` | `bg-accent-surface text-accent-ink` | accent | `motion-safe:animate-pulse` |
| `completed` | `success` | `bg-success-surface text-success` | success | |
| `failed` | `error` | `bg-error-surface text-error` | error | |
| `cancelled` | `warning` | `bg-warning-surface text-warning` | warning | |
| `expired` | `warning` | `bg-warning-surface text-warning` | warning | モックに専用色なし → `cancelled` と同じ warning に寄せる |

dot は Tone（4 系統 = accent/success/warning/error）で分岐するため `data-status` の 6 分岐 CSS は不要（上書き順リスクが消える）。pulse のみ status 値で個別判定する。

## スコープ

### 含まれないもの

- **構成の全面書き換え**: P15 のモーダル化、P16 ジョブ詳細の同一ページ展開化（別 Issue #500 で「実装構造を維持」と決定済み）。既存のページ型・別ルート構造を維持したまま意匠のみ適用する。
- **ロジック / データフロー / ルーティングの変更**: 対象選択 UI（モックのラジオ「このノート/選択中/ビュー」）は実装が単一 noteId or 一括 ID textarea のため、**実装にある UI 構造を維持して意匠だけ寄せる**。モックにある「ビュー全件」スコープ・推定サイズ・ファイル名規則・実行モード選択・フィルターバー（状態/期間）・「更新」「新規エクスポート」ボタン等、**実装に存在しない機能は追加しない**（機能追加は別 Issue）。
- **AppShell 付与**（#502）、**インスタンスのトークン上書き**（#401）。モックのヘッダー/サイドバー shell は本 Issue の対象 tsx 外なので触れない。
- **action.ts / loader.ts / schema.ts / *.test.tsx の振る舞い変更**（テストはスタイル追加で壊れないことの確認のみ）。

## 調査結果

- **関連ファイル（変更対象）**:
  - `app/components/export/ExportForm/{index,Page}.tsx` — P15 フォーム本体（client）とページ shell。
  - `app/components/export/ExportJobsList/{index,Page}.tsx` — P16 一覧（`ExportJobsListView` + `ExportJobRow`）とページ shell（Suspense/Skeleton 既設）。
  - `app/components/export/ExportJobDetail/{index,Page}.tsx` — P16 詳細（`ExportJobDetailView` + `ExportJobNotFound`/`ExportJobDetailPage`）。
  - 新規: `app/components/export/styles.ts` — export ドメイン固有の className 定数（segmented・job-card・status・progress・row-icon-btn 等）。
- **参照（流用元・変更しない）**:
  - `app/components/common/styles.ts` — `pillBtn`/`pillBtnPrimary`/`pillBtnGhost`/`pillBtnDanger`/`pillBtnGhostDanger`/`pillBtnIcon`/`pillBtnSmDense`、`ALERT`系一式、`tagBadge`/`tagTone`/`tagToneNeutral`、`radioRow`/`checkboxRow`、`field`系、`scrollbarHidden`、`formError`。
  - `app/components/layout/styles.ts` — `APP_MAIN`?（shell 用なので使わない）、`PAGE_TITLE`/`PAGE_SUBTITLE`/`SECTION_LABEL`?・`EMPTY_STATE`/`EMPTY_STATE_ICON`/`ROW_ACTIONS`/`FORM_ERROR`/`FIELD`/`FIELD_LABEL`/`FIELD_INPUT`/`FIELD_TEXTAREA`。
  - `app/components/note/list/styles.ts` `DISPLAY_SEGMENTED`/`DISPLAY_SEGMENTED_BTN` — segmented control の **icon-only 先例**（P15/P16 は labeled + 白カード active なので別バリアントが要る）。
  - `app/components/admin/Jobs/index.tsx` — 状態チップ（`tagBadge`+`tagTone`）の先例。テーブル reflow の先例でもあるが、export は実装が `<ul><li>` ベースのため card-list で踏襲する（ADR-001 参照）。
- **あるべきアーキテクチャ**（CLAUDE.md Styling / `spec/design/tokens.md`）:
  - utility-first（`className` に Tailwind ユーティリティ直書き）。新規 CSS ファイル・`@apply` 禁止。
  - 反復するユーティリティ列は module-scoped 定数（`styles.ts`）に集約。Tailwind JIT がリテラルを走査するので挙動はインライン同等。
  - 状態スタイルは `data-*` 属性 + `data-[name]:` バリアント。`data-x={value || undefined}` で falsy 時に属性ごと消す。
  - 同一プロパティの上書きは生成 CSS 順で決まるため、縮小方向・確実な上書きは `data-[...]:` バリアント化する（common/styles.ts の ADR-003 に準拠）。
  - トークンは `bg-accent-surface`/`text-accent-ink`/`text-ink-secondary`/`border-hairline`/`bg-surface-elevated`/`bg-success-surface`/`text-warning`/`rounded-pill`/`rounded-lg` 等が `@theme inline` 経由で全てユーティリティ化済み（agent 調査で確認）。モックの `border-radius: 7px` や segmented の active box-shadow は arbitrary value（`rounded-[7px]`/`shadow-[...]`）で対応。
  - ブレークポイントは `max-sm:`/`lg:` バリアントを使う。`--breakpoint-*` リテラルは `index.css` に既存（新規 px 持ち込み不要）。
- **既存実装の状態**:
  - 対象 3 コンポーネントは className を一切持たない素の HTML（diff の「方針2: 未実装」状態）。**ロジックは完成しており**、本 Issue はそこに className を被せるだけ。
  - `ExportForm` は実機能が「形式 / FrontMatter / メディア埋め込み / PDF 用紙サイズ / 単一=DL / 一括=ID textarea + 非同期推奨 alert（既に `ALERT` 系適用済み）」。モックの実行モード選択・推定サイズ・ファイル名規則・対象ラジオは**実装に無い**ため、既存の DOM 構造に意匠を寄せる（不存在機能は描かない）。
  - `ExportJobsList`/`ExportJobDetail` は STATUS_LABEL（6 値）・format/scope・progress・createdAt/expiresAt・download/cancel/詳細を持つ。モックの job-card・status dot・progress bar・meta グリッド・row-icon-btn を素の DOM に適用する。
- **依存関係**: 変更は `app/components/export/` 配下の tsx と新規 `export/styles.ts` のみ。ルート（`app/routes/_app/{export,exports}/*`）・action・loader・schema・DTO（`core/application/export/view`）には触れない。`STATUS_LABEL` は `ExportJobsList/index.tsx` から `ExportJobDetail` が import 済みで、これは維持。

## 設計

### ドメインモデルへの影響
なし（スタイリングのみ。ドメイン/アプリ/アダプター層は不変）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

スタイル適用の方針を**意匠単位**で確定する（モックを正、実装の DOM 構造を維持）。

#### 共通方針
- 新規 `app/components/export/styles.ts` に export 固有の反復ユーティリティを集約（common/layout の既存定数で賄えるものは流用し、再定義しない）。
- 状態（segmented active / status バリアント / expiry warn・expired / row-icon-btn primary・danger）は `data-*` 属性 + `data-[...]:` バリアントで表現。
- page-title / page-subtitle / main コンテナは `layout/styles.ts` の `PAGE_TITLE`/`PAGE_SUBTITLE` を流用（TrashList 先例）。Page.tsx の `<main>` は本 Issue では shell 化（#502）しないので、モック `.main`（中央寄せ・最大幅・パディング）を **export ローカルの `EXPORT_MAIN` 相当**でラップするか、最小限のユーティリティを直書きする。max-width は P15=720px / P16=1100px とモックが異なる点に注意。
- **max-width のリテラル px について（S-003）**: 既存 `--container-max`（1280px）/ `APP_MAIN`（`max-w-[var(--container-max)]`）は shell 全幅用の値で、P15=720 / P16=1100 のモック固有値とは一致しない。tokens.css に 720/1100 に対応する container 系トークンは存在しない（`--container-max: 1280px` / `--container-padding: clamp(16px,4vw,32px)` のみ）。`APP_MAIN` を流用すると幅がモックとずれるため使わない。720/1100 はトークン化されていない**意匠固有値**であり、`max-w-[720px]` / `max-w-[1100px]` の arbitrary 持ち込みは許容範囲とする（#588 の「リテラル px 新規持ち込み回避」は新規の散発的ハードコードを戒める趣旨で、`styles.ts` 内に集約した意匠固有 max-width は対象外。padding 側は `--container-padding` 相当のレスポンシブ utility を用いる）。理由は ADR には起こさず本注記で確定（トークン化対象でない一意の意匠値のため）。`rounded-[7px]` は既存 `DISPLAY_SEGMENTED_BTN` に先例があり別途の正当化は不要。

#### P15 ExportForm（`index.tsx` / `Page.tsx`）
- `Page.tsx`: `<main>` にモック `.main`（`mx-auto w-full max-w-[720px]` + レスポンシブ padding）を適用。見出しは **既存実装の見出しレベルを維持**する（S-003 確定）: 実装 `ExportForm` の見出しは `<section>` 内の `<h2>`（`noteId === null ? "エクスポート（一括）" : "エクスポート"`）で、`<main>` 直下に page-title 用の `<h1>` は無い。AppShell 化（#502）は別 Issue のため `<h1>` を新設せず、**既存の `<h2>` に `PAGE_TITLE` 相当の意匠だけを当てる**（見出しレベルは変えない。テスト/a11y の見出し構造を不変に保つ）。
- **page-subtitle（S-002 確定）**: モックに既に存在する subtitle のみを忠実に転記する（新規文言は足さない）。P15 モック L671-674 の subtitle、P16 モック L780「過去のエクスポート履歴と進行中のジョブを確認できます。ダウンロードリンクは 7 日間有効です。」をそのまま転記する。スコープ節の「文言追加回避」は**新規文言の創作を禁じる**意味であり、モックに既存の subtitle の転記はこれと矛盾しない（実装に無い唯一の許容コピー）。P16 subtitle の「7 日間有効」は実装の期限ロジック（`expiresAt`）と整合する内容で機能を増やさない。
- **P15 subtitle の転記範囲（S-001 確定・一線）**: P15 subtitle（モック L671-674）は単行プレーンでなく、文中に `<code style="font-family: var(--font-mono)">エクスポートジョブ一覧</code>` を埋め込んだ複数文の説明（「…完了後に〔エクスポートジョブ一覧〕からダウンロードできます。」）。P16 subtitle（L780）が 1 行プレーンなのと非対称。転記の一線は次で確定する: **(a) 文言はそのまま転記し、`<code>` 装飾も mono インラインピル（`font-mono` 等の文字装飾）として再現してよい。ただし (b) `<code>` 内「エクスポートジョブ一覧」を一覧ルートへ `<Link>`/`<a>` でリンク化しない**。リンク化は実装に無い導線追加=スコープ外（機能追加）になるため、装飾（mono インライン）に留めリンクにはしない。これにより実装者が subtitle 再現で導線を足す誤りを防ぐ。
- `index.tsx`:
  - セクション見出し（形式 / 用紙サイズ / オプション）に `.section`/`.section-label` 意匠（uppercase・tracking・ink-secondary）。
  - **形式ラジオ**（html/markdown/pdf）: モックの `.segmented` 白カード意匠へ。`role="radiogroup"` / radio input を視覚的に隠して各 `<label>` を segmented ボタン化、選択は `data-active`（`format === v || undefined`）で表現。a11y のためネイティブ radio は `sr-only` で残す。
  - **PDF 用紙サイズ**（A4/Letter, `format === "pdf"` 時のみ）: 同じ segmented 意匠（max-width 280px）。
  - **チェックボックス**（FrontMatter / メディア埋め込み）: 共通 `checkboxRow` を流用（`.check-row` 意匠とほぼ一致）。`.desc .ttl`/`.sub` の 2 段組はモックにあるが実装は 1 行ラベルのみ → 既存ラベルに `checkboxRow` を当て、`.sub` 説明文は**追加しない**（機能・文言追加回避）。
  - **一括 textarea**（noteId === null 時）: `field`/`fieldLabel`/`FIELD_TEXTAREA`（mono）意匠。`.input-help` は実装に無いので追加しない。
  - **非同期推奨 alert**: 既に `ALERT`/`ALERT_INFO`/... 適用済み。意匠は維持（margin だけ form 文脈に合わせ確認）。
  - **アクション行**: モックの sticky `.form-footer`（上ボーダー・右寄せ・モバイル縦積み）。送信ボタンは `pillBtn`+`pillBtnPrimary`、エラー/成功メッセージは `formError` / 成功は ink-secondary な小文字。実装は「ダウンロード」/「一括エクスポートを開始」の 1 ボタンなので footer は 1 つの primary ボタン中心（モックの「キャンセル」ghost は実装導線が無いため追加しない）。

#### P16 ExportJobsList（`index.tsx`）
- `Page.tsx`: `<main>` にモック `.main`（max-width 1100px）+ `PAGE_TITLE`/`PAGE_SUBTITLE`。既存の Suspense/Skeleton 構造は維持。
- 空状態（`jobs.length === 0`）: `EMPTY_STATE` 意匠へ（現状の素テキストを差し替え）。
- `<ul>`/`<li>`（ExportJobRow）を **job-card** 意匠へ:
  - カード: `border border-hairline rounded-lg p-4 bg-bg`（モバイルカード基準）。`lg:` でモックのデスクトップ表（横並びメタ）に寄せる。**desktop の 7 カラム `grid-template-areas` reflow は採らず、card-list を基準に lg で横並び**にする（ADR-001）。
  - 状態チップ: `STATUS_LABEL` + status dot。色は共通化した `exportStatusTag(status): Tone` を流用（ADR-004 / 上表）。チップ本体は `tagBadge`+`tagTone[exportStatusTag(job.status)]` で描き、`data-status` 多分岐 CSS は持たない。dot は Tone → dot 色の小マッピング（accent/success/warning/error の 4 系統）から引く。`processing` は pulse アニメ（`motion-safe:animate-pulse`）を status 値で個別判定。
  - **count `{processed}/{total}`**: 現状 `index.tsx` L85 は status に関わらず常に `{processed}/{total}` を素 span で描く。この count span は**全 status で維持**し（`COUNT_CELL` 意匠を被せるだけ）、消さない。
  - 進捗バー: 上記 count を**置換せず、別要素として追加**する装飾。`processing` かつ `total>0` のときのみ `.progress`/`.progress-bar` を**追加描画**する（`role="progressbar"` は ExportJobDetail 側既設、一覧では装飾バー）。`width` は `style={{ width: \`${pct}%\` }}`（動的値は arbitrary 不可のため inline style 可、ADR-002）。**count をバーに置換する誤実装をしない**（既存 DOM の count span を消さない。S-002）。
  - メタ: createdAt / expiresAt を `meta-cell` 意匠。expiry の warn/expired バリアントは**実装に残日数判定ロジックが無い**ため、`expiresAt` の有無のみ表示し warn/expired の色分けは**付けない**（ロジック追加回避。期限切れは status=expired チップで表現済み）。
  - 行アクション: download（primary）/ cancel（danger）/ 詳細（Link）。モックは icon-only の `.row-icon-btn`（28px→44px）。**ただしテキストボタンの方がアクセシブルかつ実装の label を保てる**ため、`pillBtn`+`pillBtnSmDense`（+ primary/danger/ghost）でテキスト付き小ピルにする（ADR-003）。既存 label（「ダウンロード」「キャンセル」「詳細」）は維持。
    - **ペア `data-*` 属性必須（S-001）**: `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhostDanger`/`pillBtnGhost` は色をバリアント側（`data-[primary]:`/`data-[danger]:`/`data-[ghost-danger]:`/`data-[ghost]:`）に持つため、要素に `data-primary=""`/`data-danger=""`/`data-ghost-danger=""`/`data-ghost=""` を**必ず**付ける（付け忘れると色が出ない沈黙バグ。ビルド/型/テストで検出されない）。詳細 Link（`<a>`）に当てる場合も同様。

#### P16 ExportJobDetail（`index.tsx`）
- `Page.tsx`: `<main>` + `PAGE_TITLE`。詳細はメタ中心なので max-width はフォーム寄り（~720px）。**見出し文言・レベルは現状維持（S-002）**: `<h1>エクスポートジョブ詳細`（Page.tsx L28）/ `ExportJobNotFound` の `<h1>ジョブが見つかりません`（Page.tsx L18）の文言・レベルを**変更しない**（`PAGE_TITLE` 相当の意匠だけを当てる）。これで 3 画面（フォーム=`<h2>` 維持／一覧=`<h1>エクスポートジョブ` 維持／詳細=`<h1>エクスポートジョブ詳細` 維持）の見出し方針が揃い、レビュー判定が機械的になる。
- `<dl>` を **meta グリッド**意匠へ（モバイル 2 カラム `.job-meta` / デスクトップは dt/dd 横並びの定義リスト）。`dt`=meta-k（uppercase・ink-tertiary）/ `dd`=meta-v。
- 状態チップ・進捗バー（`role="progressbar"` 既設を活かす）・error（`role="alert"`）・fail-summary（error-surface 背景）・failed note ID リスト・action 行（download/cancel）を P16 status バリアント・`ALERT_ERROR` 系・`pillBtn` 系で意匠化。
- `ExportJobNotFound`: `role="alert"` の中立エラー表示に `EMPTY_STATE` もしくは alert 意匠を当てる（中立メッセージの JSX 構造は維持）。
- ポーリング・期限判定ロジックは不変。

## 実装ステップ

内側レイヤーは無改変のため、**共通定数 → 各画面**の順で進める。

### 1. 既存スタイリング規約・流用可能定数の確定（設計固定）
- **対象ファイル:** （読み取りのみ）`app/components/common/styles.ts`, `app/components/layout/styles.ts`, `app/components/note/list/styles.ts`, `app/components/admin/Jobs/index.tsx`
- **変更内容:** 流用する定数（`PAGE_TITLE`/`PAGE_SUBTITLE`/`EMPTY_STATE`/`ROW_ACTIONS`/`FORM_ERROR`/`FIELD*`、`pillBtn*`/`ALERT*`/`tagBadge`/`tagTone`/`radioRow`/`checkboxRow`/`scrollbarHidden`）と、新設が必要な定数（segmented labeled・job-card・status バリアント・progress・row action）を確定する。
- **理由:** 再定義を避け、規約（共通 styles.ts への集約）に沿わせるため。

### 2. `app/components/export/styles.ts` を新設
- **対象ファイル:** `app/components/export/styles.ts`（新規）
- **変更内容:** export 固有の反復ユーティリティ定数を JSDoc 付きで定義:
  - `SEGMENTED` / `SEGMENTED_BTN`（labeled・白カード active = `data-[active]:bg-bg data-[active]:shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]`、`rounded-[7px]`、フル幅 inline-flex。ADR-005）。
  - `JOB_CARD` / `JOB_CARD_HEAD` / `JOB_NAME_TTL` / `JOB_ID`（mono・ink-tertiary）。
  - **status の色は新規 `data-status` バリアントを作らず、共通化した `exportStatusTag(status): Tone`（ADR-004）を流用**。本ステップで `exportStatusTag` を `admin/Jobs/index.tsx`（現状ローカルの非 export 関数 L141）から共通モジュール（`app/components/common/` の status ヘルパ）へ移して export し、admin 側の import を差し替える（横依存・二重定義回避）。
    - **戻り値型 `Tone` も同時に共通化（P-001）**: `Tone`（`"info" | "success" | "warning" | "error"`）は現状 `admin/Jobs/index.tsx` L45 の**ローカル `type Tone`** で、`common/styles.ts` には Tone 型の export が無い（`tagTone` L278-283 は値のみ）。`Tone` 型を `common/styles.ts`（`tagBadge`/`tagTone` と同居）へ `export type Tone = keyof typeof tagTone` として定義・export し、`exportStatusTag`・dot 色 `Record<Tone, string>` マッピングから参照する。admin/Jobs の `type Tone` ローカル宣言（L45）は削除して共通 import に差し替える（`ingestionStatusTag` L109 も同じ `Tone` を返すため、ローカル残置は二重定義になる）。
    - チップは `tagBadge`+`tagTone[exportStatusTag(status)]`。dot は `STATUS_DOT` + Tone → dot 色（accent/success/warning/error の 4 系統）の小マッピングで描く（`processing` の pulse のみ status 値判定）。
  - `PROGRESS` / `PROGRESS_BAR`。
  - `JOB_META` / `META_K` / `META_V`（モバイル 2 カラムグリッド）。
  - `FORMAT_PILL`（mono surface ピル）/ `COUNT_CELL`（mono）。
  - `FAIL_SUMMARY`（error-surface, line-clamp）。
  - `FORM_FOOTER`（sticky 風・上ボーダー・モバイル縦積み）/ `SECTION` / `SECTION_LABEL`（layout に無ければここ）。
  - `EXPORT_MAIN`（中央寄せ・最大幅・レスポンシブ padding。P15=720 / P16=1100 で引数 or 2 定数）。
  - ADR-003 の決定に応じ `ROW_ICON_BTN`（必要なら）。
- **理由:** 反復ユーティリティを 1 箇所に集約し、3 コンポーネントで共有するため（規約準拠）。

### 3. P15 ExportForm のスタイル適用
- **対象ファイル:** `app/components/export/ExportForm/index.tsx`, `ExportForm/Page.tsx`
- **変更内容:** 上記設計のとおり main/タイトル・section-label・segmented（形式/用紙）・checkboxRow・textarea・alert（既設維持）・form-footer・ボタン・メッセージに className を適用。形式・用紙の active は `data-active` 化、ネイティブ radio は `sr-only`。**DOM 構造・state・ハンドラは不変**（label/input の対応関係を壊さない）。
- **理由:** AC-1, AC-2, AC-6, AC-7。

### 4. P16 ExportJobsList のスタイル適用
- **対象ファイル:** `app/components/export/ExportJobsList/index.tsx`, `ExportJobsList/Page.tsx`
- **変更内容:** main/タイトル/subtitle・空状態（EMPTY_STATE）・job-card・status チップ（`tagTone[exportStatusTag(...)]`）・進捗バー・format-pill・count・meta・行アクション（download/cancel/詳細リンク）に className を適用。`STATUS_LABEL` export は維持。**count `{processed}/{total}` は全 status で維持し、進捗バーは `processing`＋`total>0` 時のみ別要素として追加する（count をバーに置換しない。S-002）**。行アクションの `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhost` には**ペア `data-primary=""`/`data-danger=""`/`data-ghost=""` 属性を必ず付与**する（S-001）。
- **理由:** AC-3, AC-5, AC-7。

### 5. P16 ExportJobDetail のスタイル適用
- **対象ファイル:** `app/components/export/ExportJobDetail/index.tsx`, `ExportJobDetail/Page.tsx`
- **変更内容:** main/タイトル・`<dl>` meta グリッド・status チップ・進捗バー（`role="progressbar"` 維持）・error/fail-summary・failed note ID リスト・action 行・「一覧へ戻る」リンク・`ExportJobNotFound` に className を適用。ポーリング/期限判定は不変。**見出し文言・レベル（`<h1>エクスポートジョブ詳細`／`<h1>ジョブが見つかりません`）は現状維持（S-002）**。action 行の `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhost` 等には**ペア `data-primary=""`/`data-danger=""`/`data-ghost=""` 属性を必ず付与**する（S-001）。
- **理由:** AC-4, AC-5。

### 6. segmented `data-active` と status マッピングの方式確定
- **対象ファイル:** ステップ 2 の `styles.ts` と各コンポーネント
- **変更内容:** **方式はステップ 2 で確定済み**（検証止まりにしない）:
  - segmented は `data-active`（`format === v || undefined` で falsy 時に属性を消す）+ `data-[active]:` バリアントのみで active 意匠を当てる。基底に競合する背景色を置かず、上書き順勝負を避ける。
  - status の色は `exportStatusTag(status): Tone` 経由（ADR-004）で固定。チップは `tagTone[...]` 関数マッピング、dot は Tone（4 系統）分岐のため `data-status` 多分岐は持たず、同一プロパティの上書き順リスクは構造的に存在しない。本ステップは「確定した方式どおりに実装されていること」の確認に限る。
- **理由:** AC-2, AC-3, AC-8（data-* 規約・上書き順回避）。

### 7. レスポンシブ（モバイル / デスクトップ）追従の確認
- **対象ファイル:** 全対象 tsx
- **変更内容:** form-footer の縦積み、job-card のモバイルカード ⇄ lg 横並び、meta グリッドの 2 カラム、行アクションのモバイル全幅/タップ床（44px）を `max-sm:`/`lg:` で表現。横スクロール/overflow が出ないこと（#588 overflow=0）を確認。
- **理由:** AC-7, #588 申し送り。

### 8. 検証
- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`（`ExportForm.test.tsx` 緑維持）、`pnpm build`（Tailwind が新規クラスを生成）。可能なら `pnpm dev` でブラウザ目視（manual-test）。
- **理由:** AC-9。

## 設計判断

- **ADR-001**: P16 一覧をデスクトップ table（grid-template-areas reflow）でなく card-list で実装。
- **ADR-002**: 動的な progress `width` は inline `style` で表現（Tailwind arbitrary は静的値のみ）。
- **ADR-003**: 行アクションを icon-only `.row-icon-btn` でなくテキスト付き小ピル（`pillBtnSmDense`）で実装し、既存 label と a11y を保持。
- **ADR-004**: status チップ／dot の色は既存 `exportStatusTag(status): Tone` を共通化して流用（`data-status` 多分岐を採らず二重定義回避。`expired` は `cancelled` と同じ warning）。戻り値型 `Tone` も `common/styles.ts` へ `export type Tone = keyof typeof tagTone` として共通化し admin ローカル宣言を削除。
- **ADR-005**: segmented active の影は `--shadow-xs` トークンを arbitrary 内で参照して合成（`shadow-[var(--shadow-xs),...]`）し、生 rgba ベタ書きを避ける。
詳細は `.issue/509/adr.md` 参照。

## リスクと注意点

- **segmented control の白カード active 影**: モックの `box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)` の第1レイヤーは `tokens.css` の `--shadow-xs`（L118）と**完全一致**する。生 rgba をベタ書きせず、トークン変数を arbitrary 内で参照する `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` の合成で表現する（第1=トークン経由、第2=極薄リングのみ非トークン。ADR-005）。これによりトークン一元管理と忠実再現を両立する。
- **ネイティブ radio/checkbox の a11y 維持**: segmented 化で `<input type=radio>` を `sr-only` にする際、`name`/`checked`/`onChange`/`disabled`/keyboard 操作を壊さない。`<label>` 包みを維持し、フォーカスリングは label 側で `focus-within:` 表現。
- **モック vs 実装の機能差を意匠で埋めない**: モックには実装に無い UI（対象ラジオ 3 択・実行モード選択・推定サイズ・ファイル名規則・フィルターバー・更新/新規ボタン・expiry warn/expired 残日数）が多い。これらを「意匠だけ」と称して描くと機能追加（スコープ外）になる。**実装に存在する DOM にのみ意匠を当てる**ことを厳守。
- **expiry warn/expired バリアント**: 残日数の判定ロジックは実装に無い（一覧）。詳細側は `isExpiredByClock` があるが一覧側は無い。色分けバリアントは付けず、status=expired チップに委ねる（ロジック追加回避）。
- **STATUS_LABEL の export 維持**: `ExportJobDetail` が `../ExportJobsList` から import している。定数の場所・名前を変えない。
- **3 画面の見出し方針を揃える（S-002）**: フォーム=`<h2>`（`エクスポート（一括）`/`エクスポート`）維持、一覧=`<h1>エクスポートジョブ` 維持、詳細=`<h1>エクスポートジョブ詳細`＋`<h1>ジョブが見つかりません` 維持。いずれも文言・見出しレベルを**変更せず** `PAGE_TITLE` 相当の意匠だけを当てる（AppShell 化 #502 は別 Issue）。
- **行アクションのペア `data-*` 属性必須（S-001）**: `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhostDanger`/`pillBtnGhost` は色をバリアント側に持つため、`data-primary=""`/`data-danger=""`/`data-ghost-danger=""`/`data-ghost=""` の付与が必須。落とすと色が出ない沈黙バグ（ビルド/型/テストで検出されない、目視レビュー頼み）。詳細 Link（`<a>`）に当てる場合も同様。
- **count をバーに置換しない（S-002）**: 一覧の `{processed}/{total}` count span（`index.tsx` L85）は全 status で維持し、進捗バーは `processing` 時のみ**別要素として追加**する装飾。既存 count DOM を消してバーに置換する誤実装をしない。
- **`<main>` の二重化**: Page.tsx が `<main>` を持つ。shell 化（#502）は別 Issue なので `<main>` は維持。export ローカルで中央寄せ・最大幅を当てるだけにする。
- **テスト破壊**: `ExportForm.test.tsx` は role/label ベース。segmented 化で role/label が変わると壊れる可能性 → ネイティブ input と label テキストを保持して回避。加えて、同テストの `findMediaCheckbox()`（`__tests__/ExportForm.test.tsx` L77-83）は `input[type="checkbox"]` を**インデックス `item(1)`（2番目 = メディア埋め込み）**で取得する。意匠合わせで checkbox の **DOM 出現順（1番目=FrontMatter → 2番目=メディア埋め込み）を入れ替えると `findMediaCheckbox()` が別 checkbox を掴みテストが壊れる**ため、checkbox の DOM 順序を維持する（`checkboxRow` は class を被せるだけなので順序は不変だが、ラップ要素追加時も順序を崩さない）。
- **ページネーション導線はスコープ外**: `ExportJobsPage` は `offset`/`PAGE_SIZE=20` でページングを loader 側で受ける設計だが、`ExportJobsListView` 自体に「次へ/前へ」導線は無く、モック（P15/P16 デスクトップ・モバイル）にもページャ UI は無い。実装に未導入の UI のため**対象外**（offset は loader が処理）。レビュー時に「ページャ未対応」を欠落と誤指摘しないよう注記する。

## テスト方針

- `pnpm typecheck`（型）/ `pnpm lint:fix` / `pnpm format`（Biome）。
- `pnpm test`（既存 `ExportForm.test.tsx` が緑）。role/aria-label/checked 等が維持されていることで担保。
- `pnpm build` で Tailwind JIT が新規ユーティリティを生成すること（styles.ts のリテラルがスキャンされる）。
- 可能なら `pnpm dev` 起動 + ブラウザ目視（manual-test スキル）で P15/P16 デスクトップ・モバイル両幅の意匠とモックの一致、overflow=0、状態バリアント（各 status・PDF 用紙サイズ表示・一括 textarea・alert）を確認。

## レビュー履歴

### 1周目

**修正した点**:
- **[arch-risk P-001 / coverage S-001]** AC-3「6 status すべてにバリアント」とモック dot 定義（5分類・`expired` 無し）の矛盾を解消。DTO status 6 値 → Tone（表示バリアント）の対応表を AC 直下に新設し、AC-3 文言を「いずれかの状態バリアントにマップ」に修正。マッピングは admin Jobs で既に動く `exportStatusTag(status): Tone`（同一 6 status、grep で実定義を確認）を**正**として転記し、`expired` は `cancelled` と同じ `warning` に確定。ADR-004 を新設。
- **[arch-risk P-002 / coverage S-002]** status チップの `data-status` 6 分岐 CSS 上書き順リスクを解消。`exportStatusTag` を共通モジュールへ括り出して流用し、チップは `tagBadge`+`tagTone[exportStatusTag(status)]`（既存パターン、grep で確認）、dot は Tone（4 系統）分岐とする方式をステップ 2 / 6 に**確定記載**（「検証」から「方式の事前確定」へ格上げ）。`data-status` 多分岐自体を廃した。

**取り込んだ改善提案**:
- **[S-001]** segmented active 影を、第1レイヤーが `--shadow-xs` トークンと一致する事実（grep 確認）に基づき `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(...)]` のトークン合成に変更。生 rgba ベタ書きを廃止。ADR-005 を新設し plan の risk 注記・ステップ 2 に反映。
- **[S-003]** `max-w-[720px]`/`[1100px]` のリテラル px について、tokens.css に該当 container トークンが無い（`--container-max: 1280px` のみ）ことを確認し、`APP_MAIN` 流用不可・意匠固有値ゆえ arbitrary 許容と #588 制約との関係を共通方針節に明記。
- **[S-004 arch]** checkbox の DOM 出現順が `ExportForm.test.tsx` の `findMediaCheckbox()`（`item(1)` 前提、実コード L77-83 で確認）に依存することを「テスト破壊」注記に明示追加。
- **[coverage S-002]** page-subtitle の追加が「文言追加回避」と矛盾して見える点を解消。モックに既存の subtitle のみ忠実転記（新規文言は足さない）ことを明文化し、P15/P16 の実 subtitle 文言を転記対象として記載。
- **[coverage S-003]** ExportForm の見出しレベルを一意確定。既存 `<h2>` を維持し（`<h1>` 新設しない・AppShell 化 #502 は別 Issue）、page-title 相当の意匠だけを当てる方針を明記。
- **[coverage S-004]** ページネーション導線がモック・実装双方に無い（offset は loader 処理）＝対象外であることを risk 注記に追加。

**見送った提案とその理由**:
- なし（全提案を取り込み）。

### 2周目

**修正した点**:
- **[arch-risk P-001]** ADR-004 の `exportStatusTag` 共通化に伴う戻り値型 `Tone` の移動が計画に欠落していた点を解消。`Tone`（`admin/Jobs/index.tsx` L45 のローカル `type Tone`）を `common/styles.ts`（`tagBadge`/`tagTone` と同居）へ `export type Tone = keyof typeof tagTone` として定義・export し、`exportStatusTag`・dot 色 `Record<Tone, string>` マッピングから参照、admin/Jobs のローカル宣言は削除して共通 import に差し替える旨をステップ2・ADR-004・設計判断サマリーに追記（`ingestionStatusTag` L109 も同 `Tone` を返すため二重定義回避）。

**取り込んだ改善提案**:
- **[arch-risk S-001]** 行アクションの `pillBtnPrimary`/`pillBtnDanger`/`pillBtnGhostDanger`/`pillBtnGhost` は色をバリアント側（`data-[primary]:` 等）に持つため、ペア属性 `data-primary=""`/`data-danger=""`/`data-ghost-danger=""`/`data-ghost=""` の付与が必須（落とすと色が出ない沈黙バグ）である旨を P16 設計節・ステップ4/5・risk 節・ADR-003 に明記。
- **[arch-risk S-002]** 一覧の `{processed}/{total}` count（`index.tsx` L85）は全 status で維持し、進捗バーは `processing`＋`total>0` 時のみ別要素として追加する装飾（count をバーに置換しない）という棲み分けを設計節・ステップ4・risk 節に明記。
- **[arch-risk S-003]** ADR-001〜005 の `Status: Proposed` を `Accepted` に更新。
- **[coverage S-001]** P15 subtitle（モック L671-674、埋め込み `<code>` を含む複数文）の転記範囲を確定。文言＋`<code>` の mono インライン装飾は再現してよいが、`<code>`「エクスポートジョブ一覧」を一覧ルートへリンク化しない（導線追加=スコープ外）一線を design 節に明記。
- **[coverage S-002]** ExportJobDetail 側の見出し文言（`<h1>エクスポートジョブ詳細`／`<h1>ジョブが見つかりません`）の現状維持を design 節・ステップ5・risk 節に明記し、3 画面（フォーム `<h2>`／一覧 `<h1>`／詳細 `<h1>`）の見出し方針を揃えた。

**見送った提案とその理由**:
- なし（全提案を取り込み）。
