# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #509）

レビュー視点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**
対象: `.issue/509/plan.md` / `.issue/509/adr.md`

---

#### 問題点（要修正）

- **[P-001]** AC-3 の「6 つの status 値すべてに状態バリアントが付く」がモックの定義範囲と矛盾する
  - 理由: モック `P16-export-jobs.html` の `.status` CSS（L556-570）は `running` / `done` / `failed` / `queued` / `cancelled` の **5 分類**しか dot 色を定義しておらず、`expired` 専用の dot 色は存在しない。一方 DTO の `status` は 6 値（`pending`/`processing`/`completed`/`failed`/`cancelled`/`expired`）。AC-3 が「6 値すべてにバリアント」と言い切ると、モックに無い `expired` の dot 色を新規に決め打ちすることになり、「モックを正とする」という計画の前提（plan L74）と衝突する。`STATUS_LABEL` も `pending`+`processing` を別ラベルにしているが、モックの dot は `queued`(=pending) / `running`(=processing) に対応するため、DTO→mock 分類のマッピングが 1:1 ではない。
  - 提案: ステップ 2 で「DTO status → mock status 分類（dot 色 + text 色）」のマッピングを**明示的に 1 関数で定義**する（後述 S-002 の `exportStatusTag` 流用と統合可能）。`expired` の扱い（mock に無いので `cancelled` 相当の ink-tertiary dot に寄せる等）を ADR で確定し、AC-3 の文言を「6 status すべてが**いずれかの**状態バリアントにマップされる」に修正する。

- **[P-002]** 計画が掲げる「`data-status` バリアント方式」の生成 CSS 上書き順リスクへの言及が status チップに対して欠けている
  - 理由: plan L97 は `data-status={job.status}` + `data-[status=processing]:` で「dot 色 / text 色を切替」とする。common/styles.ts の ADR-003（同一プロパティは生成 CSS 順で決まる）に従えば、`data-[status=...]:text-*` / `bg-*` は基底に色指定が無ければ問題ないが、**基底にデフォルト色（例: dot の `bg-ink-tertiary`）を置いて variant で上書きする構成にすると、同一プロパティ（background）の上書きが variant 同士 or 基底との順序勝負になる**。plan L150（ステップ 6）で「必要なら variant 化」と曖昧に流しており、segmented の `data-active` と違い status は「無印デフォルト + 6 分岐」という多分岐のため、上書きが効かないケースが出やすい。
  - 提案: dot/text とも「基底に色を置かず variant 側だけで全 status の色を網羅する」方式に倒すか、`tagBadge`+`tagTone[...]`（関数マッピング、S-002）を採用して `data-status` 多分岐自体を避ける。どちらにするかをステップ 2 で確定し、ステップ 6 を「検証」ではなく「方式の事前確定」に格上げする。

---

#### 改善提案（検討推奨）

- **[S-001]** segmented active の影は `--shadow-xs` トークン + 残りの ring レイヤーの合成で表現できないか検討する
  - 理由: モックの `box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)`（P15 L506）の第1レイヤーは `tokens.css` の `--shadow-xs: 0 1px 2px rgba(0,0,0,0.04)`（L118）と**完全一致**する。plan L172・ADR は「トークンに無い影なので arbitrary で忠実に出す／`--shadow-*` とは別物」と断じているが、第1レイヤーはトークンそのものである。第2レイヤー（`0 0 0 0.5px` の極薄リング）だけが非トークン。CLAUDE.md のトークン経由ルールの趣旨（影をトークンで一元管理）に照らすと、`shadow-xs` を基底に置き第2レイヤーを arbitrary で重ねる方が望ましい。
  - 補足: ただし Tailwind の `shadow-*` と arbitrary `shadow-[...]` の合成は単純には積めない（後勝ちで上書きされる）ため、技術的に1ユーティリティで2レイヤーを表現するには結局 `shadow-[var(--shadow-xs),0_0_0_0.5px_...]` のような arbitrary 合成になる。**「トークン変数を arbitrary 内で参照する」形（`shadow-[var(--shadow-xs),...]`）**にすれば、トークン一元管理と忠実再現を両立できる。ADR-002 系の判断に1行追記して、生 rgba のベタ書きを避けることを推奨。

- **[S-002]** status の dot/text 色マッピングは既存 `exportStatusTag(status): Tone` の流用を第一候補にする
  - 理由: `app/components/admin/Jobs/index.tsx` に **6 つの export status を Tone（info/success/warning/error）へ写す `exportStatusTag` が既に存在**し、`tagBadge`+`tagTone[exportStatusTag(job.status)]` で status チップを描く先例が動いている（同一ドメインの status 値）。plan L47 はこれを「先例」と挙げるだけで、export/styles.ts では `data-status` 独自バリアントを新設する方針（plan L122-123）。dot（円）はチップに無い要素なので data-status 自体は必要だが、**色マッピングのロジックを二重に持つ**のは DRY 違反でありメンテ時にズレる。`exportStatusTag` を export ドメイン共通の純関数として括り出し（または import して）、チップ tone と dot 色の両方を同一マッピングから導くと整合する。

- **[S-003]** `EXPORT_MAIN`（max-width 720/1100）と `--container-max`(1280) / `APP_MAIN` の関係を明記する
  - 理由: plan L79 は P15=720 / P16=1100 の max-width を export ローカルで持つとする。既存 `APP_MAIN`（layout/styles.ts L120）は `max-w-[var(--container-max)]`(1280) で、`#502` の shell 化は本 Issue 対象外。720/1100 はモック準拠の固有値だが、`max-w-[720px]` / `max-w-[1100px]` という**新規リテラル px の持ち込み**になる。#588 の「リテラル px 新規持ち込み回避」制約との関係を ADR で一言整理しておくと、レビュー時の指摘を先回りできる（720/1100 はトークン化されていない意匠固有値であり、`max-w-[...]` arbitrary は許容範囲、という判断を明示）。`rounded-[7px]` は既存 `DISPLAY_SEGMENTED_BTN` に先例があるので別途の正当化は不要。

- **[S-004]** `ExportForm` の checkbox 2 個の DOM 順序がテスト前提であることを明記する
  - 理由: `ExportForm.test.tsx` の `findMediaCheckbox()` は `input[type="checkbox"]` を**インデックス item(1)（2番目）**で取得する。plan は checkbox を sr-only にせず `checkboxRow` 流用とするため安全だが、もし意匠合わせで FrontMatter / メディア埋め込みの **DOM 順序を入れ替える**と `findMediaCheckbox()` が別の checkbox を掴みテストが壊れる。ステップ 3 のリスク注記に「checkbox の DOM 出現順（FrontMatter→メディアの順）を維持」を1行追加すると、回帰を確実に防げる。

---

#### 良い点

- **segmented 化での radio sr-only と test 非破壊の整合が正確**: `ExportForm.test.tsx` は textarea・`input[type=checkbox]`・`[role="note"]` バナー・「一括エクスポートを開始」ボタンの可視テキストに依存しており、**radio には一切触れていない**。plan が「radio のみ sr-only、checkbox は `checkboxRow` 流用、可視ラベル/role 維持」と切り分けている（plan L85-87, L173, L178）のは、テストの依存対象を正確に避けており妥当。a11y も `<label>` 包み維持 + `focus-within:` で破綻しない。

- **ADR-002（動的 progress 幅の inline style）の判断が CLAUDE.md と矛盾しない**: Tailwind JIT が静的リテラルのみ走査する制約（`w-[${pct}%]` は生成されない）を正しく把握し、幅だけ inline style に逃がす判断は妥当。CLAUDE.md の utility-first 原則は「ハンドコード CSS / @apply 禁止」であってデータ駆動の単一プロパティ inline style を禁じていない、という解釈も正しい。WHY コメント最小添付の方針も規約準拠。

- **ADR-001（card-list 採用、table grid-areas reflow を採らない）が「スタイリングのみ」スコープと整合**: 実装が `<ul><li>` であり `<table>` 化は DOM 構造変更（スコープ外）になるという判断は正確。admin Jobs の table reflow 先例が `<table>` 都合であることも正しく区別できている。`grid-template-areas` の arbitrary 移植を避けることで lightningcss 制約にも触れない。

- **ADR-003（icon-only でなくテキスト付き小ピル）が既存 a11y と共通定数流用の両立**: 実装が可視テキストラベルで a11y を担保している事実、`pillBtn` が anchor（`Link`）対応済みである事実、モバイルモックがフル幅テキストボタンである事実を正しく踏まえ、`pillBtnSmDense` 流用で新規 `ROW_ICON_BTN` を増やさない判断は規約（共通 styles.ts への集約・再定義回避）に沿う。

- **「モック vs 実装の機能差を意匠で埋めない」リスク管理が明確**: モックにある対象ラジオ3択・実行モード・推定サイズ・ファイル名規則・フィルターバー・expiry 残日数等を「実装に無いので描かない」と繰り返し釘を刺しており（plan L57, L99, L174-175, スコープ節）、スタイリング限定スコープを機能追加に膨らませない統制が効いている。expiry warn/expired の残日数ロジックが一覧側に無いことを実コードまで確認した上で「色分けせず status=expired チップに委ねる」とした判断も正確。

- **`STATUS_LABEL` の export 維持・`<main>` 二重化回避（#502 別 Issue）への配慮**: `ExportJobDetail` が `../ExportJobsList` から `STATUS_LABEL` を import している依存を実コードで確認した上で「定数の場所・名前を変えない」とし、shell 化を本 Issue 外と切っている点は依存・スコープ管理として適切。
