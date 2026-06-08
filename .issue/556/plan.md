# 実装計画 — Issue #556: wikilink/hashtag 表示レンダリングの横展開とタグ導線（#549 フォローアップ）

**Issue:** #556
**作成日:** 2026-06-08
**複雑度:** 中〜大規模
**ブランチ:** issue/556/wikilink-hashtag-rollout（main から分岐予定）

---

## 目的

#549（PR #555）で auth ノート詳細（`NoteDetail` / `getNoteDetail`）に閉じて実装した `[[wikilink]]` / `#hashtag` の表示レンダリング（`NoteBodyRenderer` port + `UltrahtmlNoteBodyRenderer` adapter、read path 専用）を、他の `.note-detail-content` 共有画面へ横展開し、`#hashtag` をタグ絞り込み導線へリンク化する。#549 で死にコード回避・スコープ集中のため意図的に見送った 2 点をまとめて追従する。

## スコープ

### 含まれるもの

- **公開ノート詳細** `PublicNoteDetail.tsx`（`getPublicNote` 経由）へのレンダリング横展開
- **過去版閲覧**（リビジョン詳細、P11h 相当）`NoteRevisionDetail.tsx`（`getNoteRevision` 経由）へのレンダリング横展開
- `NoteBodyRenderer` port に表示サーフェス（auth / public）パラメータを追加し、adapter にサーフェス分岐を実装
  - 公開側 wikilink は `/notes/public/$noteId`（公開ルート）へ向ける（private 露出防止）
  - auth 側 `#hashtag` を `<a class="hashtag" href="/?tagNames=<enc>">` にリンク化（既存 home タグ絞り込み導線へ）
- 対応する単体・統合テスト

### 含まれないもの

- **法務ページ** `LegalDocument.tsx` — `markdownConverter` → `htmlSanitizer.sanitize({ allowInternalLinks: false })` で生成され `[[...]]` / `#...` を**本文に含みえない**。`renderForDisplay` を通すと死にコードになるため対象外（ADR-001）。
- **公開側 `#hashtag` のリンク化** — 公開向けタグ絞り込みルートが存在しない（`/search` も `/u/$username` も `tagNames` URL 非対応）。auth `/`（要ログイン）へ匿名ユーザーを誘導しないため、公開側 hashtag は非リンク `<span>` のまま（ADR-002）。やるなら別 Issue（公開タグ絞り込みルート新設）。
- 編集側 WYSIWYG（`HtmlEditor` / `InlineEditor` / #287 / #77-80）— 編集サーフェスは対象外。
- 保存 body（`contentHtml`）の改変 — verbatim 不変条件を死守（#549 ADR-001/002 を継承）。
- バックリンクスニペット内の `[[...]]` / `#tag` — 素テキスト抜粋のまま（#549 ADR-004 を継承）。
- revision エンティティ / `NoteRevisionDTO` への `internalLinkRefs` 追加 — 保存スナップショット不変条件に触れるため避け、現行ノートの refs を流用（ADR-003）。
- CSS 追加 — `.note-detail-content` 配下の `.wikilink` / `.hashtag` / `a.hashtag:hover` は #549 で先回り済み。追加不要。
- DI 配線 — `noteBodyRenderer` は #549 で `RequestContainer` に配線済み。`getPublicNote` / `getNoteRevision` は同じ container を使うため追加不要。

## 実装ステップ

### 1. `NoteBodyRenderer` port に表示サーフェスを追加

- **対象ファイル:** `app/core/domain/note/ports/noteBodyRenderer.ts`
- **変更内容:** `renderForDisplay(html, refs, options?)` に表示サーフェスを表す引数を追加する。`options: { surface: "auth" | "public" }`、既定 `"auth"`（#549 の `getNoteDetail` 呼び出し・既存 adapter テストと後方互換）。`surface` が (1) wikilink の href ベース（`/notes/$id` vs `/notes/public/$id`）と (2) hashtag のリンク化要否（auth=リンク, public=非リンク）を決める。
- **JSDoc 更新:** トラスト前提（`html` は sanitize 済み保存 body）は両サーフェス共通。公開サーフェスでは wikilink を public ルートへ向け、hashtag は非リンク、を明記。`surface` は I/O を持たないドメイン語彙の表示文脈であり、port をドメインに置く整合は維持される。
- **理由:** 横展開の差は「リンク先ルート」と「hashtag リンク化の要否」の 2 点のみ。これを port の表現にすることで分岐を adapter に閉じ込め、呼び出し側はサーフェスを宣言するだけで済む（最小差分・XSS は引き続き adapter 内）。

### 2. adapter にサーフェス分岐を実装

- **対象ファイル:** `app/core/adapters/renderer/noteBodyRenderer.ts`
- **変更内容:**
  - `wikilinkMarkup` を `surface` 受け取りに変更。href ベースを `surface === "public" ? "/notes/public/" : "/notes/"` で切替（`resolvedNoteId` は引き続き UUID 検証済み・`escapeAttrValue`）。未解決は両サーフェスとも `<span class="wikilink" data-unresolved>`。
  - `hashtagMarkup` を `surface` 受け取りに変更:
    - `auth`: `<a class="hashtag" href="/?tagNames=<enc>">#tag</a>`。**`<enc>` は `encodeURIComponent(JSON.stringify([tag]))`**（= `/?tagNames=%5B%22tag%22%5D`）。これを `escapeAttrValue` してから href へ注入。**スカラー `encodeURIComponent(tag)` は不可**（後述 P-001）。
    - `public`: `<span class="hashtag">#tag</span>`（現状どおり非リンク）。
  - `INTERNAL_LINK_PATTERN` / `HASHTAG_PATTERN` の再利用・text-node 限定走査・`<pre>` / `<code>` / `<a>` 祖先抑制・重なり処理（wikilink 優先）は既存実装をそのまま踏襲。
- **href シリアライズ形式（レビュー arch P-001 反映・最重要）:** `app/router.tsx` の `createRouter` はカスタム `stringifySearch` / `parseSearch` を渡しておらず**デフォルトシリアライザ**を使う。`noteListSearchSchema.tagNames` は `z.array(...)`（実配列）。`defaultParseSearch("?tagNames=foo")` はスカラー文字列 `"foo"` を返し、array スキーマで弾かれ `.catch(undefined)` で**黙って drop**される（= タグ未指定の home に着地し絞り込みが効かない・404 にはならない壊れリンク）。正しくは TanStack デフォルトと同形 `?tagNames=["tag"]`（JSON 配列を URL エンコード）を生成する。adapter が手書き href で URL 規約を知る構図は #549 の `/notes/$id` ハードコードと同層で許容範囲。
- **規約のソース（レビュー coverage S-001 反映）:** `/?tagNames=` 規約を確立しているのは `FilterBar`（`router.navigate({ to: "/", search: { ...tagNames: arr } })` で配列オブジェクトを TanStack にシリアライズさせる、L180-189）と `app/components/note/schema.ts` の `noteListSearchSchema.tagNames`（array 契約）。**`NoteMetaPanel` のタグは非リンク `<span>` で href を持たない**ため href 組み立ての参照にしない。
- **理由:** href 組み立ては adapter の責務（#549 の `/notes/$noteId` 組み立てと同層）。XSS は既存エスケープ関数を流用し、href には検証済み id / JSON 配列エンコード済みタグのみ注入。

### 3. 公開ノート詳細にレンダリングを配線

- **対象ファイル:** `app/core/application/publication/getPublicNote.ts`（+ 出力型）、`app/components/public/PublicNoteDetail.tsx`
- **変更内容:** `getPublicNote` 内で DTO 化前のエンティティ `note`（`note.contentHtml` + `note.internalLinkRefs`）に対し `container.noteBodyRenderer.renderForDisplay(note.contentHtml, note.internalLinkRefs, { surface: "public" })` を実行し、`GetPublicNoteOutput` に `renderedContentHtml: string` を追加して供給。`note: toNoteView(note)` の DTO はそのまま（verbatim 維持）。`PublicNoteDetail.tsx` の `dangerouslySetInnerHTML={{ __html: note.contentHtml }}` を `renderedContentHtml` に切替し、`loadPublicNote` の戻り型に追従。
- **理由:** #549 と同じ「DTO 化前のエンティティから VO refs を渡す」パターンの横展開。`getPublicNote` は既にエンティティを保持しているので追加 I/O なし。`surface: "public"` で安全なリンク先・非リンク hashtag。

### 4. 過去版閲覧の refs 供給方針を決めて配線

- **対象ファイル:** `app/core/application/note/getNoteRevision.ts`（+ 出力型）、`app/components/note/history/NoteRevisionDetail.tsx`
- **制約:** `NoteRevision` エンティティは `internalLinkRefs` を持たない（保存スナップショットに refs を含めていない）。
- **採用方針（ADR-003）:** `getNoteRevision` で既に取得している**現行ノート `found.entity` の `internalLinkRefs`** を refs として渡す。`renderForDisplay(revision.contentHtml, found.entity.internalLinkRefs, { surface: "auth" })` を実行し、`GetNoteRevisionOutput` に `renderedContentHtml` を追加。`NoteRevisionDetail.tsx` を切替。
  - refs はトークン突き合わせ時 `(kind, target)` キーで Map 引きするだけなので、過去版本文のトークンに一致する ref があれば解決リンク化、無ければ未解決 `<span>` に degrade（壊れず安全）。
  - 過去版は auth サーフェスなので wikilink=`/notes/$id`・hashtag=リンク。
- **理由:** 過去版の表示マークアップを最小差分で実現しつつ、revision 保存スキーマ（不変条件）を一切変えない。

### 5. 法務ページは対象外（変更なし）

- `LegalDocument.tsx` は `allowInternalLinks: false` で `[[...]]` / `#...` を含まないため `renderForDisplay` を通すと死にコード。横展開しない旨を ADR / plan に記録（ADR-001）。

### 6. サーフェス指定方針の確定（レビュー arch S-002 反映）

- **方針:** port は第 3 引数 `options` を**省略可（既定 `surface: "auth"`）**とする。呼び出しルールは「**既定と異なる（public）場合のみ明示、auth は省略**」に統一する。
  - `getNoteDetail`（auth）: 第 3 引数なし（#549 の既存呼び出し・既存 adapter テストをそのまま緑に保つ）。`getNoteDetail.ts` は変更不要。
  - `getPublicNote`（public）: `{ surface: "public" }` を明示。
  - `getNoteRevision`（auth）: 第 3 引数なし（auth 既定）。
- **理由:** 後方互換を既定値で担保しつつ、明示は「非既定の意図」を表すノイズの少ない一貫ルールにする。

## 設計判断

詳細は adr.md を参照。要点:

- **リンクポリシーを port の `surface` パラメータで表現**する（別 adapter 化・呼び出し側文字列置換は不可）。差分は href ベースと hashtag リンク化の 2 点のみで、XSS を adapter に閉じたまま最小差分で横展開できる。
- **公開 hashtag は非リンクのまま**。公開向けタグ絞り込みルートが存在せず、auth `/` へ匿名ユーザーを誘導しない。
- **公開 wikilink は `/notes/public/$noteId` へ向け、visibility は target ルートに委ねる**。レンダラで visibility を引かない（追加 I/O 回避・決定的）。private は public ルートが NotFound で安全に弾き、存在の列挙も防ぐ。
- **過去版 refs は現行ノートの `internalLinkRefs` を流用**。revision エンティティ/DTO の不変条件変更を避け、一致しなければ未解決表示へ degrade。
- **タグ絞り込みは新規 UI 画面の新設に当たらない**。既存 home ルートの既存検索パラメータ規約 `?tagNames=` を使うのみ。issue-implement Phase 1.5 デザイン作成 gate は発生しない。

## リスクと注意点

- **private note 露出:** 公開 wikilink を必ず `/notes/public/$id` に向ける（`/notes/$id` を公開ページに出さない）。これが崩れると匿名ユーザーを auth アプリへ誘導する。adapter の surface 分岐を統合/単体テストで担保。
- **XSS（hashtag href 新設）:** hashtag リンク化は新経路。タグ値を `encodeURIComponent(JSON.stringify([tag]))`（TanStack デフォルト配列形式）+ 属性エスケープしてから href へ注入。`HASHTAG_PATTERN` 許可文字に限定されるが、エスケープを省略しない。
- **タグ絞り込みリンクの黙殺（最重要・レビュー arch P-001）:** href をスカラー `?tagNames=foo` で組むと TanStack デフォルトパーサが文字列と解釈し、array スキーマで弾かれて絞り込みが黙って無効化される（404 ではなく「クリックしても効かない」失敗モード）。必ず JSON 配列エンコード形式で組み、単体テストの往復アサーションで担保する。
- **死にコード:** 法務ページに `renderForDisplay` を通さない。CSS は #549 で追加済みなので追加しない。`a.hashtag` の hover CSS は #549 が先回り済みで、auth hashtag リンク化とセットで初めて活きる。
- **過去版 refs 不一致:** 現行ノート refs と過去版本文トークンがずれた場合は未解決 `<span>` に倒れるだけで壊れない。`(kind, target)` 完全一致のみリンク化することを確認。
- **後方互換:** port シグネチャ拡張時、#549 の `getNoteDetail` 呼び出しと既存 adapter テストが緑のままであること（`surface` 既定値 or 全呼び出し更新を統一）。
- **CodeHighlight 干渉:** 公開・過去版でも `CodeHighlight` が `.note-detail-content` を走査する。`<pre>` / `<code>` 抑制で誤変換しないことを各サーフェスで手動確認（#549 と同条件）。

## テスト方針

- **単体（adapter `noteBodyRenderer.test.ts` 拡張）:**
  - `surface: "public"` で wikilink が `/notes/public/$id`、hashtag が `<span>`（非リンク）になること。
  - `surface: "auth"` で hashtag が `<a class="hashtag" href="/?tagNames=...">` になること。**生成した href を実際に `defaultParseSearch`（TanStack）に通すと `tagNames: [tag]` に戻る往復アサーション**を必須化する（文字列一致だけだとスカラー誤形式を見逃すため）。タグ値が JSON 配列エンコード + 属性エスケープされること（XSS ペイロード入りタグ含む）。
  - `surface: "auth"` で wikilink が `/notes/$id`（#549 既存挙動）を維持。
  - 既存の `<pre>` / `<code>` / `<a>`・属性内非変換、未解決 `<span>`、重なり処理が両サーフェスで不変。
- **統合（real-DB）:**
  - `getPublicNote` が公開ノートで `renderedContentHtml` を返し wikilink が public ルートを指すこと。private resolved target を含む本文でもリンクは出るが踏むと NotFound（列挙不可）。
  - `getNoteRevision` が現行ノート refs を使って過去版本文をマークアップ化すること。
- **回帰:** `getNoteDetail` の #549 既存テスト緑、`markdownConverter` / `htmlSanitizer` / export 系不変、`LegalDocument` 経路不変。
- **手動/ブラウザ:** 公開ノート詳細・過去版で `[[wikilink]]` / `#hashtag` がモック準拠表示になり、auth では hashtag クリックで `/?tagNames=` のタグ絞り込みに遷移（実際に絞り込まれること）、公開では hashtag が非リンク・wikilink が public ルートに飛ぶこと。`CodeHighlight` 干渉なし。
- **品質ゲート:** `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（2視点並列）

**修正した点:**
- [arch P-001（最重要）] auth hashtag の href を JSON 配列エンコード形式 `?tagNames=["tag"]`（`encodeURIComponent(JSON.stringify([tag]))`）に確定。スカラー `?tagNames=foo` は TanStack デフォルトパーサに文字列と解釈され array スキーマで黙って drop されることを実機検証で確認（`app/router.tsx` はカスタムシリアライザ未設定）。単体テストに「生成 href を `defaultParseSearch` に通すと `tagNames:[tag]` に戻る」往復アサーションを必須化（ステップ2 / テスト方針 / リスク）。
- [coverage S-001 / arch P-001] 「`/?tagNames=` の規約は `NoteMetaPanel` / `FilterBar` と一致」の事実誤認を訂正。`NoteMetaPanel` のタグは非リンク `<span>` で href なし。規約のソースは `FilterBar`（`router.navigate` に配列オブジェクト）+ `noteListSearchSchema.tagNames`（array 契約）のみ（ステップ2）。
- [arch S-002] ステップ6 のサーフェス指定方針を「任意」から「既定 auth・public のみ明示」の一貫ルールに確定。`getNoteDetail` は変更不要と明記。
- [arch S-001] ADR-003 に「過去版はオーナー本人限定（`getNoteRevision` の Forbidden チェック）だから auth サーフェスで `/notes/$id` を出して安全」を追記。

**取り込んだ改善提案:**
- [coverage S-002] タグ絞り込みは Issue 文言「規約を定義」に対し既存 `?tagNames=` 規約の再利用で要件を満たす（新規 UI 画面の新設・Phase 1.5 デザイン gate に当たらない）旨を設計判断に明記済み。

**見送った提案:**
- なし（全て反映 or 既存記述で充足）。

**両視点の結論:** coverage 視点は問題点ゼロ（S-001/S-002 は軽微提案）。arch 視点は P-001 を要修正として検出 → 上記で反映済み。Issue が懸念した「公開側の露出範囲差」「未ログインへの resolved note 導線可否」「hashtag href が実シリアライズ形式と一致するか」の 3 点はいずれも ADR-002/004 + P-001 修正で回答済み。P-001 は計画段階の机上検証で潰せたため、修正反映をもって 1 周で収束と判断。
