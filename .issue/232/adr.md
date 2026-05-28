# ADR — Issue #232: ディレクトリ操作のための独立UI

## ADR-001: 専用ページ `/directories` を作らずインライン UI で実装

### Status
Proposed

### Context
Issue 本文では「ルート `/directories` または既存のノート一覧サイドバーにディレクトリツリーを常設」と "or" 条件が示されている。`spec/pages/index.md` の P19 では「**専用ページではなくサイドバーのインライン UI として実装**」と明記済み。

### Decision
spec 準拠で **サイドバー内のインライン UI** として実装する。`/directories` ルートは新設しない。

### Consequences
- 良い点:
  - spec/scenario D1 「サイドバー右クリック / 専用ボタン → 新規作成、即時反映」と直接的に整合。
  - ノート一覧と操作が同一画面に共存し、操作直後にツリーへの変化が見える（フィードバックループが短い）。
  - 新ルート追加の影響を回避（loader、auth ガード、ナビゲーション動線、URL 設計の追加コストなし）。
- トレードオフ:
  - モバイル時は Sidebar が drawer 化されるため操作スペースが狭い。`max-sm:min-h-[44px]` のタッチターゲット拡張は既存 token を踏襲。

---

## ADR-002: ディレクトリ移動は D&D ではなく select Dialog

### Status
Proposed

### Context
Issue 本文では「ドラッグ&ドロップ or 移動先選択ダイアログ」と "or" 条件で提示。現状リポジトリには D&D ライブラリ（`@dnd-kit` / `react-dnd` 等）が未導入。既存 `MoveNoteDialog` は select Dialog パターンで実装されている。

### Decision
**`MoveDirectoryDialog`（select Dialog）** で実装する。D&D 関連ライブラリの追加はしない。

### Consequences
- 良い点:
  - 既存パターン（`MoveNoteDialog`）との一貫性。
  - キーボード操作との親和性が高く、アクセシビリティ要件を満たしやすい。
  - 依存パッケージ追加なし → bundle size 増加なし、保守コスト増えず。
- トレードオフ:
  - D&D の直感性は得られない。将来 D&D 需要が高まれば再評価可能（`react-dnd` か `@dnd-kit/sortable` 採用は別 Issue）。

---

## ADR-003: 操作メニューは新規 inline Popover で実装、プリミティブ化はしない

### Status
Proposed

### Context
既存 UI プリミティブは `Dialog` / `ConfirmDialog` のみ。`DropdownMenu` / `Popover` / `ContextMenu` は未実装。ディレクトリ操作メニューは「︙」ボタン押下時に小型 panel が出る形が自然。

### Decision
`app/components/directory/DirectoryActionsMenu.tsx` 内に inline で Popover を実装。共通 primitive 化（`app/components/common/Popover.tsx` などの新設）はしない。

**位置仕様 v1**: `absolute right-0 mt-1` 固定でトリガー直下に展開。viewport 端反転 (flip) は実装しない。サイドバー幅 240px 想定で十分。展開で下端に達した場合はサイドバーのスクロールが追従する。

### Consequences
- 良い点:
  - YAGNI に沿った最小実装。本 Issue での使用箇所は 1 つのため primitive 化のコストが見合わない。
  - Apple Calm の Hover Behavior（薄く色が変わるのみ）に揃えた最小デザイン。
- トレードオフ:
  - 将来別の場所で Popover が必要になった場合は primitive 化のリファクタが必要。
  - viewport 端で見切れる可能性（モバイル drawer での極端な縦スクロール時）。位置調整 (flip) は使い始めてからフォロー Issue で検討。

---

## ADR-004: リネームは inline input、その他操作は Dialog

### Status
Proposed

### Context
リネームは spec/scenario D1 で「即時反映」が要求される高頻度・低リスク操作。一方、Create は親選択 + 名前入力、Move は移動先選択、Delete は確認文言の提示が必要で、いずれも複数フィールドや確認を要する。

### Decision
- **Rename**: tree 内 inline input。F2 / メニュー「リネーム」で起動、Enter 確定、Esc キャンセル。
- **Create / Move / Delete**: それぞれ Dialog として実装（既存 `Dialog` / `ConfirmDialog` を再利用）。

### Consequences
- 良い点:
  - 操作の重み（高頻度 vs 慎重）と UI の重み（inline vs dialog）が揃う。
  - inline input はキーボード操作との親和性が高く、Apple Finder / macOS の rename 体験に近い。
- トレードオフ:
  - inline input 用のフォーカス管理コードが追加で必要。

---

## ADR-005: 「公開ノート含時の削除警告」は本 Issue ではスコープ外

### Status
Proposed

### Context
`spec/pages/index.md` P19 と `spec/scenario/organize.md` D1 異常系には「ディレクトリ削除時に配下に公開ノートが含まれる場合、公開ノートが非公開化される旨を警告」と記載。

現状のドメイン / ユースケース層には「サブツリー内の active な公開ノート集合」を取り出すクエリ経路が存在しない。`deleteDirectory.ts` の `collectMediaRefsInSubtree` とは別の join（`publication` 関連テーブル参照）が必要。

Issue #232 本文の完了条件には「公開ノート警告」は含まれていない（"削除時の確認ダイアログで子ノートをどうするかを明示" のみ）。

### Decision
本 Issue では公開ノート警告は実装しない。削除ダイアログでは「配下のノートはゴミ箱へ移動し、配下のディレクトリも再帰的に削除されます」と統一表現のみ提示する。spec 側にもフォロー Issue 番号を仮置きで参照。

### Consequences
- 良い点:
  - 本 Issue の意図（UI 導線最小実装）に集中できる。
  - 公開ノート検出クエリの設計を別 Issue で議論可能。
- トレードオフ:
  - spec の文言と実装が乖離した状態が一時的に残る → spec 側にフォロー Issue 注記で明示。

---

## ADR-006: ARIA tree pattern の roving tabindex 完全準拠は本 Issue ではスコープ外

### Status
Proposed

### Context
WAI-ARIA Authoring Practices の Tree pattern では、ツリー内の単一要素にだけ `tabindex=0` を割り当て、矢印キーで `tabindex` を移動させる「roving tabindex」または `aria-activedescendant` ベースのフォーカス管理を要求する。

これを完全実装すると以下の追加実装が必要:
- ツリー全体での 1 要素 `tabindex=0` 管理（roving）
- `aria-activedescendant` 採用 vs DOM focus 移譲の選択
- 矢印キーで「次/前のフラット可視 node」を計算するロジック
- Type-ahead（先頭文字で検索ジャンプ）

`spec/scenario/organize.md` D1 / Issue #232 完了条件には「ARIA tree pattern 完全準拠」は要件記載されていない（「キーボード操作」と「スクリーンリーダー対応」のみ）。

### Decision
**v1 サブセット** で実装する:
- `role="tree"` / `role="treeitem"` / `aria-level` / `aria-expanded` を付与（SR 対応）
- 各 treeitem の対話要素が自然な `tabindex` で到達可能
- 矢印キー（上/下/左/右）・Enter・F2・Delete・Esc の必須ショートカット
- roving tabindex / `aria-activedescendant` 完全化はフォロー Issue

### Consequences
- 良い点:
  - スクリーンリーダーで「ツリーである」「現在の階層」「展開状態」が伝わる最低限の SR 対応は確保。
  - キーボード操作で 4 操作すべてに到達可能 → Issue 完了条件「キーボード操作」を満たす。
  - 本 Issue のスコープが膨らまない。
- トレードオフ:
  - WAI-ARIA Tree pattern 完全準拠ではない → スクリーンリーダー UX は spec 上の理想形に達しない。フォロー Issue で改善余地。

---

## ADR-007: `DirectoryPicker` の Rename/Delete は opt-in prop で `NoteEditor` のみ有効化

### Status
Proposed

### Context
Issue 提案 2 は「ノート編集中の `DirectoryPicker` から『このディレクトリをリネーム／削除』も実行可能に」。しかし `DirectoryPicker` は `NoteEditor` だけでなく `IngestionPreviewForm` でも使用されている。

ingestion preview 中に LLM 提案の「保存先ディレクトリ」を物理削除すると以下が崩れる:
- `directoryId` が宙に浮き、commit 時に `NotFoundError`
- AI suggestion バッジ・`edited` 判定との不整合
- preview 状態の取り消し操作の意味が曖昧化

### Decision
`DirectoryPicker` に opt-in prop `allowExistingActions?: boolean`（default `false`）を追加。`NoteEditor` 側だけ `true` で渡し、`IngestionPreviewForm` 側は渡さない。

### Consequences
- 良い点:
  - Issue 提案 2 を満たす（NoteEditor では Rename/Delete 可能）。
  - ingestion preview の状態整合性が保たれる。
  - 既存 prop 互換も維持（新規 optional prop）。
- トレードオフ:
  - 2 つの呼び出し元で UI 挙動が分かれる。挙動差異は ingestion 側のフォロー Issue で別途検討可能。

---

## ADR-008: ツリーは `<ul>/<li>` ではなく `<div role="tree">` 系で構築

### Status
Accepted（実装時判断）

### Context
当初プランでは `<ul role="tree">` / `<li role="treeitem">` / `<ul role="group">` で WAI-ARIA tree pattern を構築する想定だった。実装中、Biome 2.3 の a11y ルール（`noNoninteractiveElementToInteractiveRole`, `useFocusableInteractive`, `useSemanticElements`）が `<ul>` / `<li>` に interactive role を載せることを拒絶。`// biome-ignore` で個別に抑制を試みたが、`<ul role="tree">` 側で 2 種類のルールを連続抑制する記法が biome 2.3 では安定して効かなかった。

### Decision
ツリー全体を `<div role="tree">` / `<div role="treeitem">` / `<div role="group">` で構築する。`role="treeitem"` には `tabIndex={-1}` を付与してプログラマブルにフォーカス可能（自然なタブサイクルからは除外）。`role="group"` のみ `useSemanticElements` を `<fieldset>` 提案で誤検出するため、その箇所だけ `// biome-ignore` を残す。

### Consequences
- 良い点:
  - Biome 2.3 のデフォルトルールセットと衝突せず、CI を安定通過。
  - SR は `role="tree"` を最優先で読むので、`<div>` vs `<ul>` は SR UX に影響しない。
  - WAI-ARIA Tree Pattern v1 サブセットの SR 対応（`role` / `aria-level` / `aria-expanded`）は維持。
- トレードオフ:
  - JS が無効な環境ではリスト構造の意味が失われる（ただし本アプリは認証必須・JS 前提なので実害なし）。

---

## ADR-009: サイドバーの「+」ボタン用にクライアントコンポーネント `DirectorySidebarSection` を新設

### Status
Accepted（実装時判断）

### Context
プランでは `Sidebar.tsx`（async RSC）に直接「+」ボタンを置く想定だったが、ボタン押下で `CreateDirectoryDialog`（client component）を開くには `useState` が必要。RSC に直接 `useState` は置けない。

### Decision
小さなクライアントラッパー `DirectorySidebarSection.tsx` を新設し、セクション見出し（ディレクトリ + 「+」ボタン）と `DirectoryTree` と `CreateDirectoryDialog` をまとめてホストする。`Sidebar.tsx` はこのコンポーネントを 1 つの子として `tree` を渡すだけ。

### Consequences
- 良い点:
  - Sidebar は async RSC のまま、tree のフェッチ責務だけを保持。
  - 「+」ボタンと作成ダイアログの状態が同一コンポーネント内で閉じる（凝集度が高い）。
  - Sidebar.tsx の差分が最小（DirectorySidebarSection を 1 つ呼ぶだけ）。
- トレードオフ:
  - コンポーネント数が 1 増えるが、責務分離としては自然。
