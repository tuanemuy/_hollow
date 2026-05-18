# 実装計画 — Issue #2: [spec-sync] frontend: P18 タグ管理画面に統合（マージ）機能と削除時ブラックリスト化が未実装

**Issue:** #2
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

P18 タグ管理画面で「既存タグへのマージ（統合）」が UI から実行できない状態を解消し、spec/pages/index.md の P18 仕様（リネーム / 統合 / 削除によるブラックリスト化）を満たす。バックエンド側（`mergeTags` usecase / `mergeTagsFn` server function / `deleteTag` 内の `tagBlacklistRepository.add`）はいずれも実装済みのため、本 Issue は **UI レイヤーのみの作業**で完結する。

## スコープ

### 含まれるもの

- `TagActions.tsx` への「統合」ボタン追加
- マージ先選択ダイアログ（`MergeTagDialog.tsx`）の新規作成
- `TagManager.tsx` から `TagActions` へのマージ候補（自分以外の同オーナータグ）受け渡し
- 削除確認文言の更新：spec の「ブラックリスト化（再抽出防止）」挙動をユーザーが理解できるよう明示

### 含まれないもの

- **「一括処理ジョブの進捗表示」** — Issue 本文の「対応方針」セクションに含まれず、現状 `mergeTags` / `deleteTag` は UoW 内同期実行で進捗イベント基盤が未整備のため、本 Issue では対応しない（後続 Issue 化が必要なら別途検討）。
- **D6 シナリオの「リネーム結果が既存タグと衝突した場合のオートマージ確認フロー」** — 対応方針はマージ usecase の UI 接続のみを target としているため切り出す。
- **バックエンド変更** — `mergeTags` usecase / server function / `deleteTag` ブラックリスト登録は実装済みで、新規実装も挙動変更も行わない。
- **UI 側のユニットテスト追加** — `app/components/tag/__tests__/` は現状存在せず、`MoveNoteDialog` 等の既存ダイアログコンポーネントも単体テストを持たないため、既存規約に合わせてレンダーテストは追加しない。usecase 側の統合テスト（`app/core/application/tag/__tests__/`）は既存で十分。

## 実装ステップ

### 1. `MergeTagDialog.tsx` を新規作成

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`（新規）
- **変更内容:**
  - props: `sourceTagId: string`, `sourceName: string`, `candidates: readonly { id: string; name: string }[]`, `open: boolean`, `onClose: () => void`
  - `MoveNoteDialog` と同じ構造（`dialog-backdrop` / `dialog` / `dialog-title` / `dialog-actions` クラス、`role="dialog"` + `aria-modal="true"` + `aria-label`、`<form>` の `onSubmit` で `event.preventDefault()`）
  - `<select>` でマージ先タグを 1 件選択（デフォルト `""`、未選択時は実行ボタン disabled）
  - **状態管理は `MoveNoteDialog` と同形でダイアログ内に閉じる**: `useTransition` + `isPending` + `useServerFn(mergeTagsFn)` + ローカル `error` ステート。親側の `TagActions` の `isPending` とは独立させる（モーダルなので物理的に親ボタンはクリック不可、機能上の不整合なし）
  - 実行時に `{ data: { sourceTagId, targetTagId } }` で呼び、`router.invalidate()` → `onClose()`
  - エラーは `extractSerializedError` + `displayError` で `form-error` 表示（`MoveNoteDialog` と同形）
  - 確認文言: 「`#{sourceName}` を `#{target.name}` に統合します。`#{sourceName}` は削除され、参照ノートは `#{target.name}` を持つよう更新されます。」
- **理由:** ダイアログを分離することで `TagActions` の責務を「ボタン群と編集ステート」に閉じ込められ、`MoveNoteDialog` パターンと並列で読み手の認知負荷を最小化できる。

### 2. `TagActions.tsx` に「統合」ボタンと削除確認文言の更新を追加

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:**
  - props に `candidates: ReadonlyArray<{ id: string; name: string }>` を追加
  - `useState<boolean>` で `isMergeOpen` を管理
  - 非編集モードのボタン群に「統合」を追加（`candidates.length === 0` の場合は非表示）。クリックで `setIsMergeOpen(true)`
  - 編集中（`isEditing`）はマージ・削除ボタンも従来通り非表示
  - `<MergeTagDialog>` を条件付きレンダリング（`open={isMergeOpen}`、`onClose={() => setIsMergeOpen(false)}`）
  - `onDelete` の `confirm` 文言を以下に変更:
    > `タグ "#{name}" を削除します。参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。続行しますか？`
- **理由:** マージ操作の起点となる UI を既存の rename/delete と同列に追加する。削除確認文言の更新は spec が要求する「ブラックリスト化」挙動を UX に反映する最小変更（バックエンドの挙動には変更なし）。

### 3. `TagManager.tsx` でマージ候補を組み立て `TagActions` に渡す

- **対象ファイル:** `app/components/tag/TagManager.tsx`
- **変更内容:**
  - `tags.map((tag) => ...)` のループ内で、`candidates = tags.filter((t) => t.id !== tag.id).map((t) => ({ id: t.id as unknown as string, name: t.name }))` を構築して `TagActions` に渡す
  - **比較は branded `TagId` のまま `.filter()` で行い、props として子に渡す段階で `as unknown as string` に落とす**（既存 `TagActions` の `tagId={tag.id as unknown as string}` と同じパターン）。`TagId` ブランドが UI 層を跨ぐことはなく、`mergeTagsFn` まで string で流れる
  - 別ファイルへの抽出は行わず、インラインの filter/map で十分（タグ数は `TAG_RESOLVE_LIMIT = 200` で頭打ち）
- **理由:** RSC 側で既に取得済みの `tags` を再利用することで追加フェッチを発生させない。Client 側で fetch するとダイアログを開く度のラウンドトリップが必要になるため、parent props 経由が最も整合的かつパフォーマンスにも優しい。

## 設計判断

- **マージ先選択 UI 形式 = モーダル + `<select>`**: `MoveNoteDialog` で確立済みのプロジェクト規約に合わせる。Combobox や検索付きは spec 要求外。詳細は ADR-001。
- **マージ候補は親 RSC から props で受け渡し**: 子側で別途 server fn を呼ぶより、既に支払い済みの `loadTagsForOwner` を再利用。詳細は ADR-002。
- **削除確認文言を更新（UI のみ）**: ブラックリスト化挙動を UX に反映する最小変更。バックエンドは無変更。詳細は ADR-003。
- **一括ジョブ進捗表示はスコープ外**: Issue 本文の対応方針に含まれず、現状の usecase は同期実行であり進捗イベント基盤も存在しない。詳細は ADR-004。
- **同一タグ選択ガードは UI 側で**: マージ候補から source を除外することで未然に防止。usecase 側 `TagService.computeMergePlan` でも distinct 検証されており二重防御になる。

## リスクと注意点

- **タグ数 200 超のケース**: `loadTagsForOwner` は `TAG_RESOLVE_LIMIT = 200` で打ち切る。200 超のタグへのマージは候補に出ない。spec / 現行利用想定では問題ないが、将来 server-side 検索 API が必要になる可能性は残る（本 Issue ではスコープ外）。
- **mergeTags は破壊的（source タグが消える）**: ダイアログ文言で明示する。
- **楽観ロック衝突**: `mergeTags` 内で `tagRepository.save(..., expectedVersion)` を実行するため並行編集で `OptimisticLockError` の可能性あり。`extractSerializedError` + `displayError` の既存ハンドリングで吸収される。リトライ UI は追加しない。
- **並行操作で source タグが消失したケース**: ダイアログ open 中に他クライアントが source を削除しても、`router.invalidate()` 経由で `TagManager` が再フェッチされ `TagActions` 自体が unmount されるため、ダイアログも消える。明示的なハンドリングは不要。
- **アクセシビリティ**: `aria-modal` / `role="dialog"` / `aria-label` を付与（`MoveNoteDialog` と同等）。フォーカストラップはプロジェクト全体で未実装のため本 Issue でも追加しない。
- **`affectedCount` は UI に表示しない**: `router.invalidate()` でリストが更新されるためユーザーには変化が見える。トースト基盤がプロジェクトに存在せず、追加するのはスコープ外。

## テスト方針

`pnpm typecheck && pnpm lint:fix && pnpm format` を変更後に必ず実行。

**手動確認シナリオ（testing.md に詳細）:**

1. タグを 2 つ以上作成 → 一方の「統合」ボタン押下 → ダイアログで相手を選択 → 実行 → 元タグが消え、対象タグの `noteCount` が増えていること
2. タグが 1 個のみのとき「統合」ボタンが表示されないこと
3. 「削除」を押下 → 新しい確認文言が表示されること。実行後タグが消え、本文中に同名タグを記述しても自動抽出されない（ブラックリスト挙動）
4. マージ実行中に他のアクションボタンが disabled になること
5. エラー（例: 楽観ロック）が `form-error` で表示されること

**自動テスト:**
- 既存の usecase 統合テスト（`app/core/application/tag/__tests__/`）は無変更で実行し回帰がないことを確認。
- UI 単体テストは既存規約に合わせ追加しない。

## レビュー反映

### 修正した点
- **[S-002 coverage / S-002 feasibility への対応]** ステップ 1（MergeTagDialog）に「状態管理は `MoveNoteDialog` と同形でダイアログ内に閉じる」一文を追加。親側 `isPending` との独立性とその根拠（モーダルゆえ親ボタンは物理的にクリック不可）を明示。
- **[P-001 / S-003 feasibility への対応]** ステップ 3（TagManager）に「比較は branded `TagId` のまま filter、props で `as unknown as string` に落とす」「`TagId` ブランドが UI 層を跨がない」旨を明記。
- **[S-005 feasibility への対応]** リスクセクションに「並行操作で source タグが消失したケース」の項を追加。`router.invalidate()` 経由で TagActions が unmount される旨を明示。
- **[S-003 coverage への対応]** testing.md にブラックリスト挙動を確認するための具体手順（バックエンドが同期実行であり、削除直後にノート編集 → 同名タグ記述 → 保存後に自動抽出されない、を 1 オペで確認できる）を盛り込む方針。

### 取り込んだ改善提案
- **[S-001 coverage / S-001 feasibility]** ADR-004 に対応する形で、本 Issue クローズ時の取り扱いを Phase 4 で検討する旨を明示。`gh issue list` で既存の「P18 進捗表示」関連 Issue がなければ起票、あればコメントで本 Issue クローズの情報を残す。

### 見送った提案とその理由
- **[S-004 feasibility]** 「統合」ボタンを `disabled + tooltip` で常に表示する案 — 候補ゼロのケース（タグが 1 個のみ）は P18 画面では初期セットアップ直後の極めて限定的な状況であり、`disabled` で残すと「機能はあるが今は使えない」という UI ノイズになる。`candidates.length === 0` のときは非表示で確定。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|---|---|---|
| ベース採用 | ○（モーダルダイアログパターン + 削除文言更新） | ○（MergeTagDialog 分離） | △（候補組み立てインライン採用） |
| 取り込んだ点 | `MoveNoteDialog` パターン踏襲、削除確認文言更新 | コンポーネント分離による責務明確化 | `buildMergeCandidates` 純粋関数の抽出は不要と判断（YAGNI） |
| 見送った点 | — | 純粋関数抽出 + 単体テスト追加（既存規約に存在せず過剰） | TagActions 内へのインライン `<select>`（責務が混ざる） |
