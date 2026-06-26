# 実装計画 — Issue #779: 公開検索(P32)の結果タイトルにもキーワードハイライトを適用する

**Issue:** #779
**作成日:** 2026-06-27
**複雑度:** 中〜大規模

---

## 目的

公開検索 P32 (`/search`) の結果カードで、タイトル中の検索語にもスニペットと同じ `<mark>` ハイライトを適用し、デザインモック `spec/design/pages/P32-public-search.html`（`.result-title mark` 前提）と一致させる。バックエンドの FTS5 にタイトルカラムのハイライトを追加し、フロントは既存の `highlightSnippet.tsx` を再利用する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | P32 の結果カードのタイトルで、検索語に一致した区間が `<mark>` 要素として描画される（スニペットと同じ視覚スタイル） | Issue本文 / P32モック `.result-title mark`（`spec/design/pages/P32-public-search.html:511`、L928 のタイトル `<mark>` 例） | 1,2,5,6 |
| AC-2 | タイトルのハイライトは XSS 安全（ユーザー由来テキストは React がエスケープ、`<mark>` マーカーのみ要素化）。`highlightSnippet` を再利用する | Issue対応方針 | 5,6 |
| AC-3 | タイトルに検索語が含まれない結果（本文のみ一致）はタイトルがプレーン描画される（モックでもタイトル無ハイライトの行が存在） | P32モック `spec/design/pages/P32-public-search.html:984`（タイトル "Cloudflare Workers + D1 のパフォーマンス計測" は無マーク、本文側スニペット L985 のみ `<mark>Outbox</mark>`） | 2,6 |
| AC-4 | LIKE フォールバックパス（全トークンが3コードポイント未満）ではタイトル・スニペットともハイライトなしのプレーン文字列を返す（既存スニペット挙動と一貫） | 既存アダプター挙動 / 一貫性 | 2,6 |
| AC-5 | 共有ポート `query()` を使う他サーフェス（自ノート検索 P30 等）の結果タイトルに `<mark>` 生文字列が漏れない（新規リグレッション禁止） | 横断調査（下記） | 1,2,3,4,7 |

## スコープ

### 含まれないもの
- 自ノート検索（P30）の結果に**新たにハイライト機能を追加すること**は行わない。本Issueは P32 のみが対象。自ノートサーフェスでは `highlight: false` でプレーン文字列を返し、現状の見た目（タイトル・スニペットともプレーン）を維持する。
- アプリ側で検索語からタイトルのマッチ区間を算出する代替実装は採らない（ADR-001 参照）。FTS の `highlight()` を用いてスニペットの先例に倣う。
- `highlightSnippet.tsx` の共有モジュールへの移設は不要（P32 のみがレンダリングし、既に import 済みのため）。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/d1/searchIndex.ts` — `snippet(fts, 1, '<mark>', …)` で本文（col 1）のみハイライト。`runMatchQuery` / `runLikeQuery` / `toHit` がタイトル変換を担う。
  - `app/core/adapters/d1/migrations/0008_search_documents_fts_trigram.sql` — FTS5 仮想テーブル定義。**カラム順は `title`(col 0), `body_plain`(col 1), `tag_names_json`(col 2)**。`content='search_documents'`（外部コンテンツ）なので `snippet()`/`highlight()` は元テーブルからカラム本文を読める。
  - `app/core/domain/search/valueObject.ts` — `SearchTitle`(cap 200, `SearchDocument.title` と `SearchHit.title` で共用) / `SearchSnippet`(cap 1024, 描画用) / `SearchQuery`(`dateBasis`/`sort` を サーフェス別に opt-in)。
  - `app/core/domain/search/entity.ts` — `SearchDocument.title` は `SearchTitle`（保存用プレーン）。
  - `app/core/domain/search/ports/searchIndex.ts` — `SearchHit` / `SearchQueryResult`。
  - `app/core/domain/search/errorCode.ts` — `SearchErrorCode`（`TitleTooLong` / `SnippetTooLong` 等）。
  - `app/components/public/highlightSnippet.tsx` — `<mark>`/`</mark>` マーカーを XSS 安全に要素化。マーカー無しなら原文字列を返す（back-compat）。**タイトルにそのまま再利用可能**。
  - `app/components/public/PublicSearch.tsx` — `{hit.title}` プレーン描画（要変更）。`{highlightSnippet(hit.snippet)}` でスニペットは既に要素化。
  - `app/core/application/dto/search.ts` — `toSearchHitDTO` が `hit.title as string` でキャスト。DTO 型は `string`。
  - 各ユースケース: `searchPublicNotes`(public, `dateBasis:'published_at'`)、`searchUserPublicNotes`(public)、`searchOwnNotes`(`dateBasis:'date_for_calendar'`)。いずれも `SearchQuery.create({…})` を構築。

- あるべきアーキテクチャ:
  - ハイライト用マーカーは index アダプターの読み取り結果が持つプロパティ（スニペットの先例）で、XSS 安全な要素化はフロントの `highlightSnippet` の責務。レイヤー内側（ドメインVO・ポート）→アダプター→UI の順で設計する。
  - サーフェス別の挙動差は `SearchQuery` のフィールド（既存 `dateBasis`/`sort`）で表現するのが既存イディオム。ハイライト有無も同様に `SearchQuery.highlight` で表現する。

- 既存実装の状態と乖離:
  - **横断調査の重要知見**: 共有ポート `SearchIndex.query()` は P32・自ノート(P30)・ユーザー公開検索の3サーフェスが利用する。スニペットは #778 以降アダプターで常時ハイライトされ、P32 は `highlightSnippet` で要素化するが、自ノートのリスト描画 `app/components/note/list/{ListView,TileView}.tsx` は `{note.excerpt}` をプレーン描画している → **自ノート検索のスニペットは現状 `<mark>` 生文字列が漏れている（#778 由来の既存事象、本Issueのスコープ外）**。
  - タイトルを共有アダプターで無条件にハイライトすると、同様に**自ノート検索のタイトルにも `<mark>` 生文字列が新たに漏れる（新規リグレッション、AC-5 違反）**。これを防ぐため、ハイライト有無をサーフェス別フラグで制御する（ADR-002）。

- 依存関係:
  - `SearchHit.title` の型を `SearchTitle` → `SearchHighlightedTitle` に変更すると、`toSearchHitDTO`（`as string` キャストのため透過）とユースケース実体（`hit.title` を再構築しないため透過）には影響しないが、**`SearchHit` を直接リテラル構築しているテストフィクスチャ4箇所**は `SearchTitle.create(...)` が代入不可になり typecheck が壊れる。これらを `SearchHighlightedTitle.create(...)` へ置換する（ステップ6 テストで対応）:
    - `app/core/application/dto/__tests__/search.test.ts:17`
    - `app/core/application/search/__tests__/searchOwnNotes.test.ts:111`
    - `app/core/application/search/__tests__/searchPublicNotes.test.ts:86`
    - `app/core/domain/search/__tests__/service.test.ts:105`
  - `SearchQuery.highlight` 追加は `SearchQuery.create` 呼び出し3箇所に波及（デフォルト値で後方互換）。

## 設計

### ドメインモデルへの影響

1. **描画用タイトルVOの新設** — `SearchHit.title` は現在 `SearchTitle`（cap 200、`SearchDocument.title` と共用の保存用不変条件）。`highlight()` 適用後のタイトルは原文（≤200）＋マーカーで 200 を超え得るため、`SearchTitle` をそのまま使うと `create` が throw → `toHit` で `DataIntegrityError` になりクエリが落ちる。スニペットが `SearchBody`(保存) と `SearchSnippet`(描画) を分けている先例に倣い、**描画用タイトルVO `SearchHighlightedTitle`（新ブランド）を新設**する。`SearchDocument.title` は `SearchTitle`(≤200) のまま据え置き、保存用不変条件を汚さない（ADR-001）。
   - cap: 原文≤200 ＋ マーカーオーバーヘッド。`highlight()` は連続一致区間を1つの `<mark>…</mark>`(13文字) に併合するため、200文字タイトルでの最悪区間数 ≈ 50 → オーバーヘッド ≤ ~650、合計 ≤ ~850。安全側に倒し `SearchSnippet` と同じ **1024** を採用（named const `HIGHLIGHTED_TITLE_MAX_LENGTH`）。理由をコメントに残す。
   - エラーコード: `SearchErrorCode.HighlightedTitleTooLong: "search_highlighted_title_too_long"`（既存 `TitleTooLong`/`SnippetTooLong` と同じ命名規約。`errorCodeNaming.test.ts` が自動検証）。
2. **`SearchQuery.highlight: boolean` の追加** — サーフェスがハイライトを要求するか宣言。`SearchQuery.create` に `highlight?: boolean` を追加し**デフォルト `true`**（現状の常時ハイライト挙動を後方互換で維持）。`dateBasis`/`sort` と同じ opt-in パターン。`SearchHit.title` 型は `SearchHighlightedTitle` に変更。
3. ポート (`SearchIndex`) のシグネチャ変更なし（`SearchQuery` 経由でフラグが渡る）。`SearchQueryResult`/`SearchHit` は `title` 型のみ変更。

### ユースケース / アプリケーションロジック
- `searchOwnNotes`: `SearchQuery.create({ …, highlight: false })` を渡す。これにより自ノート検索はタイトル・スニペットともプレーン文字列を受け取り、現状の見た目を維持しつつ AC-5 を満たす（副次的に #778 由来のスニペット生マーカー漏れも解消される）。
- `searchPublicNotes` / `searchUserPublicNotes`: デフォルト `true` のまま（明示してもよい）。**`searchUserPublicNotes` の描画コンシューマは再調査でコードベースに不在を確認済み**（参照は `index.ts` の re-export と自パッケージ内のみで、routes/components に描画箇所なし）。レンダリング面が存在しないため、デフォルト true でもマーカーの漏れ先がなく整合済み。実装時の追加判断は不要。

### アダプター / 永続化 / 外部連携
- `searchIndex.ts`:
  - `runMatchQuery` に `highlight: boolean` を引き回す。
    - `highlight === true`: `snippet(fts, 1, '<mark>', '</mark>', '…', N)`（現状維持）＋ **タイトルは `highlight(fts.search_documents_fts, 0, '<mark>', '</mark>') AS "title"`**。`snippet()` ではなく `highlight()` を使う理由: タイトルは短く全体を出したいため、トークンバジェットで切り詰める `snippet()` でなく全文を返す `highlight()` が適切（ADR-001）。
    - `highlight === false`: スニペットはマーカー空 `snippet(fts, 1, '', '', '…', N)`（プレーン抜粋）＋ タイトルは `sd.title`（プレーン）。
  - `runLikeQuery`: タイトル・スニペットともプレーンのまま（`snippet()`/`highlight()` 不可）。`highlight` フラグに依らず変更なし（AC-4）。
  - `toHit`: `SearchTitle.create(row.title)` → `SearchHighlightedTitle.create(row.title)`。
  - `countByDateRanges`: スニペット/タイトルを SELECT しないため影響なし。
  - マイグレーション変更なし（カラム順 col 0 = title を流用）。クラス JSDoc を `snippet()`/`highlight()` とタイトルハイライトの記述に更新。

### UI / プレゼンテーション
- `PublicSearch.tsx`: `<div className={SEARCH_HIT_TITLE}>{hit.title}</div>` → `{highlightSnippet(hit.title)}`。`highlightSnippet` はマーカー無しなら原文字列を返すので、本文のみ一致（タイトル無ハイライト）/ LIKE フォールバック時も安全（AC-2/AC-3/AC-4）。
- `app/components/public/styles.ts`: `SEARCH_HIT_MARK` を流用（`.result-title mark` と `.result-snippet mark` はモックで同一スタイル）。スタイル追加不要。
- 自ノートビュー（`ListView`/`TileView`/`CalendarView`）: **変更なし**（`highlight:false` でマーカーが届かないため）。DTO 型 (`SearchHitDTO.title: string`) は変更なし、`title` がマーカーを含み得る旨をコメントに追記（スニペット同様の契約）。

## 実装ステップ

### 1. ドメイン: VO・エラーコード・SearchQuery フラグ
- **対象ファイル:** `app/core/domain/search/valueObject.ts`, `app/core/domain/search/errorCode.ts`, `app/core/domain/search/ports/searchIndex.ts`
- **変更内容:**
  - `errorCode.ts`: `HighlightedTitleTooLong: "search_highlighted_title_too_long"` を追加。
  - `valueObject.ts`: `HIGHLIGHTED_TITLE_MAX_LENGTH = 1024` と `searchHighlightedTitleBrand`、`SearchHighlightedTitle` VO（`create` で cap 検証、超過時 `BusinessRuleError(HighlightedTitleTooLong, …)`）を追加。マーカーオーバーヘッドの理由を JSDoc に記載。あわせて **cap 超過（`DataIntegrityError` 経路）は実質到達不能である旨を JSDoc に明記**する（trigram 最小一致 3 コードポイント＋最小ギャップ 1 → 200 文字タイトルでの最悪区間数 ≈ 50、マーカー overhead ≈ 650、合計 ≈ 850 < 1024。安全弁として残すが到達しない。`SearchSnippet` と同値である根拠を将来 cap を触る人が再導出せずに済むよう残す）。`SearchHit.title` の型を `SearchTitle` → `SearchHighlightedTitle` に変更。`SearchQuery` 型に `highlight: boolean` を追加し、`SearchQuery.create` に `highlight?: boolean`（既定 `true`）を実装。
- **理由:** 描画用タイトルが保存用 `SearchTitle`(≤200) の不変条件を超え得るため別VOで表現（スニペット先例）。サーフェス別ハイライト制御を既存 `dateBasis`/`sort` と同じ idiom で表現。

### 2. アダプター: FTS5 タイトルハイライト
- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`
- **変更内容:** `query()` から `q.highlight` を `runMatchQuery` に渡す。`runMatchQuery` でタイトル列を `highlight(fts.search_documents_fts, 0, '<mark>', '</mark>')`（highlight時）/ `sd.title`（非highlight時）、スニペットのマーカーを `'<mark>'/'</mark>'`（highlight時）/ `''/''`（非highlight時）に切替。`runLikeQuery` はプレーンのまま。`toHit` を `SearchHighlightedTitle.create` に変更。クラス JSDoc を更新。
- **理由:** AC-1/AC-3/AC-4/AC-5。FTS カラム col 0 = title。`highlight()` で全文ハイライト。

### 3. ユースケース: 自ノートサーフェスの opt-out
- **対象ファイル:** `app/core/application/search/searchOwnNotes.ts`（必要に応じ `searchUserPublicNotes.ts` を検証）
- **変更内容:** `searchOwnNotes` の `SearchQuery.create` に `highlight: false` を追加。`searchPublicNotes`/`searchUserPublicNotes` はデフォルト true（明示は任意）。
- **理由:** AC-5。自ノートの見た目を現状維持しつつタイトル生マーカー漏れを防止。

### 4. DTO: 契約コメント
- **対象ファイル:** `app/core/application/dto/search.ts`
- **変更内容:** `SearchHitDTO.title`（および既存 `snippet`）が `<mark>` マーカーを含み得る描画用文字列である旨を JSDoc に明記。`toSearchHitDTO` の `as string` キャストは新ブランドでも透過のため実装変更なし。
- **理由:** 契約の明文化（スニペットと同じ扱い）。

### 5. フロント: P32 タイトル描画
- **対象ファイル:** `app/components/public/PublicSearch.tsx`, `app/components/public/styles.ts`
- **変更内容:** タイトルを `{highlightSnippet(hit.title)}` で描画。あわせて `styles.ts` の `SEARCH_HIT_MARK` JSDoc（現状「inside a snippet（`.result-snippet mark`）」とスニペット限定の記述）を、**タイトルにも適用される旨**（`.result-title mark` と `.result-snippet mark` は P32 モックで同一スタイル）へ更新し、実態との乖離を防ぐ。
- **理由:** AC-1/AC-2/AC-3。`highlightSnippet` 再利用。コメントを実態と一致させる（本リポジトリの「実態と乖離させない」方針）。

### 6. テスト
- 下記「テスト方針」参照。
- **`SearchHit` フィクスチャの型追従（必須）:** `SearchHit.title` 型変更で typecheck が壊れる以下4箇所の `SearchTitle.create("hit")` を `SearchHighlightedTitle.create("hit")` に置換し、import も差し替える:
  - `app/core/application/dto/__tests__/search.test.ts:17`
  - `app/core/application/search/__tests__/searchOwnNotes.test.ts:111`
  - `app/core/application/search/__tests__/searchPublicNotes.test.ts:86`
  - `app/core/domain/search/__tests__/service.test.ts:105`

### 7. リグレッション確認
- 自ノート検索（P30）の結果でタイトル・スニペットに `<mark>` 生文字列が出ないことを統合/ユニットで確認（AC-5）。

## 設計判断

- ADR-001: タイトルハイライトを FTS `highlight()`（アプリ側マッチ算出ではなく）で行い、描画用VO `SearchHighlightedTitle` を新設。
- ADR-002: ハイライト有無を `SearchQuery.highlight` フラグでサーフェス別制御し、共有アダプター経由の自ノートサーフェスへのマーカー漏れを防止。
- 詳細は `.issue/779/adr.md`。

## リスクと注意点

- **横断リグレッション（最重要）**: 共有ポート `query()` を自ノート/ユーザー公開検索が利用する。`highlight:false` の付与漏れがあると自ノートタイトルに `<mark>` 生文字列が漏れる。ステップ3とステップ7で必ず確認。
- **`searchUserPublicNotes` のUIコンシューマは不在を確認済み（解消済み）**。再調査の結果、routes/components に描画コンシューマは存在せず（参照は `index.ts` の re-export と自パッケージ内のみ）、マーカーの漏れ先がない。デフォルト true のまま整合済みで、実装時の追加判断は不要。
- **VO cap**: `highlight()` のマーカーで `SearchHighlightedTitle` が 1024 を超えるのは現実的にあり得ない（最悪 ~850）が、`countByDateRanges` 等が `title` を SELECT しないことも含め、cap 超過時は `DataIntegrityError` になる点を意識。
- **既存スニペット挙動の後方互換**: `SearchQuery.create` の `highlight` 既定 true により、フラグ未指定の既存呼び出し（テスト含む）は従来どおりハイライトされる。
- **自ノートスニペットの挙動変化**: `highlight:false` により自ノート検索のスニペットが従来の `<mark>` 生文字列漏れからプレーン抜粋へ変わる（#778 由来事象の解消）。自ノート系テストがスニペット内容を断定していないか確認する。

## テスト方針

- **ドメインVO** (`app/core/domain/search/__tests__/` の valueObject テスト): `SearchHighlightedTitle.create` が ≤1024 を受理、>1024 を `BusinessRuleError(HighlightedTitleTooLong)` で拒否。
- **errorCode 命名** (`app/core/domain/search/__tests__/errorCodeNaming.test.ts`): 新コードが規約（PascalCase キー / lower_snake 値）に適合し自動的にパスすること。
- **アダプター統合** (`app/core/adapters/d1/__tests__/searchIndex.integration.test.ts`):
  - `highlight:true`（デフォルト）かつ検索語がタイトルに含まれる MATCH クエリで `hit.title` に `<mark>` が含まれる。
  - 本文のみ一致（タイトルに検索語なし）のとき `hit.title` に `<mark>` が含まれない（AC-3）。
  - `highlight:false` で `hit.title` / `hit.snippet` ともプレーン（マーカーなし）。
  - LIKE フォールバック（短キーワード）で `hit.title` / `hit.snippet` ともプレーン（AC-4）。
- **ユースケース** (`searchOwnNotes.test.ts` / `searchPublicNotes.test.ts`): `searchOwnNotes` が `highlight:false`、公開系が `highlight:true`(既定) で `SearchQuery` を構築することを確認（fake index は実ハイライトしないため、フラグの伝播を検証）。
- **フロント** (`app/components/public/__tests__/PublicSearch.test.tsx`): `serverData` モックを拡張し、タイトルに `<mark>` を含むヒットを1件返すケースで、タイトル領域が `<mark>` 要素として描画され、マーカー外のユーザーテキストがエスケープされること（XSS安全, AC-2）を `renderToStaticMarkup` で検証。
- **`highlightSnippet`** (`highlightSnippet.test.tsx`): 既存テストでマーカー要素化・エスケープ・back-compat を網羅済み。タイトル再利用は同一関数のため追加は任意。
- 変更後に `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`（unit + integration）を実行。

## レビュー履歴

- **1周目**: 受け入れ基準表のAC↔ステップ紐づけ反転を修正（AC-1 から3を除外、AC-5 に3を追加）／`searchUserPublicNotes` の描画コンシューマ不在を確定記述化（未決→解消済み）／AC-3 の由来を P32 モック L984（タイトル無マーク行）に紐づけ／`SearchHit.title` 型変更で壊れるテストフィクスチャ4箇所の `SearchHighlightedTitle.create` 置換を依存関係・ステップ6に明記し「型は透過」記述を訂正／`SEARCH_HIT_MARK` JSDoc のタイトル適用更新をUIステップに追加／VO JSDoc に cap 到達不能性の明記方針をステップ1に追加。
- **2周目**: 両視点とも問題点ゼロで終了。軽微な改善として AC-4 の対応ステップに「6」（LIKE フォールバックの統合テスト）を補い、ステップとテストの紐づけ非対称を解消。
