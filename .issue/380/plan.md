# 実装計画 — Issue #380: ノート詳細の DTO 拡張: パンくず中間セグメントのリンク化とバックリンク抜粋表示

**Issue:** #380
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

Issue #356（P11 メタ情報レイアウト再構成）で DTO が情報を持たないため意図的に見送った2点を、DTO 拡張で実現する。

1. **パンくず中間セグメントの個別リンク化** — 各ディレクトリセグメントを `?directoryId=...` リンクにする。
2. **バックリンクの抜粋（snippet）表示** — バックリンクカードに参照元本文の抜粋を表示する。

いずれも presentation だけでは完結せず、application 層の DTO 投影 +（2 は）抜粋生成ロジックが必要。

## スコープ

### 含まれるもの
- `getNoteDetail` の DTO に祖先ディレクトリの構造化パス `{ id, name }[]`（`directorySegments`）を追加。
- `BacklinkDTO` に `snippet: string | null` を追加し、referrer 本文から抜粋を生成。
- `NoteBreadcrumb` を構造化セグメント表示（全セグメントリンク化）に変更。
- `NoteMetaPanel` のバックリンクカードに抜粋を表示。
- `getBacklinks` ユースケースの `toBacklink` 追従。
- integration テストの更新。

### 含まれないもの
- 「参照箇所周辺」を厳密に狙った抜粋（本文先頭スライスで割り切る — 設計判断参照）。
- ディレクトリ階層 UI そのものの改修（パンくず表示の範囲に限定）。
- `directoryPath: string`（slug パス）の廃止 — 後方互換のため据え置く。

## 実装ステップ

### 1. `DirectoryService` に構造化パス生成を追加
- **対象ファイル:** `app/core/domain/directory/service.ts`
- **変更内容:** `computeSegments(dir, repo): Promise<readonly { id: DirectoryId; name: DirectoryName }[]>` を追加。`findAncestors` を呼び、`isChild` の祖先 + `dir` 自身（root の場合は空配列）を root→leaf 順に `{ id, name }` で返す。`computePath` は変更しない。
- **理由:** パスの構造化は domain の責務。`computePath`（slug 連結）は別用途で必要なため非破壊で別メソッドを追加する。

### 2. `BacklinkDTO` に `snippet` を追加
- **対象ファイル:** `app/core/application/dto/note.ts`
- **変更内容:** `BacklinkDTO = { noteId; title; slug; snippet: string | null }`。生成できない/空のときは `null`。
- **理由:** 抜粋テキストの受け皿。必須フィールドにすることで全 projection 箇所の追従漏れを型エラーで検出する。

### 3. `toBacklink` を context 受け取りに変更
- **対象ファイル:** `app/core/application/note/view.ts`
- **変更内容:** `toBacklink(note, context: { snippet: string | null })` に変更（`toNoteListItem` の既存パターンに倣う）。snippet は呼び出し側で生成して渡す。
- **理由:** 純関数 projection に I/O を持ち込まない。生成は usecase 側の責務。

### 4. `getNoteDetail` に DTO 拡張を実装
- **対象ファイル:** `app/core/application/note/getNoteDetail.ts`
- **変更内容:**
  - `GetNoteDetailOutput` に `directorySegments: readonly { id: string; name: string }[]` を追加（`directoryPath: string` は維持）。
  - `dir` 取得後 `DirectoryService.computeSegments(dir.entity, ctx.directoryRepository)` を呼び `{ id: seg.id as string, name: seg.name as string }` に projection。`dir` が見つからない場合は空配列。
  - 各 referrer について `container.htmlSanitizer.toPlainText(referrer.contentHtml).slice(0, 200)` から snippet を生成し（空文字は `.length > 0 ? snippet : null` で `null` に畳む）`toBacklink(referrer, { snippet })` で埋める。
- **理由:** DTO 投影と抜粋生成は application 層の責務。

### 5. `getBacklinks` の snippet 追従
- **対象ファイル:** `app/core/application/note/getBacklinks.ts`
- **変更内容:** `toBacklink` のシグネチャ変更に追従し、同じ snippet 生成（`container.htmlSanitizer.toPlainText().slice()`）を行う。
- **理由:** 同一 DTO が呼び元で挙動差を持たないよう生成を統一する。追加クエリは発生しない（referrer は本文込みで取得済み）。

### 6. `NoteBreadcrumb` を構造化セグメント表示に変更
- **対象ファイル:** `app/components/note/detail/NoteBreadcrumb.tsx`
- **変更内容:** props を `segments: readonly { id: string; name: string }[]`（+ `noteTitle`）に変更。`directoryPath`/`directoryId` props は廃止。各セグメントを `<Link to="/" search={{ ...HOME_SEARCH, directoryId: seg.id }}>` でリンク化。`segments` が空（root 直下）の場合はディレクトリセグメントを描画しない。JSDoc を実態に更新。`key` は累積 id で一意化。
- **理由:** 構造化データを受け取り全セグメントをリンク化する Issue 要件の実現。

### 7. `NoteMetaPanel` に snippet 表示を追加
- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`
- **変更内容:** backlink カード内、`bl.title` の下に `bl.snippet`（非 null かつ非空のとき）を補助テキストで表示。既存トークン/ユーティリティのみ使用、新規 CSS は作らない。
- **理由:** バックリンク抜粋表示の実現。

### 8. `NoteDetail` のブリッジ更新
- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:** `const { note, backlinks, directorySegments } = detail;` とし、`<NoteBreadcrumb segments={directorySegments} noteTitle={note.title} />` に変更。`backlinks` はそのまま渡す（snippet 込み）。
- **理由:** 新フィールドを presentation に橋渡し。

### 9. integration テスト更新
- **対象ファイル:** `app/core/application/note/__tests__/getNoteDetail.integration.test.ts`（`getBacklinks` テストも同居）
- **変更内容:** (a) 多段ディレクトリで `directorySegments` が root→leaf 順で `{id,name}` を返す、(b) root 直下ノートで空配列、(c) backlink の `snippet` が referrer 本文の plaintext 先頭を反映、を検証。
- **シード前提（確定事項）:** 既存 `seedDirectory` は `parentId: null` の擬似 root のみ作るため、(a) には `parentId` を持つ子ディレクトリ（`depth`/`parentId`/`version` を正しく設定）をシードする **子ディレクトリ用ヘルパの追加が必須**。(c) には referrer の `contentHtml` を既存固定文言（`"<p>seed</p>"`）から識別可能な本文に差し替える。
- **理由:** DTO 拡張の回帰防止。

### 10. 検証
- **内容:** `pnpm typecheck && ./node_modules/.bin/biome check --write app && pnpm test:integration`。biome は `./node_modules/.bin/biome` 経由で確認（rtk がコマンドを書き換えるため — メモリ参照）。

## 設計判断

詳細は adr.md を参照。要点:
- **DTO は追加（置換しない）** — `directoryPath: string` を残し `directorySegments` を新設。
- **構造化パスは `DirectoryService.computeSegments` 新設** — `computePath` を非破壊に保つ。
- **抜粋は本文先頭スライス** — 「参照箇所周辺」は過剰実装として割り切る。
- **`getBacklinks` も同じ snippet 生成** — 同一 DTO の挙動差を避ける。

## リスクと注意点

- **後方互換:** `directoryPath` を残すため非 UI consumer はゼロ影響。`BacklinkDTO.snippet` を必須にすることで `toBacklink` の全呼び出し追従漏れを型エラーで検出。
- **パフォーマンス:** `computeSegments` は `findAncestors` 1 回（depth≤10 の点読み）。referrer ごとの `toPlainText` は CPU のみで I/O なし。N+1 は発生しない。snippet は `slice` で短く保つ。
- **テスト影響:** 既存 `directoryPath` アサーションは維持。root 直下シードのみのテストでは `directorySegments` が空配列になる点に注意。

## テスト方針

- **自動（integration）:** 上記ステップ9の3観点。型チェックで consumer 追従漏れを機械検出。
- **手動確認:** `pnpm build && pnpm start` 後、ノート詳細でパンくず中間セグメントが各 `?directoryId=` リンクになること、backlink カードに抜粋が出ることを目視。読み取り専用画面のため mutation 検証は不要。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点（改善提案の取り込み）:**
- ADR-002 の root 除外根拠を「空 name のため」→「`isChild` ガード（`parentId !== null`）」に訂正（要件 S-001 / アーキ）。`DirectoryName.forRoot()` が空文字とは限らない事実に整合。
- 抜粋の slice 長を既存 excerpt に合わせ `slice(0, 200)` に確定。空文字は `.length > 0 ? snippet : null` で明示的に null 畳みする旨を ADR-003・ステップ4に明記（アーキ S-001 / S-002）。
- ステップ9のテストシードを「必要なら追加」→「子ディレクトリ用ヘルパの追加が必須」「referrer 本文を識別可能な文言に差し替え」と確定（要件 S-002 / アーキ S-003）。

**見送った提案:**
- なし（アーキ S-004 は挙動後退なしの確認のみで修正不要）。

両レビュアーともブロッカー（要修正）はゼロ。要件カバレッジ・スコープ整合性・レイヤー責務・後方互換・パフォーマンスのいずれも計画が実コードの契約と整合していることを確認済み。
