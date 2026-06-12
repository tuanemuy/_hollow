# 実装計画 — Issue #642: feat: 公開検索(P32)にソート選択肢（新着順など）を追加する

**Issue:** #642
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

公開検索画面（P32 `/search`）のソート軸を bm25 関連度順固定から「関連度順 / 新着順」の選択式に拡張し、ソート状態を URL で保持する。spec（pages / domains / usecases）も同時に拡張する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `spec/pages/index.md` の P32 にソート選択肢（関連度順 / 新着順）が定義されている | Issue 完了条件1 | 8 |
| AC-2 | `/search` でソートを「関連度順 ⇄ 新着順」に切り替えられ、結果の並びが実際に変わる（新着順 = `updated_at` 降順） | Issue 完了条件2 | 1–5 |
| AC-3 | ソート状態が URL 検索パラメータ（`sort`）として保持され、リロード・リンク共有・ページネーションで維持される | Issue 完了条件2 | 4, 5 |
| AC-4 | ソートUIがデザインモックの `.sort-btn`（下矢印付き、h-36px / pill / hover で surface）と見た目が整合する | Issue 完了条件3 | 5–7 |
| AC-5 | ソート切替時にページネーション（`cursor`）がリセットされる（オフセットカーソルが並び替え後の順序に不正に適用されない） | 派生要件（URL 状態保持の整合性） | 5 |
| AC-6 | LIKE フォールバック経路（全トークン 3 codepoint 未満）でも新着順が機能する。関連度順時の LIKE 経路は従来どおり `note_id` 安定ソート | 既存 spec（LIKE 代替検索）との整合 | 3 |
| AC-7 | デフォルト（`sort` 省略時）は関連度順で、既存 URL の挙動が変わらない | 後方互換 | 1–5 |

## スコープ

### 含まれないもの

- 自分のノート検索（P30 `/notes/search`、SearchOwnNotes）へのソート追加 — Issue は P32 のみを対象とする。ただしドメインの `SearchQuery` 拡張はデフォルト値（relevance）で全サーフェスに無害に波及する
- ユーザー公開ページ検索（SearchUserPublicNotes）のソートUI — 同上。ドメイン拡張の恩恵は受けるが UI は追加しない
- `published_at`（公開日）基準の新着順 — ADR-001 参照（`updated_at` 基準を採用）
- #618 の項目2（フォーカス二重）・項目3（楽観的更新）— 別課題
- ファセットカウント（`countByDateRanges`）の変更 — カウントは順序に依存しない

## 調査結果

- 関連ファイル:
  - `app/core/domain/search/valueObject.ts` — `SearchQuery` VO（`SearchQuery.create`）。ソートフィールドなし
  - `app/core/domain/search/ports/searchIndex.ts` — `SearchIndex` ポート。`query(q: SearchQuery)`
  - `app/core/domain/search/service.ts` — `SearchService.runQuery`（thin delegate、変更不要）
  - `app/core/adapters/d1/searchIndex.ts` — `D1SearchIndex`。MATCH 経路は `ORDER BY bm25(...) ASC, sd.note_id ASC`（L220）、LIKE 経路は `ORDER BY sd.note_id ASC`（L257）。`updated_at` は既に SELECT 済み（#627 で projection 済み）。カーソルは base64 オフセット
  - `app/core/application/search/searchPublicNotes.ts` — 公開検索ユースケース。`SearchQuery.create` に渡す入力を組み立て
  - `app/routes/search.tsx` — `validateSearch`（zod `searchSchema`）と `renderInputSchema` / server fn loader
  - `app/components/public/PublicSearch.tsx` — L183 `<span className={SORT_LABEL}>関連度順</span>`（#618 (b)案の非インタラクティブラベル）。`SearchArgs` に `sort` なし。「次のページ」リンクで URL パラメータを引き継ぎ
  - `app/components/public/styles.ts` — `SORT_LABEL`（L244）。`FILTER_BTN` がモック `.sort-btn` 相当の hover 付きピルボタンの参考
  - `app/components/public/SearchFilterDrawer.tsx` — `router.navigate` + `useTransition` による URL 更新パターン（`navigate({...})` で `cursor` を落とす実装の参考）
  - `spec/design/pages/P32-public-search.html` — 現在は `.sort-label`（#618 (b)案でラベル化済み）。a91f73fe 以前は `.sort-btn`（h36px pill、hover で `--color-surface`、11px 下矢印 chevron svg、モバイルで h44px）
  - `spec/pages/index.md` L331–339（P32）、`spec/domains/search.md`（SearchQuery / SearchIndex 定義）、`spec/usecases/search.md`（SearchPublicNotes）
- あるべきアーキテクチャ: ヘキサゴナル + DDD。クエリ条件は domain VO（`SearchQuery`）が単一の真実で、usecase は VO を構築して `SearchService.runQuery` に渡すだけ。アダプターが SQL への翻訳を所有。transport 境界（`validateSearch` / `inputValidator`）で形を検証し、以降は静的型を信頼。illegal states unrepresentable（ソートは union 型で表現）
- 既存実装の状態: あるべき姿と一致。`dateBasis: DateBasis`（union + `SearchQuery.create` のデフォルト付きオプション）が今回のソート追加とほぼ同型の先行例であり、同じパターンを踏襲すればよい。乖離なし
- 依存関係: `SearchQuery.create` の呼び出し元は `searchPublicNotes` / `searchOwnNotes` / `searchUserPublicNotes` / `countPublicSearchFacets` — `sort` をオプショナル（デフォルト `"relevance"`）にするため既存呼び出しは無変更で通る。`D1SearchIndex` の integration テスト、`searchPublicNotes` の unit テストに追加ケースが必要

## 設計

### ドメインモデルへの影響

- `app/core/domain/search/valueObject.ts` に `SearchSort` union 型を追加: `type SearchSort = "relevance" | "newest"`。`DateBasis` と同じく brand 不要のリテラル union（不正値は型レベルで排除、transport 境界は zod enum で検証するため runtime コンストラクタは `Visibility` 同様の `create` を用意してもよいが、`DateBasis` が plain union で通している先行例に合わせ plain union とする）
- `SearchQuery` に `sort: SearchSort` フィールドを追加。`SearchQuery.create` のパラメータは `sort?: SearchSort | undefined`、デフォルト `"relevance"`（`dateBasis` と同パターン。既存呼び出し元・既存挙動は不変）
- `SearchIndex` ポートのシグネチャは不変（`SearchQuery` 経由で伝播）。`countByDateRanges` はカウントなのでソートの影響なし（JSDoc に一言補足）
- `SearchService` は変更なし（thin delegate）

### ユースケース / アプリケーションロジック

- `searchPublicNotes.ts`: `SearchPublicNotesInput` に `sort?: SearchSort | null` を追加し、`SearchQuery.create({ ..., sort: input.sort ?? "relevance" })` で伝播。それ以外のロジック変更なし
- `searchOwnNotes` / `searchUserPublicNotes` / `countPublicSearchFacets`: 変更なし（デフォルトで relevance）

### アダプター / 永続化 / 外部連携

- `D1SearchIndex`（`app/core/adapters/d1/searchIndex.ts`）:
  - `runMatchQuery`: `q.sort` を受け取り、ORDER BY を切替。`relevance` → 現行の `bm25(...) ASC, sd.note_id ASC`。`newest` → `sd.updated_at DESC, sd.note_id ASC`（`note_id` を tie-breaker に残しオフセットページネーションの安定性を保つ）
  - `runLikeQuery`: `newest` → `sd.updated_at DESC, sd.note_id ASC`。`relevance` → 現行の `sd.note_id ASC`（bm25 不在のため。spec の「note_id 安定ソート」文言と整合）
  - カーソルはオフセット方式のままで正しく動く（同一 sort 内でのページ送りは同一 ORDER BY に対するオフセット）。sort 切替時のリセットは UI 側の責務（AC-5）
  - スキーマ変更・マイグレーション不要（`search_documents.updated_at` は #627 で存在。ORDER BY 用のインデックスは結果セットが MATCH/LIKE で絞られた後のソートなので不要）

### UI / プレゼンテーション

- `app/routes/search.tsx`: `searchSchema` / `renderInputSchema` に `sort: z.enum(["relevance", "newest"]).optional().catch(undefined)`（renderInput 側は `.catch` なし）を追加。loader で `deps.sort` を伝播。省略時 = relevance で URL を汚さない（既存の `period` と同じ流儀）
- `app/components/public/PublicSearch.tsx`:
  - `SearchArgs` に `sort` を追加し `runSearch` → usecase へ伝播
  - `SORT_LABEL` の `<span>` を、クリックで関連度順 ⇄ 新着順を切り替えるボタンに置換。新クライアントコンポーネント `SearchSortToggle`（`SearchFilterDrawer.tsx` と同様に `router.navigate` + `useTransition` で URL 更新、`sort` 以外の検索パラメータを維持しつつ `cursor` を除去）。選択肢が2つなのでメニューではなくサイクル式トグル（ADR-002）
  - キーワード再送フォームの hidden input に `sort` を追加（`period` と対称）、「次のページ」リンクの `search` にも `sort` を追加
- `app/components/public/styles.ts`: `SORT_LABEL` を `SORT_BTN` に置換（モック `.sort-btn` 準拠: `h-9 px-3 rounded-pill text-[13px] text-ink-secondary inline-flex items-center gap-1 transition-colors hover:bg-surface hover:text-ink max-sm:h-11`、`motion-reduce` 配慮は既存定数と同様）。下矢印は `lucide-react` の `ChevronDown` 11px
- `spec/design/pages/P32-public-search.html`: `.sort-label` を `.sort-btn`（a91f73fe 以前の定義 + 下矢印 svg）に戻し、#618 (b)案コメントを削除

## 実装ステップ

### 1. ドメイン: `SearchSort` の追加と `SearchQuery` 拡張

- **対象ファイル:** `app/core/domain/search/valueObject.ts`
- **変更内容:** `SearchSort` union 型（`"relevance" | "newest"`）を `DateBasis` と同様の JSDoc 付きで追加。`SearchQuery` 型に `sort: SearchSort` を追加し、`SearchQuery.create` に `sort?: SearchSort | undefined`（デフォルト `"relevance"`）を追加
- **理由:** クエリ条件の単一の真実は domain VO。デフォルト付きオプションにすることで既存サーフェス（own / user / facets）は無変更

### 2. ユースケース: `searchPublicNotes` にソート入力を追加

- **対象ファイル:** `app/core/application/search/searchPublicNotes.ts`
- **変更内容:** `SearchPublicNotesInput` に `sort?: SearchSort | null` を追加し、`SearchQuery.create` に `sort: input.sort ?? "relevance"` を渡す。JSDoc にソート軸の説明（newest = index projection の `updated_at` 降順）を追記
- **理由:** 公開検索サーフェスのみソートを露出する（Issue スコープ）

### 3. アダプター: `D1SearchIndex` の ORDER BY 切替

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`
- **変更内容:** `query` から `runMatchQuery` / `runLikeQuery` に `sort`（または `q` ごと）を渡し、ORDER BY 句を sort で分岐するヘルパー（例: `buildOrderBy(sort, path)` か各メソッド内の三項）で組み立てる。`newest` は両経路とも `sd.updated_at DESC, sd.note_id ASC`。`relevance` は現行どおり（MATCH: `bm25 ASC, note_id ASC` / LIKE: `note_id ASC`）。クラス JSDoc のソート記述を更新
- **理由:** SQL への翻訳はアダプターの責務。tie-breaker でオフセットカーソルの安定性を維持

### 4. ルート: `/search` の transport 境界に `sort` を追加

- **対象ファイル:** `app/routes/search.tsx`
- **変更内容:** `SEARCH_SORTS = ["relevance", "newest"] as const` を定義し、`searchSchema` に `sort: z.enum(SEARCH_SORTS).optional().catch(undefined)`、`renderInputSchema` に `sort: z.enum(SEARCH_SORTS).optional()` を追加。loader の `data` に `...(deps.sort !== undefined ? { sort: deps.sort } : {})` を追加し、`PublicSearch` に `sort` を渡す
- **理由:** 入力検証は transport 境界で行う規約。省略時 relevance で URL を汚さない（`period` と同じ流儀、AC-7）

### 5. UI: `PublicSearch` のソートトグル化と URL 伝播

- **対象ファイル:** `app/components/public/PublicSearch.tsx`、新規 `app/components/public/SearchSortToggle.tsx`
- **変更内容:**
  - `SearchArgs` に `sort: SearchSort | null`（または `"relevance" | "newest" | null`）を追加し、`runSearch` の `input.sort` へ伝播
  - `SORT_LABEL` の `<span>` を `<SearchSortToggle sort={sort} />` に置換。`SearchSortToggle` は `"use client"` コンポーネントで、現在のラベル（関連度順 / 新着順）+ `ChevronDown` を表示し、クリックで `router.navigate({ to: "/search", search: (prev) => ... })` により `sort` を切替（newest ⇄ relevance。relevance 時は `sort` を URL から除去）かつ `cursor` を除去。`useTransition` 配下で実行（`SearchFilterDrawer` の `navigate` パターン踏襲）。`aria-label` でアクセシブルに（例: `aria-label="並び替え: 関連度順（クリックで新着順へ）"` 相当の簡潔な文言、もしくは `aria-pressed` 系は使わずボタンテキスト自体が状態を示す）
  - hidden input（フォーム再送時）と「次のページ」リンクの `search` に `sort` を追加
- **理由:** ソート状態の保持先は URL（AC-3）。`cursor` リセットで AC-5 を満たす

### 6. スタイル: `SORT_LABEL` → `SORT_BTN`

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:** `SORT_LABEL` を削除し `SORT_BTN` を追加（モック `.sort-btn`: h-9 / px-3 / rounded-pill / text-[13px] / text-ink-secondary / gap-1 / hover:bg-surface hover:text-ink / transition-colors motion-reduce:transition-none / max-sm:h-11）。コメント「Relevance-order label is fixed (no toggle).」を削除
- **理由:** AC-4（モック `.sort-btn` と整合）。utility-first 規約に従い module-scoped 定数で管理

### 7. デザインモック: P32 を `.sort-btn` に戻す

- **対象ファイル:** `spec/design/pages/P32-public-search.html`
- **変更内容:** `.sort-label`（#618 (b)案）を a91f73fe 以前の `.sort-btn` 定義（hover あり、下矢印 svg、モバイル h44px）に戻す。(b)案の注記コメントを削除
- **理由:** モックは実装の見た目の基準（AC-4）。(b)案は本Issueで上書きされる

### 8. spec 更新

- **対象ファイル:** `spec/pages/index.md`、`spec/domains/search.md`、`spec/usecases/search.md`
- **変更内容:**
  - `spec/pages/index.md` P32: 機能に「ソート選択肢（関連度順 = bm25 / 新着順 = `updated_at` 降順、URL パラメータ `sort` で保持、省略時は関連度順）」を追加。LIKE 代替検索の記述に「新着順選択時は LIKE 経路でも `updated_at` 降順」の補足。ソート切替時に `cursor` がリセットされる（1ページ目に戻る）挙動も明記（AC-5 の仕様化）。`period` ファセット（公開日基準）と新着順（更新日時基準）を併用した場合は「公開日で絞り込み、更新日時で並べる」挙動になることを明記（ADR-001 の時間軸差の補足）
  - `spec/domains/search.md`: `SearchQuery` のフィールドに `sort: SearchSort`（`'relevance' | 'newest'`、デフォルト relevance）を追加し、newest の基準が index projection の `updated_at` である旨を注記。`sort` はカウント系（`countByDateRanges`）の結果に影響しない旨も明記
  - `spec/usecases/search.md`: SearchPublicNotes の入力DTOに `sort?: SearchSort` を追加
- **理由:** AC-1。spec は単一の真実であり実装と同期させる

### 9. テスト

- **対象ファイル:** `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts`、`app/core/application/search/__tests__/searchPublicNotes.test.ts`
- **変更内容:** テスト方針セクション参照
- **理由:** AC-2 / AC-5 / AC-6 / AC-7 の検証

## 設計判断

- **ADR-001:** 新着順の基準を `published_at`（公開日）ではなく `search_documents.updated_at`（index projection）とする — 常時 `publication_states` join を避け、結果カードに表示している `updatedAt` と並びを一致させる。詳細は `.issue/642/adr.md`
- **ADR-002:** ソートUIは2択のサイクル式トグルボタン（メニュー/ドロップダウンにしない）。詳細は `.issue/642/adr.md`
- `SearchSort` は `DateBasis` と同じ plain union（brand なし・デフォルト付きオプション）— 既存の同型先行例に揃える。これは慣例踏襲であり ADR にはしない

## リスクと注意点

- オフセットカーソルとソート切替: 旧 sort で取得した `cursor` が新 sort の URL に残ると、並び替え後の順序にオフセットが適用されページ内容が直感に反する。UI 側で sort 変更時に必ず `cursor` を落とすこと（AC-5）。ただし悪意ある手組み URL でも結果は整合（単に新順序のオフセット）でありエラーにはならない
- `updated_at` は検索インデックスの projection であり Note 集約と結果整合（既存の `SearchHit.updatedAt` JSDoc に明記済み）。新着順の並びがノート更新直後に一瞬古い可能性があるが、既存の表示値と同じ整合性レベルなので許容
- LIKE フォールバック + newest: `ORDER BY sd.updated_at DESC` はフルスキャン後ソートになるが、LIKE 経路自体が既にフルスキャンであり追加コストは小さい
- `renderInputSchema` は `serverData` 経由ではなく server fn の `inputValidator` なので、`searchSchema`（`.catch` あり）と `renderInputSchema`（`.catch` なし）の二重定義を `sort` でも正しく揃えること（既存の `period` の轍）
- `SearchSortToggle` を新規クライアントコンポーネントにする際、`PublicSearch` は RSC なので props はシリアライズ可能な値のみ渡す

## テスト方針

- `searchIndex.integration.test.ts`（実DB）:
  - MATCH 経路: `sort: "newest"` で `updated_at` 降順（同時刻は `note_id` 昇順）に並ぶこと
  - MATCH 経路: `sort` 省略 / `"relevance"` で従来の bm25 順が維持されること（既存テストが回帰ガード）
  - LIKE 経路（短トークン）: `sort: "newest"` で `updated_at` 降順になること
  - newest でのページネーション: 1ページ目 + `nextCursor` での2ページ目が重複・欠落なく連続すること
- `searchPublicNotes.test.ts`（spy fake）: `input.sort` が `SearchQuery.sort` に伝播すること、省略時に `"relevance"` になること
- 既存テスト（searchOwnNotes / searchUserPublicNotes / countPublicSearchFacets）が無変更で通ること（デフォルト値の無害性）
- 手動/ブラウザ確認: `/search?q=...` でトグル押下 → URL に `sort=newest` が付き並びが変わる、再トグルで `sort` が消える、ページ送り後にトグルしても1ページ目に戻る、リロードで状態維持、`sort=newest` の状態でファセット（ユーザー/タグ/期間）を変更しても `sort` が維持される（`SearchFilterDrawer` の `...prev` スプレッド依存の回帰ガード）、モバイル幅で h-11
- `pnpm typecheck && pnpm lint:fix && pnpm format` を通すこと

## レビュー履歴

### 1周目
両視点（要件カバレッジ / アーキテクチャ・リスク）とも問題点ゼロ。改善提案5件をすべて反映。

**取り込んだ改善提案**:
- coverage S-001: AC-4 の対応ステップ列を「5, 6」→「5–7」に修正（モックを `.sort-btn` に戻すステップ7も AC-4 の達成手段のため）
- coverage S-002: ソート切替時の `cursor` リセットを `spec/pages/index.md` P32 にも明記する旨をステップ8に追加
- arch-risk S-001: `spec/domains/search.md` に `sort` がカウント系（`countByDateRanges`）に影響しない旨を明記することをステップ8に追加
- arch-risk S-002: 手動テスト観点に「`sort=newest` 中のファセット変更で `sort` が維持される」を追加
- arch-risk S-003: `period`（公開日基準）× 新着順（更新日時基準）併用時の挙動を `spec/pages/index.md` P32 に明記する旨をステップ8に追加
