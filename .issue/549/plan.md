# 実装計画 — Issue #549: P11 ノート詳細 モック完全追従に必要な backend 拡張

**Issue:** #549
**作成日:** 2026-06-07
**複雑度:** 中〜大規模
**ブランチ:** issue/549/p11-backlink-meta-wikilink（main から分岐）

---

## 目的

#540 で死にコード回避・スコープ肥大回避のため見送った、P11 ノート詳細モック追従の backend 変更を伴う 2 点をまとめて対応する。

- 系統A: バックリンクカードのディレクトリパス・メタ行（#540 C-2）
- 系統B: ノート本文の内部リンク（wikilink）/ hashtag のピル表示（#540 C-3）

## 前提の裏取り（重要）

計画立案時、確定モックの状態を main 基準で再確認した（初稿プランナーは作業ブランチ issue/532 の古いモックを読んでおり系統Aを誤判定していたため訂正）。

- **main の `spec/design/pages/P11-note-detail.html` は系統A・系統B 双方を含む**。
  - `.backlink-meta`（CSS 614行付近）: `font-size:11px` / `color:var(--color-ink-tertiary)` / `text-transform:uppercase` / `letter-spacing:0.06em`。DOM はディレクトリパス breadcrumb（例: `Research / 書籍要約`、`プロジェクト`、`日記 / 2026`）を `/` 連結で表示。**大文字化は CSS が行う**（DOM は素のディレクトリ名）。
  - `.wikilink`（488行）: surface ピル + `::before` アクセントドット + hover。`.hashtag`（512行）: accent 素テキスト + hover underline。本文 DOM で `<a class="wikilink">` / `<a class="hashtag">` として使用。
- よって系統A・系統B とも本 Issue のスコープとして確定。

## スコープ

### 含まれるもの

- `BacklinkDTO` にディレクトリパス（`directorySegments`）を追加し、`getNoteDetail` / `getBacklinks` の投影で算出・供給
- `NoteMetaPanel` のバックリンクカードに `backlink-meta` 行を追加（モック準拠）
- ノート本文の表示時レンダリングで `[[wikilink]]` → `<a class="wikilink">` / `#hashtag` → `<span|a class="hashtag">` へマークアップ化（表示専用の read path）
- `.note-detail-content` 配下に `.wikilink` / `.hashtag` の CSS 追加（ADR-002 の documented exception）
- 対応する単体・統合テスト

### 含まれないもの

- 編集側 WYSIWYG（#287 / #77-80）への変更
- 保存される `contentHtml` の改変（`[[...]]` / `#...` の verbatim 保持という既存不変条件は死守）
- export パイプライン（`export/markdownRenderer.ts` / `htmlRenderer.ts`）の挙動変更（textual 素通しが仕様）
- wikilink の本文再解決（保存時解決 `resolvedNoteId` を真実とする）
- 公開ノート詳細（`PublicNoteDetail.tsx` / `getPublicNote`）・P11h 過去版閲覧・法務ページなど `.note-detail-content` を共有する他画面のレンダリング追従（レビュー S-101 反映。本 Issue は auth の `NoteDetail`/`getNoteDetail` に閉じる。これらでは `[[...]]`/`#...` は生テキストのまま。フォローアップ候補）

## 実装ステップ

### 系統A: バックリンクのディレクトリパス

> **前提の訂正（レビュー P-001 反映）:** 主ノートの `directorySegments` は `GetNoteDetailOutput` に既に実装済みで `NoteMetaPanel` のプロパティ「場所」行まで配線済み。本 Issue で新規追加するのは **バックリンク（referrer）単位の** `BacklinkDTO.directorySegments` のみ。主ノート側は流用するだけで重複追加しない。

#### 1. `BacklinkDTO` にディレクトリパス情報を追加

- **対象ファイル:** `app/core/application/dto/note.ts`
- **変更内容:** `BacklinkDTO` に `directorySegments: readonly { id: string; name: string }[]` を追加（主ノート breadcrumb と同構造）。大文字化はプレゼンの CSS（`uppercase`）で行うため DTO は素の name を保持。`directoryPath` 文字列ではなく segments を採用する理由は breadcrumb 既存構造（`DirectoryService.computeSegments`）と整合し表示自由度が高いため。
- **理由:** 表示元データを application 層で供給するのが投影責務の所在。

#### 2. `toBacklink` の投影を拡張

- **対象ファイル:** `app/core/application/note/view.ts`
- **変更内容:** `toBacklink(note, { snippet, directorySegments })` のように context で `directorySegments` を受け取り DTO へ流す。segments の算出は repo を持つ usecase 側で行い、`toBacklink` は純投影のまま保つ。

#### 3. `getNoteDetail` で referrer ごとに directorySegments を算出

- **対象ファイル:** `app/core/application/note/getNoteDetail.ts`
- **変更内容:** referrers（preview 最大 5 件）の `directoryId` 群について、ステップ4で `DirectoryService` に追加する一括 segments 構築関数（ツリー 1 回取得）を使って segments を求め `toBacklink` に渡す。算出失敗（dir なし）時は `[]`。
- **理由:** 主ノートと同じ算出経路を流用し一貫性を保つ。`getBacklinks` と同じ一括関数を使うことでクエリも `O(1)` に揃える。

#### 4. `getBacklinks` でも同様に算出

- **対象ファイル:** `app/core/application/note/getBacklinks.ts`、`app/core/domain/directory/service.ts`
- **変更内容（レビュー P-002 反映・N+1 を必須対応に格上げ）:** `DirectoryService.computeSegments` は内部で `repo.findAncestors` をディレクトリごとに 1 クエリ発行するため、referrer ごとに呼ぶと `O(referrers)` クエリになる（同一 UoW 内・D1 で直列化されがちで `Promise.all` の効果は限定的）。これを避けるため、`DirectoryService` に **`findTree(ownerId)` を 1 回取得 + メモリ親子マップで複数ディレクトリの segments を一括構築する純関数**を追加する（既存 `collectSubtreeIds` の「ツリー 1 回 + メモリ走査」パターンに倣う）。referrer 群は同一 owner なのでツリー 1 回で全 segments を解決でき、クエリは `O(1)`。`getNoteDetail`（preview 最大 5 件）も同関数を流用する。
  - シグネチャ案（レビュー S-101）: `computeSegmentsForMany(ownerId, dirIds, repo): Promise<ReadonlyMap<DirectoryId, readonly {id; name}[]>>`。ルート/欠落 dir は空配列。既存 `computeSegments`（単発・他箇所利用）は残し、新関数を追加する。
- **理由:** DTO 拡張に伴い両生成箇所を整合させる（片方だけだと型不整合・表示欠落）。`getBacklinks` は全件・上限なしのため N+1 は必須で潰す。

#### 5. `NoteMetaPanel` のバックリンクカードに meta 行を追加

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`（および同等のバックリンク描画箇所があれば）
- **変更内容:** 各バックリンクの `directorySegments` を `/` 連結 + uppercase（`uppercase tracking-[0.06em] text-[11px]` 等の utility、tokens は既存変数）で title の上に表示。空 segments（ルート直下）は非表示。main モック（`.backlink-meta`）準拠。

### 系統B: wikilink / hashtag 表示レンダリング

#### 6. 表示用ノート本文レンダリング port を新設

- **対象ファイル（新規）:** `app/core/domain/note/ports/noteBodyRenderer.ts`
- **変更内容（レビュー P-003 反映・入力をドメイン VO に固定）:** `renderForDisplay(html: ContentHtml, refs: readonly InternalLinkRef[]): string` の純変換 port を定義。入力は保存済み body HTML + **ドメイン VO の `InternalLinkRef[]`**（DTO ではなく）。理由: 呼び出しを DTO 化前のエンティティ（`found.entity.internalLinkRefs`）から行うことで port をドメインに置く整合を保ち、かつ `InternalLinkRef` が `target`（生）と `resolvedNoteId` を**両方**持つため本文トークンとの突き合わせ・href 解決が正確になる（DTO は `target` が `resolvedNoteId` に書き換わり生 target を失う）。出力は表示用 HTML 文字列。`[[target|display]]` → `<a class="wikilink">`、`#hashtag` → hashtag 要素。
- **トークン↔ref マッチングキー（レビュー S-103 反映）:** 本文トークンと refs の突き合わせは `(kind, target)` キーで行う（`extractMetadataFromHtml` / `resolveInternalLinks` と同一: title は trim、id は UUID 判定）。`kind`/`target` はトークンから再導出可能なので、refs は実質 `resolvedNoteId` 供給専用。レンダラはトークンから `kind:target` を作り Map 引きで `resolvedNoteId` を得る。
- **理由:** 「保存 body は verbatim 維持」「表示時のみマークアップ化」を型で表現。export とは別 port なので export に影響しない。`HtmlSanitizer`/`MarkdownConverter` と同じく port はドメイン・実装は adapter の構図。

#### 7. adapter 実装を追加

- **対象ファイル（新規）:** `app/core/adapters/renderer/noteBodyRenderer.ts`（レビュー P-004/P-101 反映。実際の命名規約は「ディレクトリ=関心名（`sanitizer/`/`markdown/`）/ ファイル=関心名（`htmlSanitizer.ts`/`markdownConverter.ts`）/ クラス=技術プレフィクス（`UltrahtmlHtmlSanitizer`/`MarkdownItMarkdownConverter`）」。よってファイルは関心名 `noteBodyRenderer.ts`、**クラスは `UltrahtmlNoteBodyRenderer`**。表示レンダリングは sanitization と別関心なので `renderer/` を新設）
- **変更内容:** sanitizer adapter が使う `ultrahtml` の AST walk を流用し **text node のみ**走査。次を変換対象から除外する: (1) `<pre>` / `<code>` 祖先配下の text node（レビュー S-003 反映 — コード内 `#include` / `[[...]]` の誤変換防止。`extractMetadataFromHtml` がコード内も抽出する既存仕様とは別に、表示側は祖先判定で明示スキップする）、(2) 既存 `<a>` 配下、(3) 属性値内（text node 限定で自然に回避）。マッチした箇所だけ要素化。XSS: target/display を必ずエスケープ。
  - wikilink: `kind=id`（解決済み = `resolvedNoteId` あり）→ note 詳細リンク `/notes/$noteId`、`kind=title` 未解決 → 非リンク（`<span class="wikilink" data-unresolved>` 等）。
  - hashtag: **現状タグ絞り込み一覧ルートは未提供**（`app/routes/_app/tags/` は `TagManager` 管理画面の `index.tsx` のみ。レビュー S-102 反映）。よって**初期実装は `<span class="hashtag">` の非リンクを既定**とする。将来タグ絞り込みルートが追加されたら `<a class="hashtag" href=...>` に切り替える（モックは `<a>` 形だが現状導線が無いため非リンク）。
- **パターン再利用（レビュー P-001/coverage 反映）:** `INTERNAL_LINK_PATTERN`（`note/service.ts` 58行・**非 export**）と `HASHTAG_PATTERN`（`tag/service.ts` 31行・**非 export**。note 側ではない点に注意）を再利用するため、両ドメインサービスから **export 化して単一ソース化**する。`/g` 付き正規表現は `lastIndex` 状態を持つので、レンダラ側では `matchAll`（毎回新規イテレータ）を使うか正規表現を都度複製して状態共有を避ける。
- **理由:** `markdownConverter.ts` の verbatim 方針と sanitizer の XSS 教訓（PR #493 属性ブレイクアウト修正、`escapeAttrValue`/`escapeTextValue`）を踏襲。正規表現単純置換ではなく text-node 限定 + 祖先判定が安全。

#### 8. DI 配線

- **対象ファイル:** `app/core/application/di/types.ts` / `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `RequestContainer` に `noteBodyRenderer` フィールドを追加し、`serverCloudflare.ts` の adapter 構築箇所で `new UltrahtmlNoteBodyRenderer()` を注入（`UltrahtmlHtmlSanitizer` / `MarkdownItMarkdownConverter` と同列）。
- **注意（レビュー S-102 反映）:** `ConsumerContainer = RequestContainer & ...` なので、**consumer container 構築箇所にも同フィールドを追加**しないと型エラーになる。request-path port 追加と同じ波及。

#### 9. 表示用 HTML の投影／供給

- **対象ファイル:** `app/core/application/note/getNoteDetail.ts`（+ 出力型 / `app/components/note/detail/NoteDetail.tsx`）
- **変更内容:** 保存 body はそのまま、`getNoteDetail` で DTO 化前のエンティティ（`found.entity.contentHtml` + `found.entity.internalLinkRefs`）に対し `noteBodyRenderer.renderForDisplay(...)` を実行し、結果を `GetNoteDetailOutput` の別フィールド（例: `renderedContentHtml`）で供給。`NoteDetail.tsx` 117行の `dangerouslySetInnerHTML` をこのフィールドに切り替える。`NoteDTO.contentHtml` は変えない（編集・export の不変条件保持）。
- **理由:** 編集側（P12）・export は保存 body をそのまま使い、詳細表示だけがマークアップ化版を使う線引き。DTO 化前に呼ぶことでドメイン VO（生 target + resolvedNoteId）を入力にできる（ステップ6参照）。
- **注意（レビュー S-002/coverage 反映）:** `content/CodeHighlight.tsx` が mount 後に `.note-detail-content` 配下のコードブロックを走査してハイライトする。マークアップ化後の DOM でコードブロック内が誤変換されず（ステップ7の `<pre>`/`<code>` 祖先スキップ）、新要素（wikilink/hashtag）がハイライト走査と干渉しないことを手動テストで確認する。

#### 10. wikilink リンク先導線

- **対象ファイル:** 上記 adapter（リンク URL 組み立て）
- **変更内容:** `kind=id`（解決済み）は note 詳細 URL（既存ルート規約に従う）へ、`kind=title` 未解決は非リンク表示。`InternalLinkRefDTO` の `kind`/`target`/`displayText` から URL とラベルを決定。

#### 11. CSS 追加

- **対象ファイル:** `app/styles/index.css`（`@layer components` の `.note-detail-content` 配下）
- **変更内容:** main モック（`.wikilink` 488-509 / `.hashtag` 512-513）の surface ピル + `::before` アクセントドット + hover / accent 素テキスト + hover underline を `.note-detail-content .wikilink` / `.note-detail-content .hashtag` として移植。tokens.css の既存変数を使用。
- **既存ルール衝突の解消（レビュー S-001/coverage 反映）:** `index.css` 226-229 の汎用 `.note-detail-content a`（accent 色 + 下線）が wikilink（`<a class="wikilink">`）にも当たる。モックの `.wikilink` は下線なし・surface ピルなので、wikilink 側で打ち消す（モック同様 `text-decoration:none !important` か詳細度確保）。hashtag は `<a>` の場合も同様に汎用 `a` ルールとの差分（accent 素テキスト・hover underline）を明示。
- **理由:** `dangerouslySetInnerHTML` 由来要素のため utility 不可、ADR-002 documented exception に該当。マークアップ化（7-9）とセットで死にコードにならない。

## 設計判断

詳細は adr.md を参照。要点:

- wikilink/hashtag マークアップ化は **ドメイン port + adapter** で行う（保存 body verbatim 不変条件の隔離 + XSS 安全な要素化を adapter に閉じる）。
- wikilink 解決は保存時解決（`resolvedNoteId`）を真実とし、本文再解決はしない。
- ディレクトリパスは主ノートと同じ `DirectoryService.computeSegments` で算出、`directorySegments`（`{id,name}`）を採用。

## リスクと注意点

- **死にコード回避:** `.wikilink`/`.hashtag` CSS は必ずマークアップ化（系統B）とセットでマージ。
- **編集側との線引き:** 保存 `contentHtml` は一切変更しない（`assembleFromInputs` / `markdownConverter` / `htmlSanitizer.allowInternalLinks` / `extractMetadataFromHtml` の verbatim 不変条件を死守）。#287/#77-80 には触れない。
- **export 不変:** `export/markdownRenderer.ts` / `htmlRenderer.ts` は別経路・別ポリシー。新レンダラを export に混ぜない。
- **XSS:** text node 限定走査 + target/display の確実なエスケープ。コードブロック内 `#`/`[[` を誤変換しない。
- **N+1:** `getBacklinks`（全件）で referrer ごとの segments 算出。ツリー 1 回取得 + メモリ構築の最適化を検討。`getNoteDetail` は 5 件上限で影響軽微。
- **DTO 波及:** `BacklinkDTO` 拡張は `getNoteDetail`/`getBacklinks` 両投影とテスト・消費側に波及。両方更新しないと型エラー。

## テスト方針

- 単体: 新 `noteBodyRenderer` adapter — `[[id|表示]]`/`[[title]]`/`#tag` のマークアップ化、解決/未解決の href 分岐、コードブロック・既存 `<a>`・属性内を変換しないこと、XSS ペイロードのエスケープ。
- 単体: `toBacklink` が `directorySegments` を正しく投影すること。
- 統合（real-DB）: `getNoteDetail` / `getBacklinks` が referrer ごとに正しい segments を返すこと（多階層・ルート直下の空 segments）。
- 既存テスト緑: `markdownConverter.test.ts`（verbatim）/ `htmlSanitizer.test.ts`（passthrough）/ export 系が変わらず通ること。
- 単体: コードブロック（`<pre>`/`<code>`）内の `#x` / `[[y]]` が変換されないこと、既存 `<a>` 内が変換されないこと。
- 手動/ブラウザ: P11 を実データで開き、`[[wikilink]]` が surface ピル + アクセントドットでリンク遷移、`#hashtag` が accent 素テキスト、バックリンクカードに meta 行が出ることを main モックと並べて確認。コードブロック内のハッシュ/角括弧が誤変換されないこと、`CodeHighlight` と干渉しないことも確認。
- 品質ゲート: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（2視点並列）

**修正した点:**
- [arch P-001] 主ノートの `directorySegments` は実装済み。本 Issue の追加は `BacklinkDTO.directorySegments`（referrer 単位）のみと明記（ステップ1冒頭に注記）。
- [arch P-002] N+1 を「検討」から「必須対応」に格上げ。`DirectoryService` にツリー 1 回取得 + メモリ走査で複数ディレクトリの segments を一括構築する純関数を追加する設計に確定（ステップ3/4）。
- [arch P-003 + S-001] 新 port `NoteBodyRenderer` の入力をドメイン VO `InternalLinkRef[]`（DTO ではなく）に固定。DTO 化前のエンティティから呼ぶことでレイヤー整合と本文トークン突き合わせの正確性を両立（ステップ6/9）。
- [arch P-004] adapter 配置を実在しない `note-content/` から `app/core/adapters/renderer/UltrahtmlNoteBodyRenderer.ts` に修正。技術プレフィクス命名規約に統一（ステップ7）。
- [coverage P-001] `INTERNAL_LINK_PATTERN`（非 export）/ `HASHTAG_PATTERN`（`tag/service.ts`・非 export）を export 化して単一ソース化する方針を明記。`/g` の `lastIndex` 注意も追記（ステップ7）。
- [arch S-003] `<pre>`/`<code>` 祖先配下の text node スキップを実装手順に明示（ステップ7）。

**取り込んだ改善提案:**
- [coverage S-001] 既存 `.note-detail-content a` ルールとの衝突解消を CSS ステップに明記（ステップ11）。
- [coverage S-002] `CodeHighlight` との干渉確認を手動テスト項目に追加（ステップ9注意 + テスト方針）。
- [arch S-002] hashtag のリンク先導線（タグ絞り込みルート / 無ければ非リンク fallback）を明記（ステップ7）。
- [arch S-004] バックリンクスニペットの `[[...]]`/`#tag` 生表示はスコープ外である非対称を adr.md に追記。

**見送った提案:**
- なし（全提案を反映 or スコープ注記化）。

### 2周目（2視点並列）

**修正した点:**
- [arch P-101] adapter 命名規約の事実誤認を訂正。実規約は「ディレクトリ=関心名 / ファイル=関心名 / クラス=技術プレフィクス」。ファイルを `noteBodyRenderer.ts`、クラスを `UltrahtmlNoteBodyRenderer` に修正（ステップ7）。

**取り込んだ改善提案:**
- [coverage S-101] `.note-detail-content` 共有の他画面（公開詳細・P11h・法務）を「含まれないもの」に列挙。
- [coverage S-102] タグ絞り込みルートが現状未提供のため hashtag は初期実装で非リンク `<span>` を既定と確定（ステップ7）。
- [coverage S-103] トークン↔ref マッチングキー `(kind, target)` を実装メモとして固定（ステップ6）。
- [arch S-101] `DirectoryService` 新関数のシグネチャ案を追記（ステップ4）。
- [arch S-102] consumer container にも `noteBodyRenderer` 追加が必要な旨を明記（ステップ8）。

**終了:** coverage 視点は1周目から問題点ゼロ、arch 視点も P-101 訂正で要修正なし。両視点とも問題点ゼロに収束したため2周で終了。
