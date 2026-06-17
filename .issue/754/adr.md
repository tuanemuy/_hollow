# ADR — Issue #754: モバイルのノート一覧フィルターが横スクロール依存でUXが悪い（省スペースで見直したい）

## ADR-001: モバイルフィルターUIの方式 — 集約トリガー + ボトムシート（既存 `Dialog`）

### Status
Proposed

### Context
モバイル（`max-sm`）のフィルターバーは多数の要素を1行に詰め、`max-sm:flex-nowrap` + `max-sm:overflow-x-auto`（スクロールバー非表示）で横スクロールに依存している。横スクロールは発見性が低く、スクロールしないと到達できないフィルターがあり操作の取りこぼしが起きる。一方で全要素を縦に折り返すとフィルターが縦スペースを大きく占有しノート本体を圧迫する。Issue はこの相反する要件（横スクロール回避 × 省スペース）を満たす方式の選定を求めている。

選択肢:
- **(A) 集約トリガー1つ → ボトムシート/モーダルに全フィルターを展開**：常時占有は「絞り込み」ボタン1つ（+ クリア×）。タップで全フィルターをシートに展開。
- **(B) 適用中フィルターのみチップ表示 + 追加はまとめボタン経由**：適用中チップは並ぶが、未適用時は省スペース。適用が増えると再び横に伸び、横スクロール問題が再発しうる。
- **(C) よく使うフィルターだけ常時表示、残りは「絞り込み」メニュー**：常時表示分の選定が恣意的で、結局横並びが残る。

シート実装の選択肢:
- **(D) 既存 `Dialog`（モーダル）**：`app/components/common/Dialog.tsx` がフォーカストラップ・ESC・ボディスクロールロック・ポータル・初期フォーカス・トリガー復帰・`showCloseButton` / `closable` を完備。`dialogBackdrop`（`max-sm:items-end`）+ `dialog`（`rounded-t-lg` + `dialialogGrabber`）で**モバイルでは既にボトムシート表示**になる（#587 ADR-001）。
- **(E) `Popover` + `popoverSheetPanel`（非モーダル）**：bottom-anchored の非モーダルシート。フォーカストラップなし。FilterBar の各 Popover が既に採用。

### Decision
**(A) 集約トリガー + ボトムシートを採用し、シート実装は (D) 既存 `Dialog`（モーダル）を採用する。**

- (A) は「常時占有を1ボタンに圧縮（省スペース、AC-3）」「横スクロールを完全撤去（AC-1）」「全フィルターに到達可能（AC-2）」を同時に満たす唯一の案。(B) は適用増で横スクロールが再発、(C) は常時横並びが残るため却下。
- 件数バッジをトリガーに付けて「隠れたフィルターの存在」を可視化し、横スクロールの発見性問題（Issue 中核）を解消する（AC-6）。
- シートは多数のフィルターコントロールを内包し全画面を覆うため、**モーダル（フォーカストラップ + ESC + スクロールロック）が a11y 上適切**（AC-5）。非モーダル Popover はトラップを持たず、シート外の背後コンテンツにフォーカスが漏れる。`Dialog` は既にこれらを実装済みで、独自パターンを発明しない方針（CLAUDE.md / Issue指示）にも合致。`NotePickerDialog` という `Dialog` 利用の先例もある。
- デスクトップ（`sm` 以上）は現状の `Popover` ベースのインライン・チップ列を**完全に温存**し、本変更は `max-sm` の CSS variant に閉じる（厳格制約）。

### Consequences
- 良い点:
  - 横スクロール撤去 + 省スペースを両立。発見性が件数バッジで改善。
  - フォーカストラップ・ESC・スクロールロック・トリガー復帰を `Dialog` から無償で得られ、a11y 実装の手当てが最小。
  - 新 primitive を作らず既存資産を再利用。`Dialog` のモバイル=ボトムシート挙動が要件に合致。
- トレードオフ:
  - フィルター操作に「ボタンを押してシートを開く」1ステップが挟まる（モバイルのみ）。発見性・操作取りこぼし回避の利得が上回ると判断。
  - シート内コントロールとデスクトップ Popover 内コントロールの JSX が一部重複しうる（期間フォーム・公開状態リスト）。共通化はデスクトップ DOM を変えない範囲に限定する（plan のリスク参照）。
  - happy-dom（`FilterBar.test.tsx` の `// @vitest-environment happy-dom`。リポジトリ既定環境は `node`）が `window.matchMedia` を実評価しないため、テストでモバイル/デスクトップ両 UI が DOM 共存しうる。シート（`Dialog`）は `open` 時のみマウントされるが、`hidden max-sm:flex` のトリガーバーは常時 DOM 存在するため、テストヘルパーのクエリ起点をデスクトップラッパ（`data-desktop-filters`）に限定するスコープ管理が必要。

#### シート内コントロールの a11y ロール
シート（`Dialog`、`aria-modal` 済み）の中にデスクトップと同じ `role="menu" + menuitemradio`（公開状態）や `role="listbox"`（タグ）を入れ子にするのは APG 的に不自然（menu/listbox はフローティングポップアップ前提のロール）。**シート内の公開状態・期間はフォーム要素（`fieldset` + ラジオ群、ネイティブ date input + トグルボタン）で構成し、デスクトップとは別系統のロールにする。** デスクトップの `Popover` 側ロールは一切変更しない。

#### ネスト Dialog（内部リンク参照）の扱い — 代替案(b)で確定
内部リンク参照は `NotePickerDialog`（=`Dialog`）を開くため、モバイルでフィルターシート（`Dialog`）の中からさらに `Dialog` を開くとネストになる。

**ESC 挙動（実コード精査による訂正）:** `Dialog.tsx:256` は `event.stopPropagation()` であって `stopImmediatePropagation()` ではない。`stopPropagation` は同一ターゲット（両 Dialog とも `document` に直付け）の兄弟リスナを止めないため、ネスト時は ESC 1回で**両方の document-level keydown ハンドラが発火し両 Dialog が同時に閉じる**（登録順序に依存しない確定挙動）。round-1 で記した「登録順序依存（NotePicker だけ閉じるか両方閉じるか）」は誤りであり訂正する。NotePicker だけを閉じる挙動はネスト許容では得られない。

**確定動線（代替案(b)）:** シート内では「適用中の参照チップ表示 + 解除（`clearReferencingNoteId`）」のみを提供し、ネスト Dialog を一切開かない。参照の新規追加/変更はシートを閉じてから既存 `NotePickerDialog` を開く別動線とする。

- 代替案(a)（シートを一旦閉じてから NotePicker を開く）は、`Dialog` の復帰フォーカスが `previousActiveRef`（`Dialog.tsx:214-226`、マウント時の `document.activeElement` を保存）に依存するため、シート閉→NotePicker マウントの遷移で `activeElement` が閉処理途中の `<body>` に落ちると NotePicker クローズ後の復帰先が崩れる（AC-5 のトリガー復帰が破れる）。フォーカス復帰連鎖が脆いため不採用。
- 代替案(b) はネスト/フォーカス復帰連鎖が一切発生せず、ESC は常に単一 Dialog のみを閉じ、復帰先もシートのトリガーへ一意。最も堅いため採用。
- これにより AC-2「すべてのフィルターに横スクロールなしで到達」は、シート内（解除）+ シート外別動線（新規選択）の双方が横スクロールに依存しない形で成立する。スクロールロックは `bodyScrollLockCount` で多重対応済みだが、(b) では同時表示自体が起きないため無関係。

---

## ADR-002: 既存モック（`P10-home.html` の横スクロールフィルター行）からの意図的逸脱

### Status
Proposed

### Context
`spec/design/pages/P10-home.html` および `mobile/P10-home.html` のモックは `.filter-bar { flex-wrap: nowrap; overflow-x: auto; scrollbar 非表示 }` を規定しており、現行実装はこのモックに忠実（#749 ADR-001 が「チップ行は横スクローラで、44px タップ床はチップに適用しない」と明文化）。本Issueはこの横スクロール方式自体を UX 問題として見直すものであり、モックと実装が乖離する。プロジェクトはモック（`spec/design/`）を SSOT とする規約があるため、逸脱の扱いを決める必要がある。

### Decision
**モバイル（`max-sm`）のフィルター行に限り、モックの横スクロール方式から逸脱し、集約トリガー + ボトムシート方式へ移行する。** デスクトップのモック準拠は維持する。逸脱の根拠を本 ADR に残し、`styles.ts` の `filterBar` JSDoc を「#749 ADR-001（チップ行は横スクローラ）を #754 が更新」と更新する。`spec/design/` のモック更新（mobile/P10-home.html の反映）は本Issueのスコープ外とし、実装確定後に design-flow / spec-sync で別途同期する。

### Consequences
- 良い点: Issue が求める UX 改善を実現しつつ、逸脱の理由と影響（#749 ADR-001 の前提更新）を追跡可能な形で残す。
- トレードオフ: 一時的にモック（`spec/design/`）と実装が乖離する。後続の spec 同期作業が必要（本Issueでは plan のスコープ外として明記）。

---

## 実装メモ（2026-06-18 実装時の補足）

plan.md / ADR-001 の方針に忠実に実装。実装中に下した非自明な判断を以下に残す。

- **件数 ⇔ hasAnyFilter の一本化:** `activeFilterCount`（`optimistic` 由来の単一式）を導出し `hasAnyFilter = activeFilterCount > 0` とした。ディレクトリ項は `optimisticDirectoryId !== undefined`（dangling 非依存）で、従来の `hasAnyFilter` の predicate と一致（AC-6 不変条件）。
- **期間フォームの共通化（arch S-002）:** プリセットグリッド + 範囲入力の内側 JSX だけを `DateRangeFields` 純コンポーネントへ抽出し、デスクトップ `DatePopover` の外側 DOM（ラッパ / クリア・閉じる行）は不変のまま。シートも同じ `DateRangeFields` を描画。AC-4 を割らない。
- **公開状態（ADR-001 の fieldset 方針）:** シート内はネイティブ `<fieldset>` + `<input type="radio">` 群で構成し、デスクトップの `role="menu" + menuitemradio` は一切流用しない。`onChange` で既存 `selectVisibility` を呼ぶ（同関数内の `setOpenPopover(null)` はシートでは無害）。
- **内部リンク参照（代替案 b）:** シート内は「適用中チップ + 解除（`clearReferencingNoteId`）」のみ。新規選択は「ノートを選択」押下で `setFilterSheetOpen(false)` → `setPickerOpen(true)` の別動線。ネスト Dialog は一切開かない。`NotePickerDialog` はデスクトップ/モバイル共有の単一インスタンスとしてフラグメント直下へ移動（ポータルなのでレイアウト影響なし）。
- **ディレクトリ:** シート内に専用コントロールは置かない。現在地パンくず（ヘッダー）+ dangling フォールバックチップ行（既存）を維持（AC-7）。
- **pending 表現（arch S-006）:** モバイルトリガーバー（`data-mobile-filter`）にも `aria-busy={isPending}` を付与し、`max-sm:hidden` のデスクトップラッパから引き継いだ。
- **テスト（happy-dom）:** `Dialog` は `document.body` へポータルするため、シートのクエリ起点を `document.body` に置いた。Escape のフォーカス復帰検証はトリガーへ明示 `focus()` してから click（happy-dom の `.click()` はフォーカスを移さないため）。
