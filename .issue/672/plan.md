# 実装計画 — Issue #672: ノート詳細のパンくずの起点「すべてのノート」を廃止する

**Issue:** #672
**作成日:** 2026-06-13
**複雑度:** 小規模

---

## 目的

ノート詳細ページ（P11）のパンくず先頭にある固定リンク「すべてのノート」を廃止し、ディレクトリセグメントとノートタイトルだけを表示する。階層上の位置を伝えるパンくず本来の役割に絞り、横幅消費・折り返しを減らす。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ノート詳細のパンくずに「すべてのノート」リンクが表示されない | Issue本文「提案」 | 1 |
| AC-2 | ディレクトリ階層を持つノートでは `<dir1> › <dir2> › <ノートタイトル>` の形で、先頭に余分な区切り（›）が付かずに表示される | Issue本文「提案」 | 1 |
| AC-3 | ルート直下のノート（`segments` が空）ではノートタイトルのみを表示する（パンくず nav は残す。区切りリンクは出さない） | ユーザー確認（要検討事項の決定: タイトルのみ表示） | 1 |
| AC-4 | 各ディレクトリセグメントは従来どおりホーム一覧の `directoryId` 絞り込みリンクとして機能する | 既存挙動の維持 | 1 |
| AC-5 | `NoteBreadcrumb` の JSDoc が新しい表示仕様に整合している | Issue本文「提案」 | 1 |
| AC-6 | パンくずの表示仕様（「すべてのノート」非表示・先頭区切りなし・ルート直下はタイトルのみ）を検証する自動テストがある | Issue本文「対象」 | 2 |

## スコープ

### 含まれないもの
- `NoteMetaPanel.tsx` のメタ情報パス表示で使われる「すべてのノート」フォールバック（Issue #356 ADR-002 由来）。これはパンくずではなくメタパネルのパス表示であり、本Issueの対象外。
- 中間ディレクトリセグメントのリンク粒度（Issue #356 ADR-002 で別Issue化済みの論点）。本Issueは「すべてのノート」起点の廃止のみ。
- ヘッダー等のホーム導線の追加・変更。既存ナビゲーション（サイドバー「すべてのノート」、設定の「すべてのノートに戻る」等）で担保されている前提（調査で確認済み）。

## 調査結果

- 関連ファイル:
  - `app/components/note/detail/NoteBreadcrumb.tsx` — 対象コンポーネント。`<Link to="/" search={HOME_SEARCH}>すべてのノート</Link>` を先頭に固定描画し、各セグメントとタイトルの前に区切り（ChevronRight）を置いている。
  - `app/components/note/detail/NoteDetail.tsx:127` — `<NoteBreadcrumb segments={directorySegments} noteTitle={note.title} />` で利用。すぐ下の `h1` で `note.title` を再掲。
  - `app/components/note/detail/__tests__/NoteDetail.test.tsx` — `NoteBreadcrumb` を `() => null` で**完全にモック**しているため、パンくずの描画は検証していない。Issue本文は本ファイルの更新を挙げているが、ここはモック箇所で更新対象にならない（下記「設計」参照）。
- あるべきアーキテクチャ: `NoteBreadcrumb` はプレゼンテーション層の純粋表示コンポーネント（props だけで描画、I/O なし）。CLAUDE.md のスタイル規約（utility-first、`data-*` 状態スタイル）に従う。変更はUI層のみで完結し、ドメイン/ユースケース/アダプターに影響しない。
- 既存実装の状態: コンポーネントは純粋で良好。Issue が求める変更は描画ロジックの調整のみ。ホーム導線はサイドバー（`Sidebar.tsx:170`）・設定（`SettingsSidebarNav.tsx`）・ゴミ箱（`TrashList.tsx`）に既存。
- 依存関係: `directorySegments` は `loadNoteDetail` が返す `{ id, name }[]`（Issue #356 で導入済み）。本変更で props 形は変えない。

## 設計

### ドメインモデルへの影響
なし（純粋表示コンポーネントの描画変更のみ）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
`NoteBreadcrumb` の描画を「先頭固定リンク + 各要素前に区切り」から「**要素間にのみ区切り**」へ変更する。

- 表示要素 = `[...segments, title]`。区切り（ChevronRight）は**要素と要素の間にのみ**置く（先頭要素の前には置かない）。
  - 非ルート: `seg1 › seg2 › title`
  - ルート直下（segments 空）: `title` のみ（先頭区切りなし）
- `<Link to="/" search={HOME_SEARCH}>すべてのノート</Link>` を削除。
- `nav`（`aria-label="パンくず"`）と各要素の役割（セグメント = `directoryId` 絞り込みリンク、タイトル = `aria-current="page"`）は維持。
- JSDoc を新仕様に更新（「すべてのノート」起点の記述を削除し、要素間区切り・ルート直下はタイトルのみを記述）。

## 実装ステップ

### 1. `NoteBreadcrumb.tsx` の描画ロジック変更

- **対象ファイル:** `app/components/note/detail/NoteBreadcrumb.tsx`
- **変更内容:**
  - 先頭の `<Link>すべてのノート</Link>` と、それに紐づく `HOME_SEARCH` 単独 import の要否を見直す（セグメントリンクは `{ ...HOME_SEARCH, directoryId }` で引き続き使用するため import 自体は残る）。
  - 区切り（ChevronRight）を「要素間のみ」に出す描画へ変更。セグメント列の先頭に区切りを付けない／タイトル前の区切りは「前に要素があるとき（segments が1つ以上 or ルート直下でない）だけ」出す。
  - ルート直下（segments 空）は `aria-current="page"` のタイトルのみを描画。
  - JSDoc を新仕様へ更新。
- **理由:** AC-1〜AC-5。先頭リンク廃止と先頭区切り抑止を両立する。

### 2. パンくず表示の自動テスト追加

- **対象ファイル:** `app/components/note/detail/__tests__/NoteBreadcrumb.test.tsx`（新規）
- **変更内容:** `@tanstack/react-router` の `Link` をモック（既存 `NoteMetaPanel.test.tsx` と同方式）して `NoteBreadcrumb` を描画し、(1)「すべてのノート」が出ないこと、(2) 非ルートで `seg › seg › title` 順かつ先頭に区切りが付かないこと、(3) ルート直下でタイトルのみ表示されること、(4) セグメントが `directoryId` 絞り込みリンクであること、を検証する。
- **理由:** AC-6。`NoteDetail.test.tsx` は `NoteBreadcrumb` をモックしており描画を検証できないため、パンくず専用のテストを新設するのが適切（Issue本文の「NoteDetail.test.tsx 更新」の意図＝パンくず挙動の自動検証を、実態に即した場所で満たす）。

## リスクと注意点

- ルート直下ノートで「タイトルのみ」になるとパンくずが nav として情報量ゼロに見えるが、ユーザー確認済みの決定（タイトルのみ表示）。h1 とタイトルが二重に出る点も許容と確認済み。
- 区切りロジックを「要素間のみ」に変える際、先頭区切りの取りこぼし／二重区切りに注意（テストAC-2でガード）。

## テスト方針

- ユニット: 新規 `NoteBreadcrumb.test.tsx`（AC-1〜AC-4, AC-6）。
- 既存 `NoteDetail.test.tsx`（notFound 挙動）が壊れないこと（`NoteBreadcrumb` モックのため影響なし想定）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。
- ブラウザ検証: 非ルート／ルート直下の両ノートでパンくず表示を目視確認（testing.md）。
