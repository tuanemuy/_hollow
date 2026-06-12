# 実装計画 — Issue #622: ユーザー公開ノート詳細（P31）をデザインモックに一致させる

**Issue:** #622
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ユーザー公開ノート詳細ページ（P31, `/u/$username/$noteSlug` および `/notes/public/$noteId`）の実装をデザインモック `spec/design/pages/P31-public-note.html` に一致させる。末尾メタのレイアウト・author-mini の hover・タグのリンク化・トークン微差の 4 点が対象。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | bottom-meta がタグ左・日付右の横並び両端寄せ（`flex items-center justify-between gap-4 flex-wrap`）で表示され、`margin-top: 64px` / `padding-top: 24px` になっている。タグ 0 件時も日付は右寄せ（日付 div に `ml-auto`） | Issue 乖離1 | 1 |
| AC-2 | author-mini にホバーで `--color-surface-hover` の背景が付き、`transition-colors`（`motion-reduce` では無効）でアニメーションする | Issue 乖離2 | 2 |
| AC-3 | メタ行（note-meta-inline）のタグが `<a>`（`Link`）になり、クリックで著者の公開トップ `/u/$username?tags=["タグ名"]` へ遷移して当該タグでフィルタされる | Issue 乖離3 + ADR-001 | 3 |
| AC-4 | 末尾メタ（bottom-meta）のタグはモック通り `<span>` のまま（リンク化しない） | モック P31:687-689（`<span class="tag">`） | 3 |
| AC-5 | section-title の letter-spacing が `0.06em` になっている | Issue 乖離4 | 4 |
| AC-6 | backlink-text / related-title の font-size が `14px` 固定になっている | Issue 乖離4 | 4 |
| AC-7 | pub-pill の font-size が `--text-xs` トークン（clamp 11–12px）になっている | Issue 乖離4 | 4 |
| AC-8 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通り、既存ユニットテストが緑のまま | CLAUDE.md | 5 |

## スコープ

### 含まれないもの

- コンテナ幅（`NOTE_DETAIL_WRAP` の `w-full`）— #621 で対応済み
- 本文 `.note-detail-content`（`app/styles/index.css`）— Issue 本文で対象外と明記（`--content-max` 含めモックと一致済み）
- bottom-meta の font-size（モックはリテラル `13px`、実装は `text-sm` トークン）— Issue が列挙する乖離 4 件に含まれず、`--text-sm` の clamp 上限は 13px で実質一致するため現状維持
- 本文中ハッシュタグ（`.hashtag`）のリンク化 — `dangerouslySetInnerHTML` で描画される保存時レンダリング済み HTML の領域であり、本 Issue の対象（メタ行・末尾メタ）外
- 検索（P32）やユーザートップ（P30）側の変更 — 既存の `tags` パラメータをそのまま利用する

## 調査結果

- 関連ファイル:
  - `app/components/public/PublicNoteDetail.tsx` — P31 の RSC 本体。メタ行タグ（141-144行）・末尾メタ（161-177行）が対象
  - `app/components/public/styles.ts` — P31 のスタイル定数（`AUTHOR_MINI` 146-147, `PUB_PILL` 143-144, `NOTE_BOTTOM_META` 153-154, `SECTION_TITLE` 158-159, `BACKLINK_TEXT` 164, `RELATED_TITLE` 169-170）
  - `spec/design/pages/P31-public-note.html` — モック。`.bottom-meta`（435-448）、`.author-mini:hover`（268）、メタ行タグ `<a class="tag">`（588-590）、末尾メタタグ `<span class="tag">`（687-689）、`.section-title`（455-462）、`.backlink-text`（475）、`.related-title`（499-505）、`.pub-pill`（304-312）
  - `app/routes/u/$username/index.tsx` — P30。`validateSearch` に `tags: z.array(...)` あり（タグ AND フィルタが既存）
  - `app/routes/search.tsx` — P32。同じく `tags` パラメータあり（ただし `q` 必須前提の検索ページ）
  - `app/components/public/__tests__/PublicNoteDetail.test.tsx` — 既存ユニットテスト（tagNames を含むケースあり）
- あるべきアーキテクチャ: utility-first（新規 CSS ファイル・`@apply` 禁止）、繰り返しユーティリティはモジュールスコープ定数（`public/styles.ts`）へ、トークンは `tokens.css` の Tailwind ブリッジ（`text-xs` 等）を優先し、スケールに無い値のみ任意値（`text-[14px]` 等）。`hover` には常に `transition-colors motion-reduce:transition-none` を併記するのが公開面の確立パターン（`CHIP`, `BACKLINK_ITEM` 等）。
- 既存実装の状態: P31 は概ねモックに忠実だが、Issue 記載の 4 乖離が残る。なおモックを精査した結果、タグのリンク化はメタ行（`<a class="tag">`）のみで、末尾メタはモック自体が `<span class="tag">`（リンクなし）。Issue 本文の「末尾メタもリンク」という前提はモックと食い違うため、モックを正としてメタ行のみリンク化する（AC-4）。
- 依存関係: `styles.ts` の対象定数は P31 専用（`SECTION_TITLE`/`BACKLINK_*`/`RELATED_*` は `PublicNoteDetail.tsx` のみが使用、`RELATED_*` 系の見た目を参照する P30 タイルは別定数 `TILE_*`）。他ページへの波及なし。

## 設計

### ドメインモデルへの影響

なし。表示層のみの変更。

### ユースケース / アプリケーションロジック

なし。`getPublicNote` が返す `tagNames` と `owner.username` を既存のまま使う。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

- スタイル定数（`styles.ts`）の修正が中心。レイアウト変更（bottom-meta）は `NOTE_BOTTOM_META` の flex 方向と余白を差し替えるだけで、マークアップ構造（タグ群 div + 日付 div）は現状のまま流用できる。
- タグリンク化は TanStack Router の `Link` を使い、P30 の `validateSearch`（`tags: string[]`）に型安全に乗せる: `<Link to="/u/$username" params={{ username }} search={{ tags: [t] }}>`。リンク先の選定理由は ADR-001。
- モックの `.tag` に hover スタイルは無い（`.hashtag:hover` は本文用）ため、リンク化してもタグの見た目クラスは `text-accent mr-1`（メタ行）/ `text-accent`（末尾メタ）を維持する。

## 実装ステップ

### 1. bottom-meta のレイアウト修正

- **対象ファイル:** `app/components/public/styles.ts`
- **対象ファイル（追加）:** `app/components/public/PublicNoteDetail.tsx`
- **変更内容:** `NOTE_BOTTOM_META` を `"max-w-[var(--content-max)] mt-16 pt-6 border-t border-hairline flex items-center justify-between gap-4 flex-wrap text-sm text-ink-tertiary"` に変更（`flex-col gap-1.5` → 横並び両端寄せ + `gap-4`〔モック gap:16px〕、`mt-12`→`mt-16`〔64px〕、`pt-5`→`pt-6`〔24px〕）。あわせて定数上のコメントをレイアウト変更に追従させる。日付 div には `ml-auto` を付与し、タグ 0 件（タグ div 非描画）時も日付が右端に寄るようにする（タグ有り時は `justify-between` と競合せず無害）。`flex-wrap` で折り返した場合、`ml-auto` により日付がモック（左寄せ）と異なり右寄せになるが、これは意図した挙動として許容する（ブラウザ確認時に認識しておく）。
- **理由:** AC-1。モック `.bottom-meta`（435-447行）と一致させ、タグ 0 件時の挙動も「日付は常に右」で確定する。

### 2. author-mini に hover / transition を追加

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:** `AUTHOR_MINI` に `transition-colors motion-reduce:transition-none hover:bg-surface-hover` を追加。
- **理由:** AC-2。モック 263, 268 行。`motion-reduce` 併記は公開面の確立パターン。なおモックは `transition: var(--transition-bg)`（background のみ）だが、公開面の確立パターン（`CHIP` 等の `transition-colors`）に寄せる — hover で変化するのは背景色のみなので実挙動は同一。

### 3. メタ行タグのリンク化

- **対象ファイル:** `app/components/public/PublicNoteDetail.tsx`
- **変更内容:** 141-144行のメタ行タグ `<span key={t} className="text-accent mr-1">#{t}</span>` を `<Link key={t} to="/u/$username" params={{ username: owner.username }} search={{ tags: [t] }} className="text-accent mr-1">#{t}</Link>` に変更。末尾メタ（165-167行）の `<span className="text-accent">` はモック通り維持。
- **理由:** AC-3 / AC-4。ADR-001 の決定（著者スコープのタグフィルタへ遷移）。

### 4. トークン微差の解消

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:**
  - `SECTION_TITLE`: `tracking-wider` → `tracking-[0.06em]`（モック 460 行。Tailwind 標準スケールに 0.06em が無いため任意値）
  - `BACKLINK_TEXT`: `text-sm` → `text-[14px]`（モック 475 行はリテラル 14px。`--text-sm` は clamp 上限 13px のため任意値で固定）
  - `RELATED_TITLE`: `text-sm` → `text-[14px]`（モック 500 行。同上）
  - `PUB_PILL`: `text-[11px]` → `text-xs`（モック 310 行は `var(--text-xs)`。トークンブリッジ済みユーティリティを優先）
- **理由:** AC-5〜AC-7。モック完全一致。トークンに存在する値はユーティリティ、無い値のみ任意値という規約に沿う。

### 5. テストの `Link` モック拡張とアサーション追加

- **対象ファイル:** `app/components/public/__tests__/PublicNoteDetail.test.tsx`
- **変更内容:** 既存の `vi.mock("@tanstack/react-router")` 内 `Link` モック（38-61行）は `to` / `params` / `children` / `className` のみを受け取り `search` prop を無視するため、このままでは新規アサーション（タグリンクの遷移先検証）が成立しない。モックに `search?: Record<string, unknown>` を追加し、検証可能な形で出力する（例: `search` があれば `?` + `JSON.stringify` 由来の簡易クエリを href に付与する、または `data-search={JSON.stringify(search)}` 属性で出力する）。実ルーターの JSON ベース search シリアライズ（`?tags=%5B%22cloudflare%22%5D`）を厳密に再現する必要はなく、「`search` が `{ tags: ["cloudflare"] }` で渡ったこと」が検証できれば十分。なお既存テストにはパンくず・author-mini の `Link` に `search={{}}` を渡す箇所があるため、モックの出力は `search` が空でないオブジェクトのときのみ付与し、既存アサーションを壊さないこと。その上で「メタ行のタグが `/u/{username}` への `<a>` として `search={ tags: [タグ名] }` 付きで描画される」「末尾メタのタグはリンクでない」のアサーションを追加する。
- **理由:** AC-3 / AC-4 の回帰防止。レビュー指摘 P-001。

### 6. 検証

- **対象ファイル:** なし（コマンド実行）
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`（`PublicNoteDetail.test.tsx` 含む）。タグが `Link` 化されるためテストのレンダリング出力が変わる可能性があり、既存アサーションがタグ表記（`#cloudflare` 等）やロール参照をしている場合は追従修正する。あわせて `adr.md` の ADR-001 Status を `Proposed` → `Accepted` に更新する。ブラウザ確認の手順は `testing.md` に記載（後述テスト方針）。
- **理由:** AC-8。CLAUDE.md の必須ゲート。ADR 更新はレビュー指摘 S-002（coverage）。

## 設計判断

- **ADR-001: タグリンクの遷移先を著者公開トップ（`/u/$username?tags=[...]`）にする** — グローバル検索 `/search?tags=...` ではなく著者スコープのタグフィルタへ。詳細は `adr.md`。
- 末尾メタのタグはモック自体が `<span>`（リンクなし）のため、Issue 文面の想定とモックが食い違う点はモックを正として span を維持（ADR-001 の Context に記録）。

## リスクと注意点

- bottom-meta はタグが 0 件のとき左側の div を描画しない（現実装の条件分岐のまま）。`justify-between` では唯一の子（日付）が左寄せになるため、日付 div に `ml-auto` を付与して「日付は常に右」を確定する（ステップ1・AC-1 に反映済み）。
- `PublicNoteDetail.test.tsx` がタグ要素を `<span>` 前提でアサートしている場合、`Link` 化（`<a>`）で落ちる。スナップショットや `getByText` 程度なら影響しないが、要確認。また既存の `Link` モックは `search` prop を無視するため、ステップ5のモック拡張なしでは新規アサーションが成立しない。
- `text-[14px]` への変更で `BACKLINK_TEXT` / `RELATED_TITLE` がレスポンシブ clamp から外れ全ビューポートで 14px 固定になる。これはモック（リテラル px）通りの意図的な変更。
- `PUB_PILL` の `text-xs` 化で小ビューポートの実寸が 11px→clamp(11–12px) に変わるが、これもモック通り。
- メタ行タグの `Link` 化により、親要素 `NOTE_META_INLINE` 内のクリック領域が増える。モックに `.tag:hover` 装飾は無いので見た目は据え置きだが、リンクとしてのフォーカスリングはグローバル `:focus-visible` に任せる（追加実装不要）。

## テスト方針

- ユニット: 既存 `app/components/public/__tests__/PublicNoteDetail.test.tsx` を緑に保つ。タグリンク化に伴い「メタ行のタグが `/u/{username}` への `<a>` として `search={ tags: [タグ名] }` 付きで描画される」「末尾メタのタグはリンクでない」のアサーションを追加する（`Link` モックの `search` 対応はステップ5参照）。
- 静的検証: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- ブラウザ確認（`testing.md` に手順を書く）:
  - P31 を開き、bottom-meta が「タグ左・日付右」の横並び・`mt 64px / pt 24px` であること（DevTools で computed 値確認）
  - author-mini にホバーして背景が `surface-hover` に変化すること
  - メタ行のタグをクリックして `/u/{username}?tags=["..."]` に遷移し、P30 でそのタグのフィルタチップがアクティブになること
  - section-title / backlink-text / related-title / pub-pill の computed font-size・letter-spacing がモックと一致すること
  - モバイル幅（390px）で bottom-meta が `flex-wrap` で破綻なく折り返すこと
  - タグ無しの公開ノートで bottom-meta の日付が右端に寄ること（`ml-auto`）

注: `testing.md` は本リポジトリにまだ存在しないため、実装時に上記手順を含めて新規作成する（ファイル更新ではない）。

## レビュー履歴

### 1周目

**修正した点**:

- P-001（arch-risk）: テストの `Link` モックが `search` prop を無視する問題に対し、モック拡張（`search` の受け取りと検証可能な出力）を独立した実装ステップ5として明記。実ルーターの JSON シリアライズを厳密再現する必要はないというレベル感も記載。

**取り込んだ改善提案**:

- S-001（coverage / arch-risk 同一指摘）: タグ 0 件時の bottom-meta 日付寄せを「実装時の判断に委ねる」から「日付 div に `ml-auto` を付与し常に右寄せ」に確定。AC-1・ステップ1・リスク欄に反映。
- S-002（coverage）: ADR-001 の Status を実装時に `Accepted` へ更新する手順をステップ6（検証）に明記。
- S-002（arch-risk）: モックの `transition-bg` に対し `transition-colors` を採用する意図（公開面の既存パターン準拠、実挙動は同一）をステップ2に一行補足。
- S-003（arch-risk）: testing.md は未存在のため対応不要としつつ、テスト方針のブラウザ確認にタグ無しノートの bottom-meta 確認を追記。

**見送った提案とその理由**:

- なし（全件取り込み）。

### 2周目

両視点とも問題点ゼロで終了。軽微な改善提案のみ反映:

- S-001（arch-risk）: `Link` モックの `search` 出力は空でないときのみ付与（既存の `search={{}}` 利用箇所を壊さない）— ステップ5に追記。
- S-002（arch-risk）: `ml-auto` による折返し時の日付右寄せはモックと微差だが意図した挙動として許容 — ステップ1に追記。
- S-001（coverage）: ADR-001 の Status 更新はステップ6（最終検証）時点で行う運用を維持（実害なしのため現位置で確定）。
