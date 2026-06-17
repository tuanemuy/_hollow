# Plan Review — Issue #754（Round 2 / 視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/754/plan.md` / `.issue/754/adr.md`
前周: `.issue/754/plan-review/round-1-arch-risk.md`（P-001〜P-004 / S-001〜S-006）

---

## 総評

Round 1 の指摘はすべて plan / adr に反映済みであることを実コードで確認した。

- **P-001（happy-dom）**: plan の Step 3 注意・Step 5/6・リスク節・テスト方針、adr.md ADR-001 Consequences のすべてが「happy-dom（既定 `node`、本ファイルのみオプトイン）」に統一され、`window.matchMedia` 未評価で両 UI が DOM 共存する論旨も正確。実ファイル `FilterBar.test.tsx:1` の `// @vitest-environment happy-dom` と一致。
- **P-002（ネスト Dialog）**: plan Step 3 注意点に検証手順（フォーカストラップ入れ子 / 2 つの document-level ESC / z-index / スクロールロック）と代替案（(a) 一旦閉じて開く / (b) シート内は適用中チップ+解除のみ）が明記され、adr.md にも「ネスト Dialog の扱い」節が追加された。
- **P-003（テストヘルパー曖昧化）**: Step 6 で `buttonByText`/`tagButton` のクエリ起点をデスクトップラッパ（`data-desktop-filters`）に限定する「確定タスク」化、モバイル UI は `data-mobile-filter`/`data-filter-sheet` スコープ限定が記載。実ファイルの `tagButton`（`button[aria-pressed]` 全件走査, test 94-104）/ `buttonByText`（全 `button` 走査, 150-157）が `container` 起点であることを確認、対策は妥当。
- **P-004（件数の二重定義回避）**: Step 1 / AC-6 で「`optimistic` 入力の単一純粋関数に集約し `hasAnyFilter = count > 0` で一本化」「`hasAnyHomeFilter`（search 入力）とは入力が違うため流用しない」と明記。実コード `hasAnyFilter`（FilterBar.tsx:297-302、`optimistic` 由来）と整合。
- 共通化方針（S-002）/ シート内 a11y ロール（S-003: `fieldset`+ラジオ群、別系統ロール）/ `scrollbarHidden` import 削除（S-004）/ dangling 縦並び（S-005）/ `aria-busy` 引き継ぎ（S-006）/ デスクトップ機械的検証（S-001）もすべて該当ステップ・ADR に取り込まれている。

実コード照合の結果、ADR-001 の前提（`Dialog` が `max-sm` でボトムシート化・フォーカストラップ・ESC・スクロールロック・トリガー復帰・`showCloseButton`/`closable` 完備）も `Dialog.tsx` で実在を確認。`run()`/各ハンドラが引数完結でシートから呼べる前提も `FilterBar.tsx` の実装と整合。計画は実現可能で、アーキ規約（utility-first / `max-sm:` 静的 variant / 文字列ホイスト / 既存 primitive 再利用）に沿っている。

残課題は軽微。要修正レベルの新規問題はゼロ。下記は精度向上のための改善提案。

---

## 問題点（要修正）

問題点ゼロ。

---

## 改善提案（検討推奨）

- **[S-001]** P-002 の「ネスト Dialog の ESC 挙動」記述を実コードに即して訂正しておくと、検証時の見立てが正確になる。
  - 理由: plan Step 3（FilterBar.tsx:125 言及）と adr.md は「ESC 1回で最後に登録されたリスナ＝NotePicker 側が閉じるか、両方閉じるか登録順序依存」と書いているが、実コードを精査すると **`Dialog.tsx:256` は `event.stopPropagation()` であって `stopImmediatePropagation()` ではない**。`stopPropagation` は同一ターゲット（ここでは両 Dialog とも `document` に直付け）に登録された他リスナの発火を止めない。したがってネスト時は ESC 1 回で **両方の document-level keydown ハンドラが必ず発火し、両 Dialog が同時に閉じる**（登録順序に依存しない確定挙動）。「登録順序依存」という見立ては不正確で、検証で迷う原因になりうる。
  - 提案: plan / adr の当該記述を「`stopPropagation` は同一 `document` 上の兄弟リスナを止めないため、ネスト時は ESC で両シートが同時に閉じる（NotePicker だけを閉じたいなら代替案 (a)/(b) が必要）」と修正する。これは代替案 (a)（一旦閉じて開く = 同時表示しない）を採るべき根拠を一段強める。ネスト許容（同時表示）は ESC で親子同時クローズになるため、代替案 (a) または (b) を採る方向が実質的に確定に近いことを ADR に明記すると Step 3 の手戻りが減る。

- **[S-002]** 代替案 (a)「シートを一旦閉じてから NotePicker を開く」を採る場合のフォーカス復帰の連鎖を Step 6 のテスト対象に具体化しておく。
  - 理由: `Dialog` の復帰フォーカスは `previousActiveRef`（`Dialog.tsx:214-226`）にマウント時の `document.activeElement` を保存して閉時に復帰する。代替案 (a) では「シートを閉じる→NotePicker を開く」順にマウント遷移が起きるため、NotePicker マウント時点の `activeElement` が何か（シートのトリガー？シート内の参照ボタン？閉処理途中の `<body>`？）で、NotePicker クローズ後の復帰先が変わる。フォーカスが `<body>` に落ちると AC-5 の「トリガーへのフォーカス復帰」が崩れる。
  - 提案: 代替案 (a) を採るなら、シートを閉じる前に「再オープン時に戻したいトリガー」を保持しておく（NotePicker に `initialFocusRef` 相当でなく、閉時復帰先を意図した要素に向ける）設計を Step 3 で確定し、Step 6 で「NotePicker 閉→（再オープン可能な）フィルタトリガーへ復帰」を固定する。代替案 (b)（シート内は適用中チップ+解除のみ・新規選択は別動線）ならこの連鎖自体が発生せず最も堅い——plan が既に (b) を有力候補として併記している点は妥当。

- **[S-003]** モバイルトリガーの「絞り込み」ボタンに `aria-pressed` 由来の属性を**付けない**ことを Step 3/6 の明示制約にする。
  - 理由: P-003 の対策はラッパスコープ限定で十分だが、`tagButton` ヘルパーは `button[aria-pressed]` 全件走査（test 99）。万一トリガーや件数バッジ実装で `aria-pressed`/`aria-checked` を持つボタンを増やすと、デスクトップラッパ限定に絞る前段でセレクタが拾う母集合が変わる。スコープ限定（`data-desktop-filters` 配下）が入れば解決するが、トリガー側で `aria-pressed` を使わない（トリガーは `aria-haspopup="dialog"`+`aria-expanded` で表現、plan 通り）ことを制約として固定しておくと、スコープ限定の実装漏れがあっても二重に安全。
  - 提案: Step 3 に「モバイルトリガー/件数バッジは `aria-pressed`/`aria-checked` を持たない（`aria-haspopup`+`aria-expanded` のみ）」を一文追加。

- **[S-004]** `clearAll` がモバイルトリガーバーのクリア× から呼ばれた際、開いているシートを閉じる挙動を定義しておく。
  - 理由: plan はモバイルトリガーバーに「`hasAnyFilter` 時の全クリア×（既存 `clearAll` 再利用）」を置く。ただしこの× はシート**外**（トリガーバー）にあり、シートが開いている状態では押せない（背後）。一方、シート**内**にもクリア導線を置くなら（デスクトップの clear× 相当）、シート内クリアで `hasAnyFilter` が false になった後にシートを開いたままにするか自動で閉じるかは UX 判断。`clearAll` 自体は `run()` 経由でナビゲートするだけでシート state（`filterSheetOpen`）に触れないため、シート内クリア後の `filterSheetOpen` の扱いを決めておかないと「全クリア後も空のシートが残る」になりうる。
  - 提案: Step 3 で「シート内クリア導線の有無」と「クリア後に `filterSheetOpen` を維持/クローズするか」を明記。トリガーバーの× はシートが閉じている時のみ表示される前提（背後で押せない）も一文添える。

- **[S-005]** `useOptimistic` の baseline スナップバックとシート開閉の相互作用が無害であることを一言確認しておく。
  - 理由: フィルタ操作のたびに `run()` がナビゲートし、コミットで fresh props → `useOptimistic` が baseline へスナップ（FilterBar.tsx:154-162 のコメント）。シートを開いたまま複数フィルタを連続操作する想定では、各ナビゲーションで `FilterBar` が再レンダーされるが `filterSheetOpen`（`useState`）はローカル state なので保持される（props 由来でない）ため問題は起きない見込み。これは現行の `pickerOpen`/`showAllTags`/`openPopover` が同様にローカル state で保持される実装と同型で、リスクは低い。
  - 提案: リスク節に「シート開閉 state はローカル `useState` でナビゲーション再レンダーをまたいで保持される（`pickerOpen` と同型）ため、連続フィルタ操作中もシートは閉じない」と一文。実装者が不要な `useEffect` 同期を入れないためのガード。

---

## 良い点

- Round 1 指摘（P-001〜P-004 / S-001〜S-006）が漏れなく plan / adr に反映され、レビュー履歴節で各指摘の対応箇所が追跡可能になっている。事実誤認（jsdom→happy-dom）の訂正、二重定義回避の根拠（optimistic vs search の入力差）の言語化が特に的確。
- ADR-001 / ADR-002 が選択肢（A〜E / モック逸脱）とトレードオフを明示し、CLAUDE.md の「既存 primitive を再利用・新規発明しない」「モック（`spec/design/`）SSOT からの逸脱は ADR で追跡・spec 同期は別 Issue」方針に整合。
- デスクトップ不変（AC-4）を「既存 JSX 温存 + ラッパに `max-sm:hidden` のみ」「共通化は内側プレゼンテーション部分に限定し外側 DOM 不変」「機械的 DOM 検証を Step 6 に追加」と多層で担保しており、実コード（`DatePopover`/`VisibilityPopover` がトリガー+シェル+内側一体）に照らして現実的。
- シート内 a11y を `Dialog` primitive 任せにしつつ、デスクトップの `role="menu"+menuitemradio`/`role="listbox"` を `Dialog` 配下に入れ子にしない（`fieldset`+ラジオ群へ置換）判断が APG 的に正しく、実コードの `VisibilityPopover`/`TagPickerPopover` のロール構造を壊さない方向に確定している。
