# 実装計画 — Issue #232: ディレクトリ操作のための独立UI

**Issue:** #232
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

バックエンド・ユースケース・サーバー関数は揃っているが UI 導線が無いディレクトリ操作（作成 / リネーム / 移動 / 削除）を、ユーザーが画面から実行できるようにする。`spec/pages/index.md` の **P19「ディレクトリ管理（インライン）」** に従って、**専用ページを作らずサイドバーへのインラインUI**として実装する。

## スコープ

### 含まれるもの

- サイドバーのディレクトリツリー上での 4 操作（作成 / リネーム / 移動 / 削除）
  - ホバー時に表示される「︙」メニュー、または常時表示のアクションアイコン群
  - リネーム: インライン編集モード（input が tree 内で開く）
  - 移動: 既存 `MoveNoteDialog` 同等パターンの `MoveDirectoryDialog`（select で移動先選択）
  - 削除: `ConfirmDialog`（destructive）で「配下ノートはトラッシュ／配下ディレクトリは再帰削除」を明示
  - 作成: ルート直下作成と「この配下に作成」（select 中の親に対する子作成）の 2 経路
- サイドバーヘッダーに「+ 新規ディレクトリ」ボタン
- ノートエディタの `DirectoryPicker` に「リネーム」「削除」ボタン追加（Issue 提案 2）
- キーボード操作（矢印キー、F2、Delete）と ARIA 属性（`role="tree"`/`treeitem`/`aria-level`/`aria-expanded`）
- 操作後の自動再フェッチ（`router.invalidate()`）
- `spec/pages/index.md` P19 と `spec/scenario/organize.md` D1 の記述を実装に合わせて更新

### 含まれないもの

- 専用ページ `/directories` の新設（spec P19 が「インライン UI」と明記、専用ページは作らない）
- 右クリック起動のコンテキストメニュー（Issue 提案 1 は「右クリック or ホバー操作」の "or" 条件、ホバー側 = 「︙」メニュー方式を採用）
- ドラッグ & ドロップ移動（D&D ライブラリ未導入。Dialog で代替し、UI ライブラリ追加はスコープ外）
- SavedView の broken marker 表示／修復 UI（既存 P20 / Issue #181 に閉じる。本 Issue では削除イベントが既存の `note.trashed` 経由で fan-out されることを再確認するのみ）
- 公開ノートが含まれる場合の警告ダイアログ（spec/pages P19 / spec/scenario/organize.md D1 異常系で言及があるが、現状ドメインに「サブツリー内の active 公開ノート集合」を取り出すクエリ経路が無いため本 Issue では対象外。ADR-005 で詳述、フォロー Issue 候補。本 PR では削除ダイアログの説明文「配下のノートはゴミ箱へ移動します」でカバー）
- 「壊れた SavedView」表示（P20 側、別 Issue）
- ARIA tree pattern の厳密な roving tabindex / `aria-activedescendant`（v1 は `tabindex=0` を各 treeitem に付与し矢印キー / F2 / Delete / Enter / Esc の必須ショートカットを実装。完全準拠の roving tabindex はフォロー Issue。ADR-006 で詳述）

## 調査結果

### あるべきアーキテクチャ

- **Hexagonal + DDD**: Domain → Application → Adapters / Presentation の inward 依存。
- **フロントエンド**: TanStack Start + React 19 + RSC。データ取得は async server component、ミューテーションは `useServerFn` 経由でクライアントから呼び、`router.invalidate()` で再フェッチ。
- **スタイル**: Tailwind utility-first、`app/components/common/styles.ts` と `layout/styles.ts` から共通クラスを再利用。
- **境界バリデーション**: 入力は `validateInput(schema)` （transport boundary）+ 値オブジェクト構築（business invariants）の二段。`schema.ts` に Zod スキーマ。
- **ダイアログ**: `app/components/common/Dialog.tsx` と `ConfirmDialog.tsx` を再利用（focus-trap・IME 中 Esc 抑制・bodyScrollLock を内蔵）。
- **状態**: クライアント側は `useReducer` / `useState` + `useTransition`。`useRouter().invalidate()` で server state 同期。

### 既存実装の状態

| 領域 | 状態 |
|------|------|
| ドメイン (`app/core/domain/directory/`) | あるべき姿と一致。 |
| ユースケース (`app/core/application/directory/`) | 5 つ揃って稼働中。 |
| サーバー関数 (`app/components/directory/actions.ts`) | 4 つ公開済み。schema.ts も妥当。 |
| 削除イベントの SavedView fan-out | 既に `handleNotePurgedEvent` 経由で実装済み。本Issueで追加実装不要。 |
| UI 導線 | **存在しない**（Sidebar のツリーは「リンクのみ」、DirectoryPicker は「選択 + 新規入力（保存時作成）」のみ）。 |
| spec / 設計ドキュメント | P19 が「インライン UI として実装」と明記、D1 シナリオも整理済み。 |

### 関連ファイル

- 更新: `app/components/layout/Sidebar.tsx`（DirectoryNode を新規 client component `DirectoryTree` に差し替え）
- 更新: `app/components/note/editor/DirectoryPicker.tsx`（Rename/Delete ボタン追加）
- 更新: `spec/pages/index.md` P19 セクション
- 追加: `app/components/directory/DirectoryTree.tsx`（client、ツリーレンダリング + 各 node のアクションメニュー）
- 追加: `app/components/directory/DirectoryActionsMenu.tsx`（「︙」ボタン押下で表示する小型 dropdown）
- 追加: `app/components/directory/RenameDirectoryDialog.tsx`
- 追加: `app/components/directory/CreateDirectoryDialog.tsx`
- 追加: `app/components/directory/MoveDirectoryDialog.tsx`
- 追加: `app/components/directory/DeleteDirectoryDialog.tsx`
- 追加: `app/components/directory/styles.ts`（utility-class 定数：tree-item, action-button, popover）
- 追加: `app/components/note/directoryTree.ts` に `getDescendantIds` / `excludeSubtree` をエクスポート（純粋関数。Move dialog の循環防止 UI で使用）

### 依存関係

- `app/components/note/editor/NoteEditor.tsx`: `DirectoryPicker` を呼んでいる。新規 opt-in prop `allowExistingActions` を渡す（ステップ 6 参照）。`tree` は props でそのまま渡しており、`useState` コピーされていないため `router.invalidate()` 後の親 RSC 再評価で自動更新される（既存挙動を確認済み）。
- `app/components/ingestion/IngestionPreviewForm.tsx`: 同じ `DirectoryPicker` を使用。**`allowExistingActions` を渡さない（default false）** ため Rename/Delete ボタンは表示されない。ingestion preview 中に LLM 提案ディレクトリを物理削除すると preview 状態整合が崩れるため意図的に opt-in 制にする。
- `app/routes/index.tsx` 他: `Sidebar` を `AppShell` 経由で表示。Sidebar の export 形状を変えなければ非影響。
- SavedView: 既存の note.trashed 経由 fan-out で対応済み。

## 実装ステップ

### 1. ディレクトリツリー用クライアントコンポーネントの新設

- **対象ファイル:** `app/components/directory/DirectoryTree.tsx`（新規）
- **変更内容:**
  - props: `tree: readonly DirectoryTreeNode[]`, `activeDirectoryId?: string | null`
  - **`tree[0]` は常にルート**（hidden root pattern。`DirectoryService.ensureRoot` により認証済みユーザーには必ず 1 件存在、`toDirectoryTree` も root から build）。レンダリングは `tree[0]?.children` を起点に再帰する。ルート自体は描画しない（名前 `""`・depth 0 のため）
  - 「ディレクトリが空」のセクション内空状態判定は `tree[0]?.children.length === 0` で行う（既存 Sidebar の `tree.length === 0` 死に分岐を本 PR で正す）
  - 再帰的に `<ul role="tree">` / `<li role="treeitem" aria-level={depth} aria-expanded={...}>` を生成（root の直下が level 1）
  - 各 node は (a) ノート一覧へのリンク (`<Link to="/" search={{ ...HOME_SEARCH, directoryId: node.id }}>`) と (b) 「︙」アクションボタンを横並びに配置
  - 折り畳み状態は `useState<Record<string, boolean>>` でローカル管理（初期値はすべて展開）
  - キーボード v1（最小実装）: 矢印キー（上/下=表示中の次/前の treeitem に focus 移動、左=畳む or 親へ、右=開く or 最初の子へ）、Enter=リンク遷移、F2=リネーム、Delete=削除確認、Esc=入力中の inline rename をキャンセル
  - フォーカス管理 v1: 各 treeitem 内の対話要素が `tabindex` の自然な順序で到達可能。矢印キーは `event.preventDefault()` + 次の `[role=treeitem]` の最初の focusable に focus 移譲する `useRef` ベース実装。WAI-ARIA Tree pattern の単一 `tabindex=0` roving / `aria-activedescendant` はフォロー Issue（ADR-006 で詳述）
  - 各操作（リネーム/削除/移動/子作成）は親（`DirectoryTree`）が dialog state を持ち、選択 node を渡す
  - `"use client"` 明記
- **理由:** spec P19 のインライン操作要件を満たし、キーボード操作とアクションメニューを統合的に提供するには client component が必要。

### 2. アクションメニュー（「︙」ポップオーバー）の新設

- **対象ファイル:** `app/components/directory/DirectoryActionsMenu.tsx`（新規）
- **変更内容:**
  - props: `onCreateChild`, `onRename`, `onMove`, `onDelete`, `triggerLabel`
  - トリガーボタン（aria-haspopup="menu" aria-expanded）を押すと、絶対配置の小型 panel が出現
  - panel は `role="menu"`, 各項目 `role="menuitem"`
  - Esc / 外側クリックで閉じる（`useEffect` で document mousedown / keydown を聞く）
  - tailwind utility のみ。`shadow-sm` ベース、`rounded-md`、`bg-bg border border-hairline`
  - **位置仕様 v1:** `absolute right-0 mt-1` 固定でトリガーボタン直下に展開。サイドバー幅 240px・ツリーが下方向にスクロールする前提のため viewport 端反転 (flip) は実装しない。展開した結果ツリースクロール領域からはみ出した場合はサイドバー側のスクロールが追従する。Popover プリミティブ化と flip 対応はフォロー Issue（ADR-003 で詳述）
- **理由:** 既存 UI プリミティブに DropdownMenu/Popover が無い。最小の inline 実装で十分（操作は最大 4 つ）。Apple Calm に沿ったトーンで実装。

### 3. ダイアログ 4 種の新設

- **対象ファイル:**
  - `app/components/directory/CreateDirectoryDialog.tsx`
  - `app/components/directory/RenameDirectoryDialog.tsx`
  - `app/components/directory/MoveDirectoryDialog.tsx`
  - `app/components/directory/DeleteDirectoryDialog.tsx`
- **変更内容:**
  - 全て `"use client"` + 既存 `Dialog` / `ConfirmDialog` を再利用
  - `useServerFn(createDirectoryFn|renameDirectoryFn|moveDirectoryFn|deleteDirectoryFn)` で server function を呼ぶ
  - 成功時 `await router.invalidate()` → `onClose()`
  - エラー: `extractSerializedError` で取り出して `displayError` で日本語表示
  - **Create**: `parentId: string | null`, 名前 input。重複名・禁止文字・深さ上限のエラーは server から返る `validation` / `business_rule` を表示
  - **Rename**: `directoryId`, 現在名を初期値とする input。同名 → no-op で閉じる
  - **Move**: select に flat tree。自分とその子孫を除外（`getDescendantIds` + `excludeSubtree` ヘルパー、ステップ 5a 参照）。ルート（`name=""`）は select 上で「（ルート）」固定ラベルで表示し、選択時は実 root id（`tree[0].id`）を `newParentId` として送信。サーバー側の `null → root` フォールバックには依存しない（明示的に root id を送る）
  - **Delete**: `ConfirmDialog` を使い、`description` に「このディレクトリを削除します。配下のノートはゴミ箱へ移動し、配下のディレクトリも再帰的に削除されます。」と明示
- **理由:** 各操作のフォームは異なり、共通化は YAGNI。`ConfirmDialog` で済む削除以外はそれぞれ Dialog を立てる。

### 4. インライン・リネーム機構

- **対象ファイル:** `DirectoryTree.tsx`（実装内）
- **変更内容:**
  - F2 を押した node、あるいはアクションメニューから「リネーム」を選んだ node は **インライン input** に変わる（dialog ではない）
  - Enter で確定 → `renameDirectoryFn`、Esc でキャンセル
  - 失敗時はエラーをツリー内に inline 表示（小さい `text-error` テキスト）
- **理由:** Issue 提案で「インライン編集」を明記。dialog より直感的で、spec/scenario D1 にも合致。

### 5. サイドバーへの統合

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:**
  - 既存の `DirectoryNode`（リンクのみ）を削除し、新しい `<DirectoryTree tree={tree} />` を埋め込む（Sidebar 自体は async RSC のまま、子に client component を JSX で配置）
  - 「ディレクトリ」セクションタイトルの隣に小型の「+」アイコンボタンを置き、押下で `CreateDirectoryDialog`（parentId=`tree[0].id`、つまりルート直下）を開く
  - 空状態判定: `tree[0]?.children.length === 0` の場合に「+ ディレクトリを作成」CTA を表示（既存の `tree.length === 0` 分岐を置き換え。実ユーザーではルートが常に存在するため後者は死に分岐だった）
- **理由:** spec P19 「P10 のサイドバーから直接操作（作成 / リネーム / 移動 / 削除）」要件を満たす。

### 5a. tree 操作ヘルパーの追加

- **対象ファイル:** `app/components/note/directoryTree.ts`（既存に追記）
- **変更内容:**
  - `getDescendantIds(tree: readonly DirectoryTreeNode[], targetId: string): Set<string>` — `tree` を DFS し、`targetId` を起点に自身 + 子孫の id 集合を返す。本 ID が見つからなければ空 Set
  - `excludeSubtree(flat: readonly FlatDirectory[], excludeIds: ReadonlySet<string>): FlatDirectory[]` — flat 配列から `excludeIds` に含まれる id を除外
  - 両方とも pure 関数。`flattenDirectoryTree` と SSOT を共有する
- **理由:** Move ダイアログでの循環防止 UI と、`MoveNoteDialog` との一貫性（flat 配列を受け取って表示）を両立するための共通ヘルパー。ファイル位置は既存 SSOT に同居させ重複ロジックを防ぐ。

### 6. DirectoryPicker への操作追加（Issue 提案 2）

- **対象ファイル:** `app/components/note/editor/DirectoryPicker.tsx` / `app/components/note/editor/NoteEditor.tsx`
- **変更内容:**
  - DirectoryPicker に opt-in prop を追加: `allowExistingActions?: boolean`（default `false`）
  - `allowExistingActions === true` かつ `directoryId !== null` の場合に限り、select の右に「リネーム」「削除」ボタンを表示
  - 「リネーム」→ `RenameDirectoryDialog` を開く（tree から自分自身の name を引いて初期値に）
  - 「削除」→ `DeleteDirectoryDialog` を開く
  - 削除完了後は `onSelectExisting(null)` を呼んで親に通知（選択解除）
  - `NoteEditor.tsx` 側で `<DirectoryPicker ... allowExistingActions />` を渡す
  - `IngestionPreviewForm.tsx` は **prop を渡さない**（default false）ため Rename/Delete ボタンは表示されない
- **理由:** Issue 提案 2「DirectoryPicker から実行可能に」を満たす。同時に ingestion preview 中の LLM 提案ディレクトリへの破壊的操作を遮断する（opt-in 制でセマンティクスを明示）。両呼び出し元の挙動が分離されるため将来のフォロー Issue で ingestion 側の挙動を別途検討可能。

### 7. spec 更新

- **対象ファイル:** `spec/pages/index.md` / `spec/scenario/organize.md`
- **変更内容:**
  - `spec/pages/index.md` の P19 セクションを以下の粒度で更新:
    - 起動経路: サイドバー（ツリー項目の「︙」メニュー、セクション見出しの「+」ボタン）/ ノートエディタ DirectoryPicker（選択中ディレクトリへのリネーム・削除、opt-in）
    - 操作 4 種の挙動詳細（インライン編集での Rename、Dialog での Move/Delete/Create）
    - 削除確認ダイアログでの中身扱い文言（配下ノートはゴミ箱／配下ディレクトリも再帰削除）
    - キーボード操作（矢印・F2・Delete・Enter・Esc）と ARIA ロール（tree/treeitem）
    - 「公開ノート含時の警告」と「ARIA tree pattern の roving tabindex 完全準拠」は本 Issue 範囲外（ADR-005 / ADR-006 を参照し、フォロー Issue 番号を仮置きで参照）
  - `spec/scenario/organize.md` D1 異常系の「公開ノートが含まれる場合の警告」項目にもフォロー Issue 番号注記
- **理由:** 完了条件「spec/design / spec/pages に新ページ／パネルの設計を反映」を満たす。spec/design への変更は不要（**根拠:** 既存デザイントークン `--color-*` `--space-*` `--radius-*` `--shadow-*` で全要素を構成し、新規トークン／コンポーネント定義を追加しないため。Apple Calm のホバー・ピル・Dialog パターンを踏襲）。

### 8. lint / typecheck / format

- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実装後に実行
- **理由:** CLAUDE.md 規約。

## 設計判断

ADR として `adr.md` に記録する判断:

- **ADR-001**: 専用ページ `/directories` は作らずインライン UI で実装（spec P19 準拠）
- **ADR-002**: ディレクトリ移動の UI は D&D ではなく select Dialog（依存追加回避、キーボード操作容易、MoveNoteDialog との一貫性）
- **ADR-003**: 操作メニューは新規 inline Popover 実装（DropdownMenu primitive 化は YAGNI、本 Issue では使用箇所 1 つ）。位置は `absolute right-0 mt-1` 固定、viewport 端反転 (flip) は v1 では非対応
- **ADR-004**: リネームは inline input、その他は Dialog（リネームは高頻度・低リスクで spec/scenario D1 が「即時反映」を要求、他は確認や複数フィールドを要するため Dialog）
- **ADR-005**: 「公開ノート含時の削除警告」は本 Issue ではスコープ外（理由: 公開状態を参照する「サブツリー内の active 公開ノート集合」クエリが domain ports / `deleteDirectory.ts` の `collectMediaRefsInSubtree` とは別 join で未実装。本 Issue は UI 導線最小実装に集中。フォロー Issue で対応）
- **ADR-006**: ARIA tree pattern の roving tabindex 完全準拠（単一 `tabindex=0` / `aria-activedescendant`）は本 Issue ではスコープ外（v1 は各 treeitem に自然な tabindex + 矢印・F2・Delete・Enter・Esc の必須ショートカット。spec/scenario D1 にも完全準拠は要件記載なし。フォロー Issue で対応）
- **ADR-007**: `DirectoryPicker` の Rename/Delete は opt-in prop `allowExistingActions` で `NoteEditor` のみ有効化（ingestion preview への波及を遮断）

## リスクと注意点

- **ルートディレクトリの扱い**: `findTree` / `toDirectoryTree` は常にルート（name="", parentId=null, depth=0）を含む forest を返す。実ユーザーには `DirectoryService.ensureRoot` で必ず 1 件存在保証。UI ではルートを描画せず `tree[0].children` を起点に再帰する。空状態判定は `tree[0]?.children.length === 0`。Move dialog の「ルートに移動」は `tree[0].id` を `newParentId` として明示送信し、サーバーの `null → root` フォールバックには依存しない。
- **Move の select に自分の子孫を含めると循環移動が発生する** → `directoryTree.ts` に `getDescendantIds` / `excludeSubtree` ヘルパーを追加して flat 配列から除外。バックエンドの `assertNotCyclicMove` でも防がれるが、UI 側で選択不可にする方が UX 良好。
- **削除の確認文言**: 「子ノートをどうするか」を明示することが完了条件。現在のドメイン挙動は「子ノートはゴミ箱（trashed）へ、子ディレクトリも物理削除」なので、その通り文言化する。
- **router.invalidate のスコープ**: `Sidebar` は `__root.tsx` 経由のレイアウト型ではなく `AppShell` から呼ばれる RSC。`router.invalidate()` でルートローダー全体が再評価されるため、tree が確実に再フェッチされる。
- **DirectoryPicker でリネーム後の選択維持**: 名前が変わっても id は同じ。`tree` は `NoteEditor` / `IngestionPreviewForm` から props で直渡しされ `useState` コピーはされていない（確認済み）ため、dialog 内で `renameDirectoryFn` 後 `router.invalidate()` すれば親 RSC 再評価で新しい `tree` が降ってきて自動更新される。`onSelectExisting` を呼ぶ必要はない。
- **Sidebar が RSC（async function）のままだと client の DirectoryTree を子として埋め込めるか**: TanStack Start の React 19 / RSC 設計では server component の子に client component を JSX で配置可能（client manifest 経由）。実装パターンは既に `AppShell`（`Header`/`UploadButton` は client）が使用しており互換あり。
- **DirectoryPicker の波及**: opt-in prop `allowExistingActions` を導入することで NoteEditor からのみ Rename/Delete を有効化し、`IngestionPreviewForm` 側には波及させない（preview 中の物理削除による状態整合性崩壊を防止）。
- **キーボードフォーカス管理**: ツリーは [WAI-ARIA Authoring Practices Tree pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) の v1 サブセット準拠（自然な tabindex + 矢印 / F2 / Delete / Enter / Esc）。完全準拠の roving tabindex はフォロー Issue（ADR-006）。
- **ConfirmDialog の form `<form>` の Enter で削除誤発火**: 既存の `ConfirmDialog` は意図的に confirm を destructive 扱い、Enter で submit する仕様。これは spec 通り。
- **`tree[0] = root` invariant のドキュメント**: 「root が常に `tree[0]` に存在」という invariant は `DirectoryService.ensureRoot` が signup / restoreNote 等で呼ばれることに依拠する暗黙的なもの。`DirectoryTree.tsx` と `MoveDirectoryDialog.tsx` で `tree[0]` を root として参照する箇所には、CLAUDE.md「WHY が非自明な箇所はコメント」に従い短い inline コメント（例: `// tree[0] is the implicit root (ensured by DirectoryService.ensureRoot at signup)`）を残す。
- **Move dialog の root ラベル差異**: `MoveDirectoryDialog` は root を「（ルート）」固定ラベルで表示するが、既存の `MoveNoteDialog` は同じ root を `path="/"` で表示している。本 Issue では `MoveNoteDialog` 側を変更せず、`MoveDirectoryDialog` のみ独自ラベルを採用する。理由: ディレクトリ間移動では「ルート直下に移す」操作の意味が明示的に必要で、`/` 表記より自然言語のほうが UX 良好。`MoveNoteDialog` のラベル統一は本 Issue のスコープ外。
- **アイコンのみボタンの aria-label**: 「+ 新規ディレクトリ」（サイドバーセクション右の icon button）には `aria-label="ディレクトリを新規作成"`、「︙」（各 treeitem のメニュートリガー）には `aria-label={\`${node.name} の操作\`}` を付与する。既存 `UploadButton` 等のパターンに合わせる。

## テスト方針

自動テスト（unit）は本Issueでは新規追加せず、既存テストを壊さないことを確認する（CLAUDE.md の方針「validation は境界で、内部は型に信頼」に沿ったフロントエンドコードのためテスト追加はオプション）。

手動ブラウザ確認は `testing.md` に詳細を記載。主観点:

- 4 操作（作成 / リネーム / 移動 / 削除）が UI から実行できる
- 削除確認ダイアログに子ノート扱いの明示がある
- 移動の select で自分の子孫が選べない（循環防止 UI）
- DirectoryPicker からのリネーム・削除が動作
- キーボード操作（矢印・F2・Delete・Enter・Esc）
- 既存ノート作成・エディタ機能・サイドバー全体のリグレッションなし

## レビュー履歴

### 初稿
- プランナーサブエージェントが API オーバーロードで 2 連続失敗のため、issue-planner SKILL の指示通り親エージェントで初稿作成。
- Exploreエージェント 3 つ並列で `app/core/application/directory/`、`app/components/`、`spec/` を調査。

### 1周目
**修正した点**:
- [P-001] ルートディレクトリは常に存在するため、`tree.length === 0` 死に分岐を `tree[0]?.children.length === 0` に置換。レンダリングは `tree[0]?.children` 起点。Move dialog の「ルートに移動」は `tree[0].id` を明示送信する方針に修正（実装ステップ 1、5、3 を更新）。
- [P-002] `DirectoryPicker` への Rename/Delete ボタンは opt-in prop `allowExistingActions` で `NoteEditor` のみ有効化する方針に変更。`IngestionPreviewForm` への波及を遮断（実装ステップ 6 を更新、ADR-007 追加）。
- [P-003] `getDescendantIds` / `excludeSubtree` を `app/components/note/directoryTree.ts` の export として明示。Move dialog は flat 配列 + 除外 helper で実装、`MoveNoteDialog` との一貫性を保つ（実装ステップ 5a を追加）。

**取り込んだ改善提案**:
- [S-001] 「右クリック起動」を明示的にスコープ外（Issue 提案の "or" 条件のうちホバー側採用）に記載。
- [S-002] spec/design 更新不要の根拠（既存トークンのみ使用）を実装ステップ 7 に明文化。
- [S-003] 「公開ノート警告」を ADR-005 として記録、`spec/scenario/organize.md` D1 異常系にもフォロー Issue 注記を入れる方針を追加。
- [S-004] roving tabindex 完全準拠をスコープ外として ADR-006 に明記、v1 サブセット仕様を実装ステップ 1 で詳述。
- アクションメニューの位置仕様（`absolute right-0 mt-1` 固定）を ADR-003 と実装ステップ 2 に追記。
- NoteEditor の `tree` フロー（useState コピーなし）の確認を依存関係セクションとリスクに反映。

**見送った提案とその理由**:
- `getDescendantIds` 等ヘルパーの unit test 追加（要件カバレッジ視点 S-004 / 改善提案）: 本 Issue の意図は UI 導線追加。CLAUDE.md 方針「validation は境界、内部は型に信頼」に照らしフロントエンド純粋関数のテストは optional。手動テストで循環防止 UI 動作確認に置き換え。需要があればフォロー Issue 化可能。

### 2周目
- **両視点とも問題点ゼロ** → レビューループ終了条件達成。
- 要件カバレッジ視点 S-001（リスク欄に古い記述と新記述が重複）→ 修正済み（旧 roving tabindex 主軸記述を削除）。
- アーキ・リスク視点 S-002（`tree[0] = root` invariant のコメント明示）→ リスク欄に追記、実装時に inline コメントを残す方針を明文化。
- アーキ・リスク視点 S-003（root のラベル `MoveDirectoryDialog` 独自表示の意図明示）→ リスク欄に追記。
- アーキ・リスク視点 S-004（icon button の aria-label 文言ガイドライン）→ リスク欄に追記し、実装時の必須事項として明文化。

レビューループ終了（2 周、両視点で問題点ゼロ達成）。

