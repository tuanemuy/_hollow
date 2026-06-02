# TC-nav-item — Issue #336 ボタン・リンクのスタイル整理 ブラウザ検証

- 対象: `navItem` base 導入による NAV_ITEM / TREE_ITEM_LINK の集約（視覚回帰ゼロが原則）
- 環境: dev サーバー http://localhost:3003/（稼働中・未変更）
- セッション: agent-browser `--session verify-336`
- 認証ユーザー: 既存 seed ユーザー `test-user-001`（`01938f00-0000-7000-8000-000000000001`）を再利用。既にルート直下に Inbox / Projects / Archive、Projects 配下に Project A / Project B のディレクトリが存在するため TREE_ITEM_LINK の描画前提を満たす。
- 日付: 2026-06-02

## サマリー

全項目 PASS。崩れ・重なり・消失・回帰は検出されなかった。

| 項目 | 結果 |
| --- | --- |
| 認証済みルート描画（サイドバー＋ツリー） | PASS |
| NAV_ITEM 寸法・角丸・文字サイズ | PASS |
| NAV_ITEM hover 背景色変化 | PASS |
| NAV_ITEM 現在ページ選択中表示 | PASS |
| TREE_ITEM_LINK パディング・角丸・truncate | PASS |
| TREE_ITEM_LINK 選択中太字 | PASS |
| NAV_ITEM ↔ TREE_ITEM_LINK 共通部分の一致 | PASS |
| `navItem` base が両方に適用されている（DOM class） | PASS |

## 確認内容

### 1. 認証済みルート描画 — PASS

`__Host-session=test-session-token-336` cookie 注入後 `/` を開き、ヘッダー（Hollow ロゴ・検索・新規作成・アバター）、サイドバー（ライブラリ / ディレクトリ / 管理セクション）、ディレクトリツリー、メイン（すべてのノート 10件）が描画された。
- snapshot で `complementary "サイドバー"`、`tree "ディレクトリツリー"` を確認。
- eval: `hasSidebar=true`, title="TanStack Start Template", bodyText に "ライブラリ / すべてのノート / ディレクトリ / Archive / Inbox / Projects" を確認。
- screenshot: `screenshots/sidebar-full.png`

### 2. NAV_ITEM（サイドバーのナビ項目）

#### 2-1. 寸法・角丸・文字サイズ — PASS

DOM class（すべてのナビ項目で同一の base）:
```
flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer
transition-colors motion-reduce:transition-none select-none no-underline
data-[active]:font-medium aria-[current=page]:font-medium
relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface
```
= `navItem` base + sidebar 専用 add-on（`relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface`）。spec 通り。

computed style（非アクティブ「タグ」）: fontSize 13px / borderRadius 8px (rounded-md) / padding 7px 12px / height 33px / fontWeight 400 / bg transparent。

#### 2-2. hover 背景色変化 — PASS

`hover @タグ`（CDP 実 hover）後、`タグ.matches(":hover")=true`、backgroundColor が `rgba(0,0,0,0)` → `rgb(245,245,247)`（bg-surface）に変化。`hover:bg-surface` が機能。
- screenshot: `screenshots/nav-item-hover.png`（「タグ」に hover ハイライト、角丸は「すべてのノート」アクティブと同一形状）

#### 2-3. 現在ページ選択中表示 — PASS

`/` で「すべてのノート」が `aria-current="page"` + `data-active=""` を持ち、computed fontWeight 500（medium）、backgroundColor `rgb(245,245,247)`（bg-surface）。`aria-[current=page]:bg-surface` + `font-medium` が機能。

### 3. TREE_ITEM_LINK（ディレクトリツリーのリンク）

#### 3-1. パディング・角丸・truncate — PASS

DOM class（Archive / Inbox / Projects / Project A / Project B すべて同一）:
```
flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer
transition-colors motion-reduce:transition-none select-none no-underline
data-[active]:font-medium aria-[current=page]:font-medium
flex-1 min-w-0 truncate
```
= `navItem` base + tree 専用 add-on（`flex-1 min-w-0 truncate`）。spec 通り。

computed style（Archive / Project A）: borderRadius 8px / padding 7px 12px / fontSize 13px / height 33px。truncate は `overflow:hidden + textOverflow:ellipsis + whiteSpace:nowrap` を確認（長い名前は省略表示される）。
- screenshot: `screenshots/sidebar-full.png`

#### 3-2. 選択中太字 — PASS

「Projects」リンクをクリック → ノート一覧が Projects ディレクトリで絞り込み（5件、ディレクトリ chip "Projects"）。Projects リンクが `aria-current="page"` + `data-active=""`、computed fontWeight 500。非アクティブ Archive は fontWeight 400。
選択中の背景は `TREE_ITEM_ROW`（`group flex items-center gap-1 pr-1 rounded-md ... has-[a[data-active]]:bg-surface`）側に `rgb(245,245,247)` が描画され、行全体（caret 列・⋮ アクション列を含む）にハイライトが広がることを DOM 親チェーンの computed bg で確認。リンク自身の bg は transparent（仕様どおりツリーは bg トークンを持たない）。
- screenshot: `screenshots/tree-link-active.png`

#### 3-3. NAV_ITEM ↔ TREE_ITEM_LINK の共通部分一致 — PASS

両者で以下が完全一致（`navItem` base 由来）:
- borderRadius 8px (rounded-md)
- padding 7px 12px (px-3 py-[7px])
- fontSize 13px (text-sm)
- height 33px
- 選択中 fontWeight 500（`data-[active]:font-medium` / `aria-[current=page]:font-medium`）
- 選択中ハイライト色 `rgb(245,245,247)`（bg-surface）

差分は意図どおり: NAV_ITEM は背景をリンク自身に、TREE_ITEM_LINK は背景を行（TREE_ITEM_ROW）に描画。`navItem` base に背景トークンを含めない設計が両方で正しく機能している。

## 静的確認（コード）

- `app/components/common/styles.ts`: `navItem` base が新規追加されている。
- `app/components/layout/styles.ts`: `NAV_ITEM = \`${navItem} relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface\``。死蔵 `ROW_ACTIONS_SMALL_PILL` は存在しない（`ROW_ACTIONS` のみ）。
- `app/components/directory/styles.ts`: `TREE_ITEM_LINK = \`${navItem} flex-1 min-w-0 truncate\``。

## DB に seed した行（後始末用）

`sessions` テーブルに 1 行のみ INSERT（user は既存 seed を再利用、directory は既存を再利用）:

- table: `sessions`
- id: `019e336a-0000-7000-8000-000000000336`
- user_id: `01938f00-0000-7000-8000-000000000001`（既存 test-user-001、削除不要）
- token: `test-session-token-336`
- expires_at: `2026-12-31T23:59:59.000Z`

後始末:
```sql
DELETE FROM sessions WHERE id='019e336a-0000-7000-8000-000000000336';
```
DB ファイル: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite`

## 注意・備考

- agent-browser の `screenshot` を引数なし（tmp 自動保存）で呼ぶと過去ランの古いフレームを拾うケースがあった。`screenshot <絶対パス>` で明示保存すると正しい現在フレームが保存される。本レポートのスクリーンショットはすべて明示パス保存の正しいフレーム。
- 「Projects」遷移後も `location.pathname` は `/`（ディレクトリ絞り込みは search params 駆動）。active 判定は DOM の `aria-current`/`data-active` と絞り込み結果で確認済み。

## スクリーンショット

- `screenshots/sidebar-full.png` — 認証済みサイドバー全体（すべてのノート active）
- `screenshots/nav-item-hover.png` — 「タグ」hover ハイライト
- `screenshots/tree-link-active.png` — 「Projects」ツリーリンク選択中（行全体ハイライト + 絞り込み）
