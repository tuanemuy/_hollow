# 実装計画 — Issue #388: ディレクトリ移動UIのスケーラビリティ改善 / パス先頭スラッシュ重複の修正

**Issue:** #388
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

`directoryTree` まわりの2つの課題を同一 PR で解消する。

1. **UI スケーラビリティ**: 移動先ディレクトリ選択が `<select>` ドロップダウン＋空白インデントで、ディレクトリ数・階層が増えると一覧性・可読性が崩れ、スクリーンリーダーで階層が伝わらない。検索フィルタ付き＋階層が a11y に伝わるピッカーへ置き換える。
2. **パス先頭スラッシュ重複**: `flattenDirectoryTree` が `path = ${parentPath}/${node.name}` と無条件にスラッシュを前置するため、ルート（name=""）配下の子パスが `//Work` のように先頭スラッシュ重複になる。空セグメントを除外し `/Documents/Work` のような単一スラッシュ区切りに正規化する。

## スコープ

### 含まれるもの
- `flattenDirectoryTree` のパス組み立て正規化（空セグメント除外・先頭スラッシュ重複の根絶）と回帰ユニットテスト
- 検索フィルタ付き＋階層インデント表示の単一選択ディレクトリピッカーを再利用コンポーネントとして新設
- 3箇所の `<select>` ベース UI を新ピッカーへ置き換え:
  - `app/components/note/list/MoveNoteDialog.tsx`
  - `app/components/note/editor/DirectoryPicker.tsx`（既存ディレクトリ選択部のみ。新規作成との二択構造は維持）
  - `app/components/directory/MoveDirectoryDialog.tsx`（cyclic 除外・root ラベルは維持）

### 含まれないもの
- ツリーの展開/折りたたみ機能・仮想スクロールなどの極端な件数向け最適化（必要なら別 Issue）
- `MoveDirectoryDialog` の `DirectoryTreeNode` import 経路統一などスコープ外リファクタ
- バックエンド（loader / server-fn / ドメイン）の戻り値形状変更（JSON 形は不変に保つ）

## 実装ステップ

### 1. パス組み立ての正規化（要件2）

- **対象ファイル:** `app/components/note/directoryTree.ts`
- **変更内容:** `flattenDirectoryTree` の `walk` を、文字列連結ではなく祖先 `name` セグメント配列を引き回す方式へ変更する。空セグメント（root の `name=""`）を除外して `"/" + segments.join("/")` で組み立てる。
  - `walk(node, ancestors: readonly string[])` とし、`const segments = node.name === "" ? ancestors : [...ancestors, node.name];`、`const path = "/" + segments.join("/");`
  - root 自身は `path="/"`、その配下は `/Documents`、孫は `/Documents/Work`。`depth`/`id`/`parentId`/`name` の出力は不変。
- **理由:** 空セグメント除外で先頭スラッシュ重複を根絶。表示2箇所（`MoveNoteDialog` の `{dir.path}`、`MoveDirectoryDialog` の `dir.path`）が期待どおり単一スラッシュ区切りになる。

### 2. パス正規化の回帰ユニットテスト追加

- **対象ファイル:** `app/components/note/__tests__/directoryTree.test.ts`（新規）
- **変更内容:** `flattenDirectoryTree` に対し (a) `name=""` の root 配下の子が `/Work`・孫が `/Work/2024` になる、(b) 連続スラッシュ・末尾スラッシュが出ない、(c) `depth`/`id`/`parentId` が保全される、を検証。あわせて `getDescendantIds`/`excludeSubtree` の最小スモークも追加（cyclic 除外パスを守るため）。`DirectoryTreeNode` のモックは型に沿って最小オブジェクトを組む（既存テストの慣行に合わせる）。
- **理由:** パス組み立てはこの Issue の中核バグで再発しやすい。純粋関数なのでユニットテストが最も費用対効果が高い。

### 3. 再利用可能な検索フィルタ付きツリーピッカーの新設（要件1の基盤）

- **対象ファイル:** `app/components/directory/DirectorySelectField.tsx`（新規）＋必要なら `app/components/directory/styles.ts` にユーティリティ定数追記
- **変更内容:** `FlatDirectory` 互換の options（`{ id; name; path; depth }`）を入力に取り、Dialog / fieldset 内に置けるインライン単一選択フィールドを実装する。`NotePickerDialog` の combobox+listbox パターンを踏襲（ただしデータは渡された配列なのでサーバ検索・debounce 不要、クライアント側フィルタのみ）。
  - 上部に `type="search"` の絞り込み入力（`role="combobox"`、`aria-autocomplete="list"`、`aria-expanded`、`aria-controls`、`aria-activedescendant`）。ArrowUp/Down で `aria-activedescendant` 移動、IME-safe Enter（`event.nativeEvent.isComposing` ガード）で確定。
  - 一覧は `role="listbox"`。各行 `role="option"` に `aria-selected`。**階層は `path`（例 `/Documents/Work`）をオプションの読み上げテキスト/補助テキストとして表示することで a11y に伝える** — `depth` から算出した視覚インデント（paddingLeft）は見た目用。`role="option"` は `aria-level` をサポートしないため付与しない（付けても SR は読み上げず biome lint に抵触する）。階層を機械可読にしたければ tree/treeitem 方式が必要だが、それは ADR-001 が却下した A 案でありスコープ外。フィルタは `name`/`path` 部分一致。
  - `aria-live` のステータス行（該当件数 / 0件メッセージ）を付与。
  - props（差分吸収）: `options: readonly { id; name; path; depth }[]`（`FlatDirectory` を直 import せず構造的型で受け、directory→note 依存を持たない）、`value: string | null`（**null=未選択に統一**）、`onChange: (id: string | null) => void`、`includeRootOption?: { id; label }`（MoveDirectoryDialog の「（ルート）」用）、`placeholder`/`emptyLabel`、`disabled`、`label`、`id`。フィルタ/除外/root合成のロジックは持たせず「与えられた options を表示・検索・単一選択する」責務に限定する。未選択は listbox 上で「どの option も `aria-selected` でない」状態として表現し、明示的な空 option は出さない（`emptyLabel` は 0 件時の補助文言）。
- **理由:** 3箇所で共通利用するため。階層・件数・a11y を一元化し、既存の確立済みパターン（tree の `aria-level`、combobox の `aria-activedescendant`）を再利用することで外部依存と車輪の再発明を避ける。

### 4. `MoveNoteDialog` の `<select>` 置き換え

- **対象ファイル:** `app/components/note/list/MoveNoteDialog.tsx`
- **変更内容:** 行107-121 の `<select>` をステップ3のピッカーに差し替え。`tree`（`FlatDirectory[]`）をそのまま options に渡し、選択 id を `target` state に反映。submit ボタンの `disabled={target===""}` ガードは維持。
- **理由:** 件数増・a11y 要件を満たす。`{dir.path}` 表示はピッカー側に移管され、ステップ1で正規化済み。

### 5. `MoveDirectoryDialog` の `<select>` 置き換え（cyclic 除外維持）

- **対象ファイル:** `app/components/directory/MoveDirectoryDialog.tsx`
- **変更内容:** 既存の `flattenDirectoryTree`→`getDescendantIds`→`excludeSubtree` の `options` 構築ロジックはそのまま残し（cyclic 除外は SSOT）、生成済みリストをステップ3のピッカーへ渡す。**現行は root を options 配列に含めたまま `label` を「（ルート）」へ差し替えているが、新方式では root（`id === rootId`）を options から分離し `includeRootOption={{ id: rootId, label: "（ルート）" }}` 側へ回す** — root を二重に出さないこと。`tree[0].id` 送信ロジック・`stopPropagation`・`useEffect` リセットは維持。
- **補足:** `MoveNoteDialog`（ステップ4）は現行どおり root を含む全 `tree` を `/` 表示の選択肢として出す。2ダイアログ間の root 表示は意図的に非対称（現行踏襲、Issue 要件外）。
- **理由:** cyclic 除外という固有事情をピッカーの外（呼び出し側）で完結させ、ピッカーを汎用に保つ。

### 6. `DirectoryPicker` の既存選択 `<select>` 置き換え（二択 UI 維持）

- **対象ファイル:** `app/components/note/editor/DirectoryPicker.tsx`
- **変更内容:** 行96-113 の `<select>`（既存ディレクトリ）をステップ3のピッカーに差し替え。`directoryId`/`onSelectExisting` をピッカーの `value`/`onChange` に接続。`usingNew`（新規名入力中）時の `disabled`、`allowExistingActions` のリネーム/削除ボタン、`allowNestedPath` の新規パス入力部はそのまま維持。`node.name` だけの表示だった既存挙動を、ピッカーでは `path` も併記して階層が伝わる形に改善。「未選択」は `placeholder`/`emptyLabel` で表現。
- **理由:** 二択 UI（既存選択 vs 新規作成）の構造は変えず、選択側だけスケーラブル化。ingestion 経由（`IngestionPreviewForm`/`UploadDialog`）の利用にも `tree` 形は不変なので透過的。

### 7. 仕上げ・整合

- **対象ファイル:** 上記すべて
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。不要になった「空白インデント」関連コメントを除去。`<select>` 前提の既存コンポーネントテスト（`IngestionPreviewForm`/`UploadDialog`）があれば combobox/option ベースへ追従。
- **理由:** プロジェクトの後処理規約に従う。スコープを広げない。

## 設計判断

詳細は `adr.md` 参照。要点:

- **UI 方式**: 検索フィルタ付き＋階層インデント表示の単一選択リスト（combobox+listbox ベース）。完全な展開/折りたたみ tree は移動先選択にはオーバースペック。`aria-level` で階層情報は保持。
- **共通化の粒度**: 1つの汎用ピッカーに集約し、3ダイアログ固有の事情（cyclic 除外・root ラベル・新規作成との二択）はすべて呼び出し側で吸収。ピッカー自身はフィルタ/除外/root合成のロジックを持たない。
- **配置**: ディレクトリ関連 UI なので `app/components/directory/` 配下（sidebar の `DirectoryTree.tsx` と同居）。
- **外部ライブラリ**: 追加しない。React 19 プリミティブと既存パターンで完結。

## リスクと注意点

- **パス変更の波及**: `path` 消費は `MoveNoteDialog`・`MoveDirectoryDialog` の2箇所のみと確認済み。`MoveDirectoryDialog` は root を別ラベル化しているため root の path 値変化は無害。`getDirectoryTreeFn`/`loadDirectoryTreeFlat` の JSON 形は不変。
- **a11y 退行リスク**: combobox/listbox の `aria-controls`/`aria-activedescendant` は「listbox が実在するときだけ」参照する（`NotePickerDialog` の `hasListbox` ガード踏襲）。IME 変換中の Enter 誤確定を防ぐ。Dialog のフォーカストラップとの相性を確認。
- **フォーカス/初期フォーカス**: 検索入力が先頭に来るので Dialog 初期フォーカスは自然。submit ボタンの `disabled` ガードが新ピッカーの選択状態と同期するよう接続する。
- **スコープ膨張の回避**: 展開/折りたたみ・仮想スクロールは実装しない。dto import 経路統一などのリファクタも触れない。
- **既存テストの破壊**: `IngestionPreviewForm`/`UploadDialog` のテストが `<select>` DOM 構造に依存していないか確認し、必要なら combobox/option ベースへ更新。

## テスト方針

- **ユニットテスト（必須・新規）**: `flattenDirectoryTree` のパス正規化（root 配下 `/X`、連続/末尾スラッシュなし、`depth`/`id`/`parentId` 保全）。`getDescendantIds`/`excludeSubtree` のスモーク。
- **コンポーネントテスト（推奨）**: 新ピッカーの (a) フィルタ入力で option 絞り込み、(b) ArrowDown/Enter で `onChange` 確定、(c) `role="option"` に `aria-selected`/`aria-level`、(d) `includeRootOption` でルート表示、を `NotePickerDialog.test.tsx` の様式に倣って追加。
- **既存テストの追従**: `<select>` 前提のテストを combobox/option ベースに更新。
- **手動確認**: 3ダイアログを開き (1) 多階層での絞り込み・キーボード操作、(2) root 配下が `/Documents/Work` 表示で先頭スラッシュ重複が消えている、(3) `MoveDirectoryDialog` で移動中ディレクトリの子孫が候補に出ない（cyclic 除外維持）、を確認。最後に `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）
**修正した点**:
- [P-001]（アーキ視点）`role="option"` に `aria-level` を付与する設計は ARIA 仕様で無効＋ biome lint 抵触の恐れ → ステップ3・ADR-001 を「階層は `path` 表示で a11y に伝える、`aria-level` は付与しない」へ修正。
- [S-001]（要件視点）`MoveDirectoryDialog` の root 表示の移行手順を明確化 → ステップ5に「root を options から分離し `includeRootOption` へ回す（二重表示しない）」を追記。
- [S-001]（アーキ視点）value/未選択セマンティクスの統一 → ステップ3に「`value: string \| null`（null=未選択）に統一、明示的な空 option は出さない」を明記。
- [S-002]（要件視点）2ダイアログ間の root 表示非対称 → ステップ5に「現行踏襲の意図的な非対称」と補足。
- [S-003]（アーキ視点）`FlatDirectory` 直 import を避け構造的型で受ける → ステップ3 props 定義に明記。

**見送った提案とその理由**:
- [S-002]（アーキ視点）既存テスト追従リスクの温度感を下げる提案 → リスク欄に残すが「ほぼ追従不要の見込み」と実装時に判断する。スコープに影響なし。

両視点とも要修正は [P-001] の1件のみで、反映済み。実現可能性・スコープ整合性は問題なしと判断。

