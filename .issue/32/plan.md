# 実装計画 — Issue #32: 内部リンク参照フィルタの新規入力 UI (P11 詳細からの導線)

**Issue:** #32
**作成日:** 2026-05-19
**複雑度:** 中〜大規模

---

## 目的

Issue #8 (PR #28) のフォローアップ。`referencingNoteId` フィルタは現状 URL 直叩きと FilterBar chip の解除しか実装されていない。本 Issue では P11 ノート詳細画面に「このノートを参照しているノート一覧を見る」リンクを追加し、自然な入力経路を確立する。あわせて FilterBar chip 表示で UUID 断片しか出ていない現状を改善し、参照中ノートのタイトルが見えるようにする。

## スコープ

### 含まれるもの

1. **P11 ノート詳細画面の導線追加** — `NoteMetaPanel` のバックリンクセクションに「このノートを参照しているノート一覧を見る」リンクを追加し、`/?referencingNoteId=<note.id>` に navigate する
2. **FilterBar chip のタイトル表示** — `?referencingNoteId=<id>` で起動したホームで、chip にノートタイトルを表示する（取得失敗時は既存挙動の UUID 8 文字断片にフォールバック）
3. **chip ラベル生成ロジックの純関数化** — `listSelectors.ts` に `formatReferencingNoteChipLabel` helper を抽出し vitest で単体テスト
4. **動作確認手順** — `.issue/32/testing.md` で SSR / fallback / × 解除を確認

### 含まれないもの

- **FilterBar 上の note picker UI（新規入力モーダル / autocomplete）** — Issue 本文の「必要に応じて」「検討」を YAGNI 判断で見送る。picker は note 一覧検索 + 選択 UX の独立タスク。別 Issue として起票候補（ADR-003 参照）
- **タイトル resolver 失敗時の UI 文言変更**（"不明なノート" 等） — ADR-006 の最小実装方針に揃え、既存 fallback を維持
- **`countByOwner` の filter 反映**（Issue #8 ADR-009 で別 Issue 化済み）
- **search 経路 (`q` 非空) での visibility 入力伝達**（Issue #8 ADR-012）

## 実装ステップ

### 1. `NoteMetaPanel` に `noteId` props を追加してリンクを設置

- **対象ファイル:**
  - `app/components/note/detail/NoteMetaPanel.tsx`
  - `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `NoteMetaPanelProps` に `noteId: NoteId` を追加（`NoteActions` と同じく branded `NoteId` 型で受け取り、`as unknown as string` cast は `NoteMetaPanel` 内に閉じる — レビュー反映 P-B）
  - バックリンクの `<dd>` 内、件数表示の直下に `<Link to="/" search={{ referencingNoteId: noteId as unknown as string }}>このノートを参照しているノート一覧を見る</Link>` を追加（`backlinks.length` の値に関わらず常時表示）。リンクテキストは ADR-004 で pin
  - `NoteDetail.tsx` で `<NoteMetaPanel ... noteId={note.id} />` を渡す（cast は panel 内へ集約）
- **理由:** バックリンクは「このノートが参照しているノート」、新リンクは「このノートを参照しているノート」で意味的に対になる。同じパネル内に並べることが UX 的に自然で、spec/pages/index.md P11「内部リンク先 / バックリンクのナビゲーション」要件にも適合する。`NoteActions` は「編集 / 公開 / 削除」など状態変更操作のグループで、ナビゲーション系のリンクは性格が異なる（ADR-004）

### 2. ノートタイトル解決 loader を追加

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:** `loadReferencingNoteTitle = cache(serverData(...))` を新設
  - 引数: `{ actorUserId: string; noteId: string }`
  - 戻り値: `{ title: string | null }`
  - 実装方針: 既存 `loadPublishStateForNote` の `container.unitOfWorkProvider.run` 直叩きパターンに揃える（行 386 周辺）
  - **catch の範囲を限定する**（レビュー反映 P-C）:
    - `DomainNoteId.create(noteId)` のドメインエラーは try/catch で握って `{ title: null }` を即返す（既存 `loadOwnedNotes` 行 170-180 と同じ transport-boundary パターン）。**ただし** `NoteId.create` の実装は trim/length チェックのみで UUID 形式は検証しないため、`not-a-uuid-string` のような非 UUID 文字列はこの catch には到達せず通過する（空文字列のみ catch される）
    - `noteRepository.findById` 自体は **catch せずに throw を許す**。driver-level の transient error は listing 側 (`loadOwnedNotes`) と同様に `Promise.all` を倒し、ホーム全体が一貫したエラー応答に倒れる方が UX として一貫
    - owner 不一致 / `found === null` は **catch ではなく分岐** で `{ title: null }` を返す（通常制御フロー）。**不正 UUID は `findById` が 0 件で `null` を返すこの分岐に着地する**（review-001 W-S1 反映）
- **理由:**
  - port を増やさず既存 `findById` を再利用（ADR-002）
  - `getNoteDetail` usecase 再利用案は `findReferrers` + directory path 計算まで走り無駄が大きい
  - 広すぎる try/catch は driver-level error をサイレントに握り潰してホームが「listing 500 だけど chip resolver は静かに UUID 断片」という不可解な状態を作りうるため、catch は ID 生成のドメインエラーに限定する

### 3. `/` ルートで `referencingNoteId` 指定時のみ並列取得

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:**
  - `loaders` の import 分解代入に `loadReferencingNoteTitle` を追加
  - `Promise.all` に `baseSearch.referencingNoteId !== undefined ? loadReferencingNoteTitle({ actorUserId, noteId }) : Promise.resolve({ title: null as string | null })` を追加
  - 結果を `<HomePage ... referencingNoteTitle={referencing.title} />` で渡す
- **理由:**
  - 既存の `Promise.all` 並列構造を踏襲（ホームのレイテンシ予算は最遅 promise 律速、追加 RTT なし）
  - `referencingNoteId` 未指定時は no-op で DB 0 クエリ
  - SavedView 復元時は `baseSearch.referencingNoteId` 経由（PR #28 / `.issue/8/adr.md` ADR-007 で往復済み）なので追加対応不要

### 4. props を `HomePage` → `NoteList` → `FilterBar` まで貫通

- **対象ファイル:**
  - `app/components/note/HomePage.tsx`
  - `app/components/note/list/NoteList.tsx`
  - `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - 各層に `referencingNoteTitle?: string | null` を props 追加（透過的中継）
  - `FilterBar` の chip ラベルを `formatReferencingNoteChipLabel(referencingNoteId, referencingNoteTitle ?? null)` 呼び出しに差し替え
- **理由:** props 1 値の string | null を末端まで通すだけで、middle 層は表示判定に関与しない。FilterBar 本体のテスト容易性を維持

### 5. chip ラベル生成 helper を `listSelectors.ts` に抽出

- **対象ファイル:**
  - `app/components/note/list/listSelectors.ts`
  - `app/components/note/list/__tests__/listSelectors.test.ts`
- **変更内容:**
  - `listSelectors.ts` に純関数を追加（レビュー反映 P-A: 既存挙動完全踏襲、省略記号 `…` は付けない）:
    ```ts
    export function formatReferencingNoteChipLabel(id: string, title: string | null): string {
      if (title !== null && title !== "") return title;
      return id.slice(0, 8);
    }
    ```
  - FilterBar 側の chip 表示は既存どおり `参照中: <label>` 形式のプレフィックスを維持し、`<label>` 部分のみ `formatReferencingNoteChipLabel(referencingNoteId, referencingNoteTitle ?? null)` の戻り値を埋め込む（プレフィックス UI 文言は変更しない）
  - 既存 `listSelectors.test.ts` に describe ブロックを追加し、(a) title `"My Note"` → `"My Note"` (b) title `null` → `<id 8 文字断片>` (c) title `""` → `<id 8 文字断片>` の 3 ケースを pin
- **理由:**
  - `slice(0, 8)` のマジックナンバーを一箇所に集約
  - 出力文字列を 1 通りに確定させ（省略記号なし）、既存 FilterBar 行 182 の挙動と完全一致で UX 回帰ゼロ
  - FilterBar 全体の DOM テストを増やさず、純関数の単体テストで分岐を担保
  - 既存 `listSelectors` の「React 非依存ロジックを vitest で検証する」既定路線と整合（ファイル先頭コメント参照）

## 設計判断

主要な設計判断は `.issue/32/adr.md` に記録する。サマリーは以下:

- **ADR-001**: chip タイトル resolver は **実装する**（Issue 本文の "検討" を採用）/ fallback は既存 UUID 8 文字断片を維持
- **ADR-002**: タイトル解決は `noteRepository.findById` 直叩き（既存 `loadPublishStateForNote` パターン踏襲）。`getNoteDetail` usecase の再利用 / port 追加は行わない
- **ADR-003**: FilterBar の note picker UI は本 Issue では **実装しない**（Issue 本文「必要に応じて」を YAGNI 判断で見送り、別 Issue 起票候補）
- **ADR-004**: 新リンクの設置場所は `NoteMetaPanel` のバックリンクセクション内（`NoteActions` は性格が異なるため非採用）

## リスクと注意点

- **権限境界**: `noteRepository.findById` は owner check を持たないため loader 側で `entity.ownerId !== actorUserId` を弾く。これを忘れると他人のノート title が表示され情報漏洩になるので必須
- **削除済みノート**: status を問わず `findById` は entity を返す。trash 状態の参照先 title も表示される（本 Issue では「trashed」注記は付けない、最小スコープ）
- **タイトル変更後の表示遅延なし**: `cache()` はリクエスト粒度なのでページロードごとに再取得される
- **SSR ラウンドトリップ**: `referencingNoteId` 指定時のみ 1 件の `findById`（1 クエリ）増。指定なし時は 0 コスト
- **`NoteMetaPanel` の他利用なし**: grep で確認した限り `NoteDetail.tsx` のみが呼び出し元。props 追加で他破壊なし
- **TanStack Router `<Link>` 型推論**: `noteListSearchSchema` に `referencingNoteId` 既定義のため search 型エラーなし
- **空文字 title**: 実データ上は `note.title` が空にはならない想定だが、helper は念のため `title === ""` も fallback 扱いにする（防御）

## テスト方針

- **unit (vitest):**
  - `formatReferencingNoteChipLabel` の 3 ケース（title あり / null / 空文字列）
- **integration:**
  - `loadReferencingNoteTitle` の resolver ロジック自体は thin wrapper（`findById` + owner check）であり、`getNoteDetail.integration.test.ts` の owner mismatch / not found ケースが同種ロジックを既にカバー済み。新規 integration は追加しない方針（loaders.ts に対する専用 test 前例なし）
- **手動 / E2E:** `.issue/32/testing.md` で以下を確認
  - P11 で新リンクが見え、クリックで `/?referencingNoteId=<id>` に遷移し chip にタイトルが出る
  - 直接 URL `/?referencingNoteId=<自分のノート id>` でも chip タイトルが出る
  - 他人のノート id / 不正 UUID / 存在しない id を URL に入れても chip は UUID 8 文字断片で残り、ページが壊れない
  - chip × クリックで `referencingNoteId` がクリアされる（既存挙動の維持）
  - SavedView に `referencingNoteId` 含めて保存 → `?viewId=...` で復元時に chip タイトルが出る
- **静的検証:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | 部分採用 | 部分採用 |
| 取り込んだ点 | 全体構成（resolver + props 貫通 + chip title） / 設計判断の網羅 | resolver の `findById` 直叩き（`getNoteDetail` 流用より軽量）、`listSelectors` への純関数 helper 抽出、テスト戦略 | 「note picker は別 Issue」「リンクは 0 件でも常時表示」の判断ロジック |
| 採用しなかった点 | `getNoteDetail` を resolver から再利用する案 | （主要案はほぼ取り込み） | resolver / chip タイトル resolver も実装しない案（Issue 本文の "検討" を尊重して採用） |

## レビュー反映

### 修正した点

- **P-A: chip ラベル文字列の最終形を確定** — `formatReferencingNoteChipLabel` の戻り値を「title あれば title、なければ `id.slice(0, 8)`（省略記号 `…` なし）」に確定。FilterBar 側の `参照中: <label>` プレフィックスは既存 UI を維持。既存挙動完全踏襲で UX 回帰ゼロ。テストで 3 ケースを pin。
- **P-B: `NoteMetaPanelProps.noteId` を `NoteId` 型で受ける** — `NoteActions` と同じく branded `NoteId` 型で受け取り、`as unknown as string` cast は `NoteMetaPanel` 内に閉じる。`NoteDetail.tsx` からは `<NoteMetaPanel ... noteId={note.id} />` のみ。
- **P-C: loader の try/catch を ID 生成エラーに限定** — `loadReferencingNoteTitle` 内では `DomainNoteId.create(noteId)` の ValidationError のみ catch して `{ title: null }` を返し、`noteRepository.findById` の driver-level error はそのまま throw を許す。owner 不一致 / `found === null` は通常制御フローの分岐で扱う。これにより listing 側と chip resolver 側のエラー応答が一貫する。

### 取り込んだ改善提案

- **リンク文言と表示判断を ADR で pin** — リンクテキスト「このノートを参照しているノート一覧を見る」と「backlinks 0 件でも常時表示する理由」を ADR-004 に明記（後者は URL 共有 / SavedView 起動経路としての有用性）。
- **SavedView 復元のクロスリンクを testing.md に記載** — `viewQueryToSearch` の復元処理（`listSelectors.ts` 行 162-164 付近）への参照を testing.md の SavedView 確認項目に添える予定。

### 見送った提案とその理由

- **フォロー Issue（note picker）の起票運用化** — 別 Issue 起票は実装フェーズの PR description で扱うのが自然なので、本 plan からは pin しない（ADR-003 の "起票候補" 表現で十分）。
- **`ResolvedHints` 集約型での props 設計** — 1 値のみの本 Issue では過剰投資（YAGNI）。将来 hint resolver が 2-3 値に増えた段階で別 Issue にて検討。
- **cache() の参照同一性メモ化に関する注釈追加** — 既存 `loadPublishStateForNote` と同じ前提で運用しており、本 Issue で初出ではない。注釈は不要。
- **ownership check 重複の閾値メモ** — ADR-002 のトレードオフ項に「`getNoteDetail` 再利用回避」の論拠で実質カバー済み。3 箇所目が必要になった時点で usecase 抽出を再検討する。
