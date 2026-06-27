# ADR — Issue #779: 公開検索(P32)の結果タイトルにもキーワードハイライトを適用する

## ADR-001: タイトルハイライトの方式と描画用タイトルVOの新設

### Status
Proposed

### Context
P32 の結果タイトルに `<mark>` ハイライトを付けるには、以下の選択肢がある。

ハイライト算出方式:
- (a) FTS5 のタイトルカラム(col 0)に `highlight()` を適用してマーカー入りタイトルを返す。
- (b) `snippet()` をタイトルカラムに適用する。
- (c) アプリ側で `SearchKeyword` のトークンからタイトルのマッチ区間を算出してマーカーを挿入する。

ハイライト済みタイトルの型表現:
- (X) `SearchHit.title` の既存 `SearchTitle`(cap 200) にマーカー入り文字列を載せる。
- (Y) 描画用の別VOを新設する（スニペットの `SearchBody`/`SearchSnippet` 分離に倣う）。

制約:
- FTS5 仮想テーブルのカラム順は `title`(0)/`body_plain`(1)/`tag_names_json`(2)。外部コンテンツ(`content='search_documents'`)なので `snippet()`/`highlight()` とも元テーブルからカラム本文を読める。
- `SearchTitle` は `SearchDocument.title`（保存用、`NoteTitle` の cap 200 をミラー）と `SearchHit.title`（描画用）で共用されている。`highlight()` 適用後はマーカー分で 200 を超え得る（全文一致1区間でも 200+13=213）。

### Decision
- 算出方式は **(a) FTS5 `highlight()`** を採用。理由:
  - タイトルは短く全体を表示したいので、トークンバジェットで切り詰める `snippet()`（(b)）ではなく全文を返す `highlight()` が適切。
  - (c) アプリ側算出は trigram の部分一致・CJK・大小無視といった一致セマンティクスを別実装で再現する必要があり、FTS の実一致と乖離するリスク（FTS が一致と見なさない区間をハイライト、または逆）がある。スニペットが FTS ベースである先例とも不整合。
- 型表現は **(Y) 描画用VO `SearchHighlightedTitle` を新設**。理由:
  - (X) で `SearchTitle` の cap を上げると、保存用 `SearchDocument.title` の不変条件(≤200, `NoteTitle` ミラー)まで緩んでしまう。
  - スニペットは保存用 `SearchBody`(1MB) と描画用 `SearchSnippet`(1024) を分離している。タイトルも「保存用 `SearchTitle` / 描画用 `SearchHighlightedTitle`」に分離するのが先例と一貫。
  - `SearchDocument.title` は `SearchTitle` のまま据え置く。
  - cap は 1024（`SearchSnippet` と同値）。原文≤200 ＋ `highlight()` の最悪マーカーオーバーヘッド ≈ 650（連続一致は1区間に併合されるため最悪区間数 ≈ 50×13）で合計 ≤ ~850 を安全側に収容。

### Consequences
- 良い点: 一致セマンティクスが FTS と完全一致。保存用タイトルの不変条件を汚さない。スニペットの設計と対称で一貫。`highlightSnippet.tsx` をそのまま再利用できる。
- トレードオフ: 新VO・新エラーコード（`HighlightedTitleTooLong`）・`SearchHit.title` 型変更が発生。DTO（`as string` キャスト）とユースケース実体は透過だが、`SearchHit` を直接リテラル構築するテストフィクスチャ4箇所（`dto/__tests__/search.test.ts:17`、`search/__tests__/searchOwnNotes.test.ts:111`、`search/__tests__/searchPublicNotes.test.ts:86`、`domain/search/__tests__/service.test.ts:105`）は型変更で typecheck が壊れるため `SearchHighlightedTitle.create` への更新が必要。
- cap 補足: `SearchHighlightedTitle.create` の cap 超過（`DataIntegrityError` 経路）は実質到達不能（最悪 ≈850 < 1024）。安全弁として残すが、その旨を VO の JSDoc に明記する。

---

## ADR-002: ハイライト有無を SearchQuery フラグでサーフェス別制御する

### Status
Proposed

### Context
`SearchIndex.query()` は単一の共有ポートで、P32（公開検索）・P30（自ノート検索）・ユーザー公開検索の3サーフェスが利用する。スニペットは #778 以降アダプターで常時ハイライトされており、P32 は `highlightSnippet` で要素化するが、自ノートのリストビュー（`ListView`/`TileView`）は `{note.excerpt}` をプレーン描画している（= 自ノート検索のスニペットは現状 `<mark>` 生文字列が漏れている既存事象）。

タイトルを共有アダプターで無条件にハイライトすると、同様に自ノート検索のタイトルにも `<mark>` 生文字列が**新たに**漏れる（新規リグレッション）。これを避ける選択肢:
- (1) タイトルを無条件ハイライトし、全サーフェスの描画箇所（自ノート3ビュー含む）を `highlightSnippet` で要素化する。`highlightSnippet` を共有モジュールへ移設。
- (2) 自ノート loaders でタイトルのマーカーをストリップする（ハイライトしてから捨てる）。
- (3) `SearchQuery` にハイライト有無フラグを追加し、サーフェスがハイライトを要求するか宣言する。

### Decision
**(3)** を採用。`SearchQuery.highlight: boolean`（`SearchQuery.create` のデフォルト `true`）を追加し、`searchOwnNotes` のみ `highlight:false` を渡す。フラグはスニペットとタイトルの両マーカーを統一的に制御する（`highlight:false` 時はスニペットを空マーカーのプレーン抜粋、タイトルを `sd.title` プレーンにする）。

理由:
- サーフェス別挙動差を `SearchQuery` のフィールドで表現するのは既存 `dateBasis`/`sort` と同じイディオムで、ドメインで意図を明示できる。
- (1) は自ノートに「ハイライト機能を新規追加」することになりスコープ外、かつ3ビュー改修＋`highlightSnippet` 移設＋クロスフィーチャ import で churn が大きい。
- (2) は FTS のハイライト結果を生成してから捨てる無駄と、プレゼンテーション層でのストリップという hack を伴う。
- (3) は自ノートビューを一切触らずに新規リグレッションを防げ、副次的に #778 由来のスニペット生マーカー漏れ（自ノート）も解消される。

### Consequences
- 良い点: 自ノート系UI（`ListView`/`TileView`/`CalendarView`）は無改修。新規リグレッションなし（AC-5）。`highlightSnippet` の移設不要。自ノートスニペットの既存マーカー漏れも解消。ドメインで意図が明示される。
- トレードオフ:
  - `SearchQuery.create` 呼び出し3箇所への波及（デフォルト true で後方互換）。
  - 自ノート検索のスニペット挙動が「`<mark>` 生文字列漏れ」→「プレーン抜粋」へ変化する（#778 領域に踏み込むが、是正方向であり本Issueの正しい設計の帰結）。自ノート系テストがスニペット内容を断定していないか要確認。
  - `searchUserPublicNotes` は public 想定でデフォルト true のままとする。再調査で描画コンシューマがコードベースに不在であることを確認済み（参照は `index.ts` の re-export と自パッケージ内のみ）。マーカーの漏れ先がないためデフォルト true のまま整合済みで、実装時の追加確認は不要。

---
