# PR #713 レビュー — Issue #710 (ノート一覧 ディレクトリ表示のパンくず化)

## Frontend

レビュー対象: `DirectoryBreadcrumb.tsx`（新規）/ `FilterBar.tsx` / `HomePage.tsx` / `directoryTree.ts` / `NoteBreadcrumb.tsx`（型参照差し替え）/ テスト群。

計画（`.issue/710/plan.md`）の受け入れ基準 AC-1〜AC-8 を実装と突き合わせて検証した。結論: AC はすべて実装で満たされており、Blocker はなし。タップターゲットとレイアウト整合に Warning が数点。

### 受け入れ基準の充足確認（フロントエンド関連）

- **AC-1（パンくず `nav` 表示）**: `DirectoryBreadcrumb` が `nav aria-label="現在のディレクトリ"` で root→leaf セグメントを描画。`directoryAncestorSegments` が `parentId` を辿って祖先を再構成。○
- **AC-2（各セグメントのリンク化）**: 各セグメントが `<Link to="/" search={{ ...HOME_SEARCH, directoryId: segment.id }}>`。`NoteBreadcrumb` と同一パターン。○
- **AC-3（末尾 `×` で解除）**: 末尾 `button onClick={onClear}`、`FilterBar` 側で `clearDirectory` を渡す。○
- **AC-4（undefined で非表示／非空でパンくず）**: `FilterBar.tsx:443` `optimisticDirectoryId !== undefined` を外枠、`segments.length > 0` でパンくず。optimistic clear 中は `optimisticDirectoryId` が即 undefined になり非表示に切り替わる（正しい挙動）。○
- **AC-5（segments 空でフォールバック・空 nav を描画しない）**: `FilterBar.tsx:446-459` の `filterChip data-active` フォールバック。`nav` は描画されない。テスト `shows the fallback chip (no nav)` で検証済み。○
- **AC-6（root 除外）**: `directoryAncestorSegments` が `name === ""` を除外（`directoryTree.ts:64`）。JSDoc に二重防御の責務境界も明記。テストで root 自身 → 空配列を検証。○
- **AC-7（別行配置）**: チップ列 `<div className={filterBar}>` の外（閉じタグ後）に別ブロックでレンダリング。○
- **AC-8（既存 facet 回帰なし）**: 既存テスト 41 件 pass。`hasAnyFilter`・`clearAll` は不変。○

`pnpm vitest run directoryTree.test.ts FilterBar.test.tsx` → 41 passed。

### Blockers

なし。

### Warnings

- **[W-001]** ディレクトリ解除 `×` ボタンにモバイルのタップターゲット床（`TOUCH_TARGET`）が無い
  - 場所: `app/components/note/list/DirectoryBreadcrumb.tsx:65-72`
  - 理由: クリアボタンは `w-4 h-4`（16px 角）の単独 `button`。`FilterBar` 内の他の解除 `×`（`filterChipRemove`）も `w-4 h-4` だが、それらは `filterChip`（`TOUCH_TARGET = max-sm:min-h-[44px]` を持つ）の内側にあり、親チップが実効 44px のタップ高を確保している。本ボタンはパンくず `nav`（`text-sm` の行）に直接置かれ、親に touch-target 床が無いため、モバイルで実効タップ領域が 16px 角のままになる。FilterBar/共通スタイルが守っている 44px タップターゲット規約からの逸脱。
  - 提案: クリアボタンに `TOUCH_TARGET_SQUARE`（`app/components/common/styles.ts:28`）を付与するか、`p-2 -m-2`（パディングでヒット領域を広げてレイアウトはマイナスマージンで相殺）等で実効タップ領域を 44px に引き上げる。同様に各セグメント `Link` も `text-sm` の生リンクでタップ床が無いが、こちらは通常のテキストリンク（パンくず）であり既存 `NoteBreadcrumb` も同様なので許容範囲。最優先は actionable な `×`。

- **[W-002]** フォールバックチップが余分な `<div className="mb-5">` ラッパで囲まれており、レイアウト構造がパンくず本体と非対称
  - 場所: `app/components/note/list/FilterBar.tsx:447-459`
  - 理由: パンくず分岐は `<DirectoryBreadcrumb>`（`nav` 自身が `mb-5` を持つ）を直に返すのに対し、フォールバック分岐は `<div className="mb-5">` で `filterChip` を包む。`mb-5` の位置（要素自身 vs ラッパ）が分岐で揃っておらず、将来のレイアウト調整時に片方だけ追従漏れする余地がある。機能上は両方とも下マージン 5 で同じ見た目になるため軽微。
  - 提案: フォールバックも `span` に直接 margin を持たせるか、両分岐を共通のラッパ（`<div className="mb-5">`）でくくって内側だけ出し分けると、別行レイアウトの責務（外側の `mb`）と中身（nav か chip か）が分離して一貫する。

- **[W-003]** 先頭のフォルダアイコンがセパレータと同じ `SEP`（`text-hairline-strong`）色で、かなり淡く視認性が低い
  - 場所: `app/components/note/list/DirectoryBreadcrumb.tsx:39-41`（`className={SEP}`）
  - 理由: `SEP = "inline-flex text-hairline-strong"` は ChevronRight 区切り用の極めて淡い色。先頭フォルダアイコンは「ここはディレクトリ階層だ」という意味を担う要素であり、区切り記号と同列の最弱トーンだと意味伝達が弱い。`nav` 全体は `text-ink-tertiary` なので、アイコンを区切りより一段強い（少なくとも `text-ink-tertiary`）にする方が「現在地ナビ」のラベルとして機能する。意図的な淡さなら問題ないが、計画の「フォルダアイコンは任意」かつ意味付けの観点でトーン選択を一度見直す価値あり。
  - 提案: 先頭フォルダアイコンを `SEP` ではなく `text-ink-tertiary`（nav 既定色）相当の専用クラスにし、区切り chevron だけ `SEP` の最弱トーンに留める。

### Notes

- **[N-001]** 共有型 `BreadcrumbSegment` を中立な `directoryTree.ts` に SSOT 化し、`NoteBreadcrumb`・`DirectoryBreadcrumb`・`FilterBar` props・ヘルパー戻り値の全てが参照する設計は型安全・追従漏れ防止の観点で良い。`NoteBreadcrumb` 側はインライン型の参照差し替えのみで描画ロジック不変、スコープ（NoteBreadcrumb 変更なし）とも整合。
- **[N-002]** `DirectoryBreadcrumb` が `NoteBreadcrumb` のパターン（`Separator`=ChevronRight 16px、区切りは要素間のみ、累積 id key、`{ ...HOME_SEARCH, directoryId }` リンク、`flex-wrap [overflow-wrap:anywhere]`）を忠実に踏襲しており一貫性が高い。`aria-label` を `"パンくず"` から `"現在のディレクトリ"` に差別化した点（S-002 反映）も読み上げ上の曖昧さ回避として適切。一覧ページ内に同名 `nav` ランドマークが無いこともグレップで確認済み。
- **[N-003]** クリア `×` に `filterChipRemove` を流用せず独自クラス（`text-ink-tertiary hover:text-ink hover:bg-surface`）にしたのは正しい判断。`filterChipRemove` は `text-white/85`（暗い active チップ背景前提）で、透明背景のパンくず上では不可視になる。`×` を lucide `X` でなく文字リテラルにしたのも FilterBar 内の全 remove ボタンの既存慣例と一致。
- **[N-004]** `FilterBar.tsx:308-311` で `directorySegments ?? []` に正規化し、`undefined`（未選択）と `[]`（解決失敗）で表示分岐が分岐しないようにした点（2周目 S-001 反映）が明示的で良い。`HomePage.tsx:181-184` 側は `directoryId` 未選択時に prop 未渡し（条件付きスプレッド）、選択済み・解決失敗時に `[]` を渡す経路で、受け手の正規化と噛み合っている。
- **[N-005]** `directoryAncestorSegments` の循環ガード（visited セット）・`parentId` 切れ打ち切り・id 不在時空配列がテストで網羅されている（ネスト／root 直下／root 自身／不在／循環／祖先欠落）。フロントエンドの堅牢性として十分。
- **[N-006]** パンくず行を Suspense 内 `FilterSection` で描画し、追加 I/O なしで既ロード済み `flat` から純粋再構成する設計は RSC のデータフェッチ規約と整合。`BulkActionBar` と `flat` を同一 await で共有しており重複ロードもない。
