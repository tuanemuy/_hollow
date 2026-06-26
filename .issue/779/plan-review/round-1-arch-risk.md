# Plan Review (Round 1) — アーキテクチャ整合性・実現可能性・リスク

**対象:** Issue #779 / `.issue/779/plan.md` / `.issue/779/adr.md`
**観点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**結論:** 計画は技術的にほぼ妥当で、検証した主要論点（FTS5 カラム順・`highlight()` の挙動・VO cap・フラグ伝播・レイヤー責務）はいずれも裏付けが取れた。要修正は 1 件（テストフィクスチャ波及の見落とし）、改善提案 3 件。

---

## 検証済みの技術的論点（裏付け）

- **FTS5 カラムインデックス**: `0008_search_documents_fts_trigram.sql` の仮想テーブル定義は `title`(col0)/`body_plain`(col1)/`tag_names_json`(col2)。計画の「title が col 0」は正しく、`highlight(fts, 0, …)` がタイトルを対象にする。既存 `snippet(fts, 1, …)` が body(col1) を対象にしているのと整合。
- **`highlight()` の挙動**: `content='search_documents'`（外部コンテンツ FTS5。クラス JSDoc 中の "contentless" は文言の緩さで、実体は external-content）。外部コンテンツでは `highlight()`/`snippet()` とも content テーブルからカラム本文を再構成できる。既存 `snippet(col1)` が動いている事実が `highlight(col0)` の動作を裏書きする。タイトルに一致語が無ければ `highlight()` は原文をそのまま返す → AC-3（本文のみ一致時プレーン）を満たす。
- **`highlight()` の SQL 記法**: 計画の `highlight(fts.search_documents_fts, 0, '<mark>', '</mark>')` は既存 `snippet(fts.search_documents_fts, 1, …)` / `bm25(fts.search_documents_fts)`（エイリアス `fts` 経由でテーブル名隠しカラムを渡す）と同一イディオムで、同一クエリ内で並存可能。
- **`SearchHighlightedTitle` cap 1024 の妥当性**: 妥当。trigram の最小一致単位は 1 トライグラム＝3 コードポイント。`highlight()` は隣接一致を 1 区間へ併合するため、別区間にするには最低 1 文字のギャップが必要 → 最小サイクル「3 一致＋1 ギャップ＝4 文字」。200 文字タイトルでの最悪区間数 ≈ 50、マーカー overhead = 50×13 = 650、合計 ≈ 850 < 1024。複数トークンが別位置に当たっても 1 区間 ≥3 文字の下限は崩れないため上限は保たれる。計画/ADR の見積もりは正しく、`DataIntegrityError` 経路は実質到達不能。
- **`SearchQuery.highlight` デフォルト true の後方互換**: `SearchQuery.create` は現状 `dateBasis?`/`sort?` を opt-in で受ける同型。`highlight?: boolean`（既定 true）追加は、フラグ未指定の `searchPublicNotes`（既定 true）と既存テストの挙動を維持。`searchOwnNotes` のみ `highlight:false`。idiom 一貫。
- **`toSearchHitDTO` の `as string`**: `SearchHighlightedTitle` は `string` のブランド部分型なので `hit.title as string` は透過に動く（`dto/search.ts:64`）。`view.ts` の `toSearchHitView`/`toOwnedSearchHitView` は `toSearchHitDTO` へ委譲するだけで影響なし。
- **`runLikeQuery` フォールバック**: title は `sd.title`、snippet は `substr(body_plain,…)` で常にプレーン。`highlight` フラグに依らず一貫 → AC-4 を満たす。
- **レイヤー責務**: マーカーをアダプター読み取り結果（`SearchHit`）に載せ、XSS 安全な要素化を UI の `highlightSnippet` が担う分担はスニペットの先例と完全対称。ドメインロジックのアダプター/UI 漏れなし。`SearchQuery.highlight` でサーフェス差をドメインに明示する設計も既存 `dateBasis`/`sort` と一貫。
- **`searchUserPublicNotes` の UI コンシューマ（再調査）**: routes/components に描画コンシューマは**存在しない**（`searchUserPublicNotes` の参照は `index.ts` の re-export と自パッケージ内のみ）。計画の「横断調査で未検出」は正確。レンダリング面が無いため既定 true のままでマーカー漏れリスクはゼロ。計画の方針（現状維持）で安全。
- **自ノートのマーカー漏れ前提の確認**: `loaders.ts:188` が `excerpt: hit.snippet` を渡し、`ListView.tsx:40`/`TileView.tsx:22` が `{note.excerpt}` をプレーン描画 → ADR-002 の「#778 由来でスニペット生マーカーが現状漏れている」は事実。`highlight:false` で是正される副次効果も正しい。
- **デザイン整合**: `styles.ts:232` の `SEARCH_HIT_MARK` は P32 モック `spec/design/pages/P32-public-search.html:511`（`.result-title mark, .result-snippet mark` 共通スタイル）と完全一致。タイトル再利用で見た目が一致。モック 928 行（タイトルに `<mark>`）/942 行（タイトル無ハイライト）も AC-1/AC-3 を裏づける。

---

#### 問題点（要修正）

- **[P-001]** `SearchHit.title` 型変更の波及を「型は透過」と記載しているが、`SearchHit` を構築するテストフィクスチャ 4 箇所が `title: SearchTitle.create(...)` を使っており、型変更で typecheck が壊れる。計画のテスト方針にこれらが列挙されていない。
  - 理由: 計画 L53 は「3ユースケース（型は透過）」とし、ユースケース実体は確かに透過だが、`SearchHit.title` 型を `SearchHighlightedTitle` に変えると以下の SearchHit リテラル構築箇所は `SearchTitle.create("hit")` が代入不可になり typecheck エラーになる:
    - `app/core/application/dto/__tests__/search.test.ts:17`
    - `app/core/application/search/__tests__/searchOwnNotes.test.ts:111`
    - `app/core/application/search/__tests__/searchPublicNotes.test.ts:86`
    - `app/core/domain/search/__tests__/service.test.ts:105`
    実装者は typecheck で気づくが、計画が「透過」と断じていると見積もり/スコープ漏れの原因になる。
  - 提案: テスト方針に「上記 4 フィクスチャの `SearchTitle.create` → `SearchHighlightedTitle.create` 置換」を明記する。あわせて L53 の依存記述を「ユースケース実体は透過だが SearchHit を直接構築するテストフィクスチャ 4 箇所は型変更で要更新」と訂正する。

#### 改善提案（検討推奨）

- **[S-001]** `SEARCH_HIT_MARK` の JSDoc（`styles.ts:230-231`）はマーカーを「inside a snippet（`.result-snippet mark`）」と限定している。タイトル再利用後はコメントが実態とずれる。
  - 理由: 本リポジトリは「自明でない why は残す／実態と乖離させない」方針。タイトルにも適用する旨へ更新するとスタイル共有の意図が明確になる。計画 UI セクションにこの 1 行更新を含めると親切。

- **[S-002]** `searchUserPublicNotes` の扱いを「実装時に確認」の未決事項として残しているが、再調査で UI コンシューマが存在しないことが確定した。
  - 理由: 計画 L67/L128 と ADR-002 Consequences が「描画箇所があれば整合確認」と open のままにしているが、レンダリング面がゼロである事実が確定したため、既定 true で証明可能に安全と断定でき、実装時の曖昧さを除ける。計画を「コンシューマ不在を確認済み・既定 true で確定」と closed 化することを推奨。

- **[S-003]** `SearchHighlightedTitle.create` の cap 超過時 `DataIntegrityError` 経路が実質到達不能（最悪 ≈850 < 1024）である点を VO の JSDoc に明記することを推奨。
  - 理由: 計画は理由をコメントに残す方針だが、「到達不能だが安全弁として残す」ことを明示しておくと、将来 cap を触る人が `SearchSnippet` と同値である根拠（trigram 最小一致 3 文字 → 最悪区間数 ≈50）を再導出せずに済む。`LIKE_SNIPPET_CHARS` の単位 caveat コメントと同じ精度で書くと一貫。

#### 良い点

- ハイライトをアダプター読み取り結果に載せ、要素化を UI に置く責務分担がスニペット先例と完全対称で、レイヤー逸脱がない。
- 保存用 `SearchTitle`(≤200) を据え置き描画用 `SearchHighlightedTitle` を新設する判断（ADR-001）が、`SearchBody`/`SearchSnippet` 分離の既存設計と一貫し、保存用不変条件を汚さない。
- サーフェス差を `SearchQuery.highlight` でドメインに明示する設計（ADR-002）が `dateBasis`/`sort` の既存イディオムと一致し、自ノート 3 ビューを無改修で新規リグレッションを防ぐ。代替案 (1)(2) を churn/hack の観点で正しく退けている。
- cap 1024 の最悪値見積もり（trigram 最小一致 3 文字に基づく ≈850）が数値的に正確で、安全側に倒している。
- 横断リグレッション（共有ポート経由の自ノートへのマーカー漏れ）を最重要リスクとして特定し、`highlight:false` 付与漏れの検証（ステップ3/7）を計画に組み込んでいる。
- LIKE フォールバックでタイトル・スニペットともプレーンに揃える方針が AC-4 と既存挙動に一貫。
- デザイントークン/スタイル（`SEARCH_HIT_MARK`）の再利用がモックと完全一致で、追加スタイル不要という判断が正しい。
