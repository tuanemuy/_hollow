# Round 1 レビュー — Issue #509 計画（視点: 要件カバレッジ・スコープ整合性）

対象: `.issue/509/plan.md` / `.issue/509/adr.md`
レビュー視点: Issue 本文・コメント・#500 フォローアップで合意された要件が受け入れ基準にすべて落ちているか、各基準が検証可能か、基準↔ステップの紐づけが正しいか、スコープ外作業が紛れ込んでいないか。

実装・モック・#500 成果物を実際に突き合わせて検証した（`app/components/export/{ExportForm,ExportJobsList,ExportJobDetail}/`、`spec/design/pages/{P15-export,P16-export-jobs}.html` とモバイル同名、`.issue/500/diffs/*`・`followups.md`・`decisions-pending.md`）。

---

## 結論サマリー

Issue の 3 つの受け入れ条件（P15/P16 のモック準拠スタイル / 既存規約準拠 / #500 フォローアップ解消）はすべて AC に展開されており、デスクトップ・モバイル両モック追従（AC-7）と #588 申し送りもカバーされている。スコープ外（モーダル化・別ルート→同一ページ化・機能追加・ロジック変更）は明示的に除外され、`decisions-pending.md` の論点（モーダル vs ページ / 別ルート vs 同一ページ）と矛盾しない方向（＝実装構造維持）で確定している。計画の精度は高い。

**要修正の P 級問題はゼロ。** 検討推奨の改善提案を 4 点記す。

---

## 検証できた事実（計画の前提が正しいこと）

- 実装 3 コンポーネントは className を一切持たない素の HTML である（`ExportForm/index.tsx`・`ExportJobsList/index.tsx`・`ExportJobDetail/index.tsx` を確認）。計画の「ロジックは完成・className を被せるだけ」は正しい。
- `STATUS_LABEL` は 6 値（pending/processing/completed/failed/cancelled/expired）で `ExportJobsList/index.tsx` に定義、`ExportJobDetail` が import 済み。計画の「export 維持」前提は正しい。
- 流用元定数は実在する: `pillBtn*`/`pillBtnSmDense`/`ALERT*`/`tagBadge`/`tagTone`/`radioRow`/`checkboxRow`/`field*`/`scrollbarHidden`/`formError`（common/styles.ts）、`PAGE_TITLE`/`PAGE_SUBTITLE`/`EMPTY_STATE`/`ROW_ACTIONS`/`FORM_ERROR`/`FIELD*`（layout/styles.ts）、`DISPLAY_SEGMENTED`/`DISPLAY_SEGMENTED_BTN`（note/list/styles.ts、icon-only 先例）。
- モック構造の記述は正確: P15 `.segmented` の active 影 `0 1px 2px rgba(...)` + `border-radius: 7px`、sticky `.form-footer`（モバイル `column-reverse` 縦積み）、P16 desktop の 7 カラム `grid-template-columns: minmax(200px,2fr) 110px 70px 150px 120px 120px auto`（`min-width: 820px`）と `grid-template-areas` reflow、mobile の `.job-card`/`.job-meta`/`.job-actions`。ADR-001/002/003 の context はモック実態と一致。
- ExportForm は単一=「ダウンロード」/一括=ID textarea + 非同期推奨 alert（既に `ALERT` 系適用済み）で、モックの対象ラジオ 3 択・推定サイズ・ファイル名規則・実行モード選択は実装に存在しない。計画の「不存在機能は描かない」判断は #500 diff（P15.md B 節・C 節）と整合。

---

## 問題点（要修正）

問題点ゼロ。

Issue の受け入れ条件・#500 フォローアップ・#588 申し送り・`decisions-pending.md` の論点はすべて AC に反映され、各 AC は検証可能（クラス生成 / data-* 制御 / 6 status バリアント / build・typecheck・test 緑）な形で書かれ、AC↔ステップの紐づけ（AC-1→3,6 / AC-3→4,7 等）も実装内容と一致している。スコープ外作業の混入も確認されない。

---

## 改善提案（検討推奨）

- **[S-001] AC-3 の「6 status 値すべてに状態バリアントが付く」の検証可能性をもう一段具体化すると良い**
  - 理由: 計画は dot 色を accent/success/error/ink-tertiary の 4 系統に集約する想定（design 節 L97）だが、6 値→4 系統の対応表（pending=待機/ink-tertiary?, processing=accent+pulse, completed=success, failed=error, cancelled=?, expired=?）が AC にも design 節にも明示されていない。「6 値すべてにバリアント」を緑判定するには各値の到達色が一意に決まっている必要がある。ADR か design 節に 6→色のマッピング表を 1 つ置くと、レビュー時に「cancelled と expired の色が同じで良いか」等の判断が機械的になる。

- **[S-002] page-subtitle の追加が「新規コピー文言を追加しない」方針と表面的に矛盾して見える点を AC 側でも明文化したい**
  - 理由: P15 モック（L671）・P16 モック（L780「過去のエクスポート履歴と進行中のジョブを確認できます。ダウンロードリンクは 7 日間有効です。」）はいずれも page-subtitle を持つ。実装の `ExportForm` には subtitle が無く、`ExportJobsPage` は `<h1>エクスポートジョブ</h1>` のみ。計画は design 節 L82 で「新規コピーはモック準拠の subtitle のみ」と例外を切っているが、スコープ節 L32/L174 の「文言追加回避」「機能・文言追加回避」とは粒度が揃っておらず、レビュアーが「subtitle 追加はスコープ違反では」と誤読しうる。AC-1/AC-3 または スコープ節に「page-subtitle はモック文言をそのまま転記してよい（実装にない唯一の許容コピー）」と一文足すと、実装者・レビュアー間の判断が固定される。なお P16 subtitle の「7 日間有効」は実装の期限ロジック（expiresAt）と整合する内容で、機能を増やすものではないため転記して問題ない。

- **[S-003] ExportJobsPage の既存 `<h1>` 文言「エクスポートジョブ」と P15/P16 モック見出しの一致確認を AC か注意点に**
  - 理由: P16 モック見出しは「エクスポートジョブ」（L779）で実装 `<h1>` と一致するが、P15 モック見出しは「エクスポート」（L670）。実装 `ExportForm` の見出しは `noteId === null ? "エクスポート（一括）" : "エクスポート"`（index.tsx L170）で `<h2>` 相当。計画は design 節 L82 で「`<h1>`→`<h2>` 現状維持しつつ見出し意匠を当てる」と触れているが、`ExportFormPage` の `<main>` 直下に page-title 用の `<h1>` が無い（見出しは `<section>` 内 `<h2>`）点と、モックが page-title を `<h1>` で持つ点の段差をどう埋めるか（既存 `<h2>` に PAGE_TITLE 意匠を当てるのか、`<h1>` を新設するのか）が一意でない。DOM 構造維持（`<h1>` 新設しない）を選ぶなら AC-6 注釈か注意点に明記すると、見出しレベルの揺れによるテスト/アクセシビリティ差異を防げる。

- **[S-004] ExportJobsList のページネーション導線がモック・計画のどちらにも現れない点の確認**
  - 理由: `ExportJobsPage` は `offset`/`PAGE_SIZE=20` でページングを受け取る設計（Page.tsx）だが、現状の `ExportJobsListView` 自体に「次へ/前へ」導線は無く、計画にもページネーション意匠への言及が無い。これは「実装に無い UI を足さない」方針として正しい（＝スコープ外で正解）。ただし P16 デスクトップモックにページャがあるか未確認のまま進めると、レビュー時に「ページャ未対応」を欠落と誤指摘されうる。計画の注意点に「ページネーション UI は実装に未導入のため対象外（offset は loader が処理）」と一行残すと、カバレッジ判断が明確になる。

---

## 良い点

- Issue の 3 受け入れ条件を AC-1〜AC-9 に分解し、さらに「含まれないもの」を Issue 本文の #502/#401 だけでなく `decisions-pending.md` の P15「モーダル vs ページ」・P16「別ルート vs 同一ページ」論点まで遡って AC-5/AC-6 として固定している。Issue コメントで言及された判断待ち事項と矛盾しない（＝実装構造維持）方向に確定しており、スコープ整合性が高い。
- #588（モバイルモック追従）からの申し送り（P15/P16 のフル視覚実装は #509 で対応、両モック追従で二度手間回避）を AC-7 として明示的に取り込み、デスクトップ／モバイル両モックへの追従を漏らしていない。Issue コメントの合意事項とカバレッジが一致。
- 「モック vs 実装の機能差を意匠で埋めない」をリスク節 L174 で独立して強調し、対象ラジオ 3 択・推定サイズ・ファイル名規則・フィルターバー・更新/新規ボタン・expiry 残日数色分けといった「実装に無い UI」を列挙してスコープ外と宣言している。これにより「意匠だけ」を口実にした機能追加（スコープクリープ）を構造的に防いでいる。
- expiry warn/expired バリアントについて、一覧側に残日数判定ロジックが無い（詳細側のみ `isExpiredByClock` がある）ことを実装と突き合わせて確認し、「色分けは付けず status=expired チップに委ねる」とロジック追加回避を明示。実装の非対称性まで把握できている。
- ADR-001/002/003 がいずれも「モック忠実度 vs 構造維持・a11y・既存定数流用」のトレードオフを明示し、本 Issue のスコープ（スタイリングのみ・DOM 不変）に照らして構造維持側を選んでいる。特に ADR-003 はモバイルモックがテキストフル幅ピル（icon-only ではない）である事実を根拠にしており、デスクトップモック単独に引きずられていない。
- `ExportForm.test.tsx` が role/label ベースであることを前提に、segmented 化で `<input type=radio>` を `sr-only` で残し name/checked/onChange/label テキストを保持する方針を注意点に明記。テスト破壊リスクを実装方針で先回りして潰している（AC-9 と整合）。
