# レビュー #695 — General Review (review-001)

**対象 PR:** #695（Issue #688: CSS幅トークン統一）
**レビュー観点:** General Review（変更全体を厳しく）
**判定:** Approve（Blocker なし）

---

## 検証した事実

### トークン定義とブリッジ状況
- `app/styles/tokens.css:92` `--container-max: 1280px;` / `:96` `--content-max: 760px;`（SSOT）。
- `app/styles/index.css:134` の `@theme inline` で `--container-max` のみ橋渡し済み。`--content-max` は **未登録**。
- ただし `max-w-[var(--content-max)]` は Tailwind の任意値（arbitrary value）で **CSS 変数を直接参照するだけ**なので、`@theme inline` 登録は不要。これは plan.md のリスク欄（103行）の主張どおりであり、既存 public 側でも同パターンが稼働している（`app/components/public/styles.ts:92,150,169,172`）。→ JIT 解決の懸念は **問題なし**。

### 残存生px幅の取りこぼし確認（grep 実施）
- `max-w-[1100px]`: app 全体で **0 件**（完全撤去）。
- `max-w-[760px]`: app 全体で **0 件**（完全撤去）。
- その他の `max-w-[NNNpx]` 残存（`720px`/`880px`/`980px`/`480px` 等）は本 Issue のスコープ外（コンポーネント固有の意図的な幅・モーダル幅・admin フォーム幅であり「外枠幅/本文幅」の意味トークンに属さない）。取りこぼしではない。

### 撤廃の妥当性（NoteDetail）
- `app/components/note/detail/NoteDetail.tsx:125` の `<article className="max-w-[760px] mx-auto">` → `<article>`。
- この `<article>` は `AppShell.tsx:25` の `<main className={APP_MAIN}>`（`mx-auto max-w-[var(--container-max)]`）の子。**ページのセンタリングは APP_MAIN 側の `mx-auto` が担う**ため、article から `mx-auto` を外してもセンタリング喪失は起きない（article は親幅いっぱいに広がるだけ）。`mx-auto` は max-width が無くなると無意味になるので一緒に外す判断は正しい。
- 本文プローズは `.note-detail-content`（`index.css:190-192` `max-width: var(--content-max)`）が 760px を内部担保。撤廃後もヘッダー＝外枠幅 / 本文＝760px が成立。manual-test report でも詳細 article=1232 / `.note-detail-content`=760 と実測一致。

### 一貫性（意味の割り当て）
- 外枠幅 `--container-max`: `APP_MAIN`（一覧・編集）、`SavedViewsList`（幅値のみ）。
- 本文幅 `--content-max`: 履歴一覧・過去版詳細（読みビュー）。
- 詳細はヘッダー外枠化（撤廃）＋本文は `.note-detail-content` 担保。
- → 「履歴/過去版＝content / 一覧/編集/保存ビュー＝container」の割り当ては意味的に一貫している。

### スコープ判断（SavedViewsList）
- `app/components/view/SavedViewsList/Page.tsx:36` は `APP_MAIN` 定数で丸ごと置換せず、`max-w-[1100px]` → `max-w-[var(--container-max)]` の **幅値のみ**を置換し、`lg:px-10 lg:py-12 xl:px-16 xl:py-16 max-sm:*` の手厚い padding を据え置いた。plan.md スコープ（31行）と完全一致。padding 退化を回避する妥当な判断。

---

## General Review

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** トークン統一が app 側だけでなく既存の public/admin 側（`--container-max`/`--content-max` 使用）と整合し、app 側の乖離が解消された。CLAUDE.md styling 節（トークン SSOT・`var(--token)` 任意値参照）の規約に沿っている。良い修正。
- **[N-002]** `--content-max` を `@theme inline` に登録しない判断は正しい。任意値の CSS 変数直接参照は登録不要で、既存 public 側の前例（`public/styles.ts`）と同一パターン。無用なテーマ登録を増やしていない点が良い。
- **[N-003]** NoteDetail の `mx-auto` を `max-w` と同時に撤去した点は、親 APP_MAIN がセンタリングを担う構造を正しく踏まえている。副作用（センタリング喪失）は無い。
- **[N-004]** 一覧・編集が 1100px → 1280px に拡幅されるリグレッション懸念について。一覧はカード/行レイアウト、編集はタイトル `w-full`・本文 760px 制約のため行長破綻リスクは小さい。manual-test report で innerWidth=1600 / 狭幅 390px の両端を実測し横スクロール無し・崩れ無しを確認済み。CLAUDE.md のブレークポイント規約（`--breakpoint-*` 据え置き、本 PR で変更なし）にも抵触しない。残リスクは「広い画面で行が長くなる」体感上の変化のみで、ユーザー確認済みの方針（plan.md 13-15行）に沿う想定挙動。
- **[N-005]** 変更は CSS クラス文字列のみで、ドメイン/ユースケース/アダプター/ルーティング・データフローへの影響なし。`mx-auto` 除去以外に意図しない class の取りこぼし削除も無い（diff 確認済み）。

---

## 補足: 残存 `max-w-[NNNpx]` 一覧（スコープ外と判定した根拠）

| 箇所 | 値 | 判定 |
|---|---|---|
| `note/list/BulkActionBar.tsx:46` | 720px | バルクバー固有幅。意味トークン対象外 |
| `landing/LandingPage.tsx:51` | 980px | LP カード固有幅。対象外 |
| `identity/styles.ts:28` | 720px | 認証フォーム固有幅。対象外 |
| `note/editor/InternalLinkSuggestPopup.tsx:30` | 320px | ポップアップ幅。対象外 |
| `layout/styles.ts:36` SEARCH_BOX_WRAPPER | 460px | 検索ボックス幅。対象外 |
| `admin/*Form/Page.tsx` | 880px | admin フォーム固有幅。対象外 |
| `common/styles.ts:299` | 480px | モーダル幅。対象外 |
| `public/styles.ts` 各所 | 380〜920px | public 固有幅。対象外 |
| `tag/styles.ts:71,144` | 320/360px | タグ UI 固有幅。対象外 |
| `public/ErrorPage.tsx:88` | 440px | エラーページ固有幅。対象外 |

いずれも「app メインコンテンツの外枠幅/本文幅」という本 Issue のトークン化対象（1100px/760px）には属さない、コンポーネント固有の意図的な幅指定。取りこぼしではない。
