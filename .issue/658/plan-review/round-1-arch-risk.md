# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #658）

レビュー対象: `.issue/658/plan.md` / `.issue/658/adr.md`
確認した資料: CLAUDE.md、`gh issue view 658`、origin/main の `FilterBar.tsx` / `Popover.tsx` / `useRovingMenu.ts` / `ViewSwitcher.tsx` / `spec/design/pages/P10-home.html`（L1105–1110）/ `.issue/626/adr.md` ADR-008

## 総評

純フロントエンド変更として正しくレイヤーを切り分けており（ドメイン/ユースケース/アダプター「なし」の明記は妥当）、設計セクションも「契約（ADR-008 の a11y）→ 既存共通部品（Popover listbox / useRovingMenu / popoverSheetPanel）→ FilterBar への配線」と内側から考えられている。実装ステップの依存方向（共通部品 Popover の prop 追加 → FilterBar トリガー → パネル → テスト）も正しい。origin/main の実コード（`openPopover` union、`toggleTag`、`FILTER_POPOVER_PANEL`、listbox ブランチの mousedown ガード）と照合した限り、計画の前提はすべて実在し、実現可能性は高い。

#### 問題点（要修正）

問題点ゼロ。

（ブロッカーになり得る点 — ブランチ前提、`aria-multiselectable` を Popover 内部に追加する必要性、listbox の mousedown スクロールバーガード、楽観反映の revert — はいずれも計画の「リスクと注意点」で先回りして捕捉済み。）

#### 改善提案（検討推奨）

- **[S-001]** ピッカーで選択したタグがチップ列に見えないケース（VISIBLE_TAG_LIMIT 超のタグ）への言及がない
  - 理由: 現実装は `tags.slice(0, 12)` を選択状態と無関係に表示する。ピッカー導入により「13件目以降のタグを選択する」経路が初めて生まれ、選択中なのに対応チップがバーに現れない（解除には「もっと見る」展開・ピッカー再オープン・クリア × のいずれかが必要）状態が新規に露出する。#626 ADR-008 の並び順「適用中チップ群 → + タグ」の語感とも微妙にずれる。初版で `visibleTags` に選択中タグを必ず含める（または既知の制限として AC/手動テストに明記する）かを計画上で判断しておくとよい。スコープ最小を優先して見送るなら、その判断を ADR-002 に一行追記すれば足りる。
- **[S-002]** マウスクリック後の roving `activeIndex` 不整合を AC-6 のテスト観点に含める
  - 理由: listbox ブランチは option 上の mousedown を preventDefault するためクリックでフォーカスも `activeIndex` も動かない。単一選択の ViewSwitcher は選択即クローズなので露出しないが、本ピッカーは開いたままなので「option N をクリック → ArrowDown」で index 0 付近へ飛ぶ不整合が初めて見える。計画のリスク欄に近い記述はあるが、対処方針（クリック時に `activeIndex` を同期するか、許容するか）を ステップ4/5 に落としておくと実装時の迷いがなくなる。
- **[S-003]** `NotePickerDialog`（内部リンク参照）との相互排他の扱いを明記する
  - 理由: AC-8 は期間/公開状態との排他のみ。`pickerOpen` は `openPopover` union の外にある既存構造なので、ダイアログとタグピッカーは同時に開き得る。既存挙動の踏襲（= 対象外）でよいが、「既存どおり対象外」と一言スコープ外に書いておくとレビュー時の疑問を防げる。

#### 良い点

- 設計がレイヤーの内側から組まれている: ARIA 契約（listbox + multiselectable）を起点に、共通部品（`Popover` への最小 prop 追加）→ 利用側（FilterBar）の順で依存方向どおり。`aria-multiselectable` を caller から無理に注入せず Popover の責務として追加する判断は、listbox role を Popover が描画している実コードと整合する。
- 「既存に合わせるだけ」と「理想形の追求しすぎ」の両方を回避できている: combobox 化・専用ボトムシート・「もっと見る」一本化をすべて ADR で明示的に却下し、フォローアップ Issue への退避先まで書いてある。CLAUDE.md の styling 規約（utility-first、`data-*`、定数ホイスト、共通化は #649 ADR-011 へ委譲）も正しく踏襲。
- リスク欄の質が高い: ブランチ前提（#649 未取り込み）、Firefox スクロールバー mousedown ガード、`aria-pressed` と `aria-selected` の二重表現の整理など、実コードを読まないと書けない指摘が事前に押さえられている。
- エッジケースのカバー: タグ0件（AC-9）、タグ大量（max-h + overflow、combobox 化の閾値判断）、モバイルボトムシート（popoverSheetPanel 再利用）、キーボード一巡（AC-6 + 手動テスト）まで AC とテスト方針に紐付いている。
- 受け入れ基準が検証可能な形で書かれ、各 AC → 実装ステップ → テストのトレーサビリティが取れている。
