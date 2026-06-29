# 実装計画 — Issue #787: fix(note): shrink note-detail action toolbar on mobile (gap / margin / icon density)

**Issue:** #787
**作成日:** 2026-06-30
**複雑度:** 中〜大規模

---

## 目的

ノート詳細のアクションツールバー（`NoteActions`）がモバイルで場所を取りすぎている問題を、WCAG タッチターゲット下限（44px, ADR-006/#633）を維持したまま、gap・縦マージン・アイコン密度を `max-sm:` 向けに縮小して解消する。「モックを先に直してから実装をモックに合わせる」順序を守る。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | モバイルモック `mobile/P11-note-detail.html` の `.action-toolbar` が、現状のデスクトップ同一値（gap `--space-2` / margin `--space-4 0 --space-6` / icon 20px）から縮小され、意図するモバイルレイアウトを表現している | Issue スコープ 1 | 1 |
| AC-2 | 新規トークンを追加した場合は `tokens.css` に追加し `spec/design/tokens.md` にミラーされている（本計画は「新規トークン追加なし」を採用するため、追加しないこと自体が基準） | Issue スコープ 2 / AC | 2 |
| AC-3 | モバイル幅（`max-sm`）でツールバーのフットプリント（gap・縦マージン・アイコン密度）が現状より縮小されている | Issue AC | 3, 4 |
| AC-4 | min 44px タッチターゲット下限が維持される（`TOUCH_TARGET` / `TOUCH_TARGET_SQUARE` の値・適用箇所を下げない） | ADR-006/#633 | 3, 4 |
| AC-5 | 既存の横スクロールレール隔離（`MENU_RAIL` の `max-sm:overflow-x-auto`）と `role="toolbar"` / `aria-label` のアクセシビリティ挙動が維持される | Issue AC | 3, 4 |
| AC-6 | 実装とモックが一致している（**3レバー = gap・縦マージン・アイコン密度の意図値の一致**に限定。モックに無い編集(Pencil)ボタンや rail 先頭のアクション構成・順序の既存乖離は本Issue対象外） | Issue AC | 1, 3, 4 |
| AC-7 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue AC | 5 |

## スコープ

### 含まれないもの

- デスクトップ（`sm` 以上）の見た目変更。本Issueはモバイル（`max-sm`）のフットプリント縮小のみ。デスクトップの gap/margin/icon はデスクトップ値のまま据え置く。
- タッチターゲット下限（44px）の引き下げ。ADR-006/#633 の制約。縮小レバーは gap・周辺マージン・アイコン寸法に限る。
- `NoteActions` の構造変更（レール隔離・⋯メニューの配置・各アクションのロジック）。スタイリング変種の追加のみ。
- **ツールバー内アクションの構成差（[coverage S-002] / [arch S-003] 反映）**: モバイルモック markup（`mobile/P11-note-detail.html` L889 付近）は 公開/移動/コピー/エクスポート/その他 の icon-only ピル構成で、編集(Pencil)ピルを含まず「主要『編集』は下部固定CTAへ昇格」とコメントされている。一方 実装 `NoteActions.tsx`（L190-200）は編集(Pencil primary)をレール先頭に保持し、下部固定CTAは無い。この**アクション構成・順序の乖離は本Issue以前からの既存差分**であり対象外。AC-6 の「実装とモック一致」は3レバー（gap/縦マージン/アイコン密度）の意図値一致**のみ**を射程とし、ピルの顔ぶれ・配置の一致は判定に含めない（テスト方針もこの限定で実施し、編集ボタンの有無で誤判定しないこと）。
- `pillBtn` / `pillBtnIcon` の**高さ**・**幅**（44px 床）への変更。アイコン *グリフ* の寸法のみ縮小する（ボタンの当たり判定は不変）。

## 調査結果

- 関連ファイル:
  - `app/components/note/detail/NoteActions.tsx` — ツールバー本体。`MENU`(L88-89, `gap-2 my-4 mb-6`)・`MENU_RAIL`(L93, `gap-2` + `max-sm:overflow-x-auto`)・アイコン `size={20}` ハードコード（Pencil/FolderInput/Download）。
  - `app/components/note/detail/UrlCopyButton.tsx` — ツールバー内のコピー操作。`Icon`(Link2/Check) `size={20}`。
  - `app/components/note/detail/NoteActionsMenu.tsx` — レール外の ⋯ メニュー。`Icon`(MoreHorizontal) `size={20}`。
  - `app/components/common/styles.ts` — `TOUCH_TARGET`(`max-sm:min-h-[44px]`)・`TOUCH_TARGET_SQUARE`・`pillBtn`(`h-10 px-4 gap-1.5` + 床)・`pillBtnIcon`(`data-[icon]:w-10 ... data-[icon]:max-sm:min-w-[44px]`)。`gap` はピル *内部* のアイコン-ラベル間（ツールバー間隔ではない）。
  - `app/components/common/Icon.tsx` — lucide ラッパ。`size: 16|20|24` を型で強制し width/height 属性へ転送。JSDoc は「`w-*`/`h-*` を className で渡すな（`size` が寸法の SSOT）」と明記。
  - `app/styles/tokens.css` / `spec/design/tokens.md` — `--space-*`(4px ベース段階, 1=4 / 2=8 / 3=12 / 4=16 / 6=24)・`--icon-*`(2xs=11 / xs=13 / sm=14 / md=18; ラッパ非経由の dense グリフ用、`size-[var(--icon-*)]` で参照)。
  - `app/styles/index.css` — `@theme inline` で `--spacing-*` と `--icon-*` を Tailwind ユーティリティへブリッジ済み。`size-[var(--icon-md)]` は利用可能（既存 `DisplayModeSwitch`/`FilterBar` が `size-[var(--icon-xs)]` を使用）。
  - モック: `spec/design/pages/P11-note-detail.html`(desktop, `.action-toolbar` ~L413) / `spec/design/pages/mobile/P11-note-detail.html`(mobile, `.action-toolbar` ~L436-447, markup ~L889)。

- あるべきアーキテクチャ（CLAUDE.md「Styling」/ ADR 群）:
  - utility-first（`className` に直書き、新規 CSS / `@apply` 禁止）。繰り返し文字列は `styles.ts` の module-scoped 定数へ集約。
  - デザイントークンは `tokens.css` が SSOT、`tokens.md` がミラー、`index.css` の `@theme inline` がユーティリティ橋渡し。
  - 状態スタイルは `data-*` 属性 + `data-[name]:` バリアント。
  - タッチ床の値は `common/styles.ts` の `TOUCH_TARGET`(`max-sm:min-h-[44px]`) を SSOT として一元管理（ADR-006/#633・ADR-001）。spec は意図のみ持ち、px は実装定数に委ねる（spec → 実装の依存方向）。
  - **モック先行**: モックが意図する見た目の SSOT。実装はモックに合わせる。

- 既存実装の状態:
  - 乖離（本Issueで是正）: モバイルモック `.action-toolbar` がデスクトップと同一値（gap `--space-2` / margin `--space-4 0 --space-6` / icon 20px）で、モバイル固有縮小が無い。実装も同様に `max-sm:` 縮小変種が無く gap/margin/icon がデスクトップ固定。**まずモックを正しい縮小値に直し、実装をそれに合わせる。**
  - 一致（維持）: 44px 床（`TOUCH_TARGET`/`TOUCH_TARGET_SQUARE`/`pillBtnIcon` の `data-[icon]:max-sm:min-w-[44px]`）・レール隔離・`role="toolbar"` は既にあるべき姿。本Issueでは触れず維持する。

- 依存関係:
  - `pillBtn` / `pillBtnIcon` は多数の消費者が共有する。**ツールバー間隔（`MENU`/`MENU_RAIL` の `gap`）と縦マージンは `NoteActions.tsx` ローカルなので、ここの `max-sm:` 追加は他画面に波及しない。** `styles.ts` の共有定数（`pillBtn` 等）の高さ・床は変更しないため波及なし。
  - アイコングリフ縮小は `Icon` の利用契約（JSDoc）に関わる → 設計判断（ADR 参照）。`Icon` 本体のロジックは変えず JSDoc の許可範囲を広げるに留める案を採用。
  - `trashed` 分岐（`NoteActions.tsx` L173-182、ゴミ箱状態の単一ラベル付きピル）も `MENU` 定数を共有する。Step 3 で `MENU` に追加する `max-sm:my-3 max-sm:mb-4 max-sm:gap-1` はこの分岐にも自動適用される。縦マージン縮小はフットプリント縮小として意図通り波及する（`gap` は単一ピルにつき無影響）。AC 検証では active 分岐と trashed 分岐の両ツールバーを確認する。

- 変更対象ファイルの Issue スコープとの reconcile（[coverage S-001] 反映）:
  - Issue スコープ項目3は「`NoteActions.tsx` と `common/styles.ts` を整合させる」と名指しするが、本計画は調査結果に基づき **`styles.ts` を変更しない**。理由: 縮小レバーのうち gap/縦マージンは `NoteActions.tsx` ローカル定数（`MENU`/`MENU_RAIL`）、アイコン寸法はインライン `size={20}` であり、`styles.ts` の共有 `pillBtn`/床は本Issueの縮小対象（gap/margin/icon density）に該当しないため。共有定数に手を入れると他画面へ波及するリスクもあり、触らないのが正しい判断。
  - 一方、Issue が名指ししない `UrlCopyButton.tsx` / `NoteActionsMenu.tsx` / `Icon.tsx` の3ファイルを**追加で**変更する。理由: 前2者は同じツールバー行の icon-only ピルで `size={20}` をインライン保持しており、アイコン密度を統一縮小するため対象に含める（Issue の「アイコン 20px ハードコード」課題をより完全にカバー）。`Icon.tsx` は採用案 C（ADR-002）が要する JSDoc 契約更新で、独立した別件作業ではない。いずれも意図的なスコープ調整であり、Issue 指定からの逸脱ではない。

## 設計

レイヤー: 本Issueはプレゼンテーション層（UI スタイリング）のみ。ドメイン / ユースケース / アダプターへの影響は **なし**。

### ドメインモデルへの影響
なし（純粋な表示スタイル変更）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

縮小レバーは 3 つ。すべてモバイル（`max-sm:`）限定で、デスクトップ値は据え置く。タッチ床は不変。

1. **縦マージン**（最大のフットプリント削減）: `MENU` の `my-4 mb-6`（上16/下24px）→ モバイルで上12/下16px（`--space-3` / `--space-4`）。
2. **gap**（ピル間隔）: `MENU` と `MENU_RAIL` の `gap-2`（8px）→ モバイルで `gap-1`（4px, `--space-1`）。
3. **アイコングリフ密度**: icon-only ピル内の lucide グリフ 20px → モバイルで 18px（既存 `--icon-md`）。ボタン自体は 44px 床のまま（当たり判定不変、視覚密度のみ縮小）。

`pillBtn` 内部の `gap-1.5`（アイコン-ラベル間）と `h-10`/床は据え置く（ツールバー間隔とは別概念）。

**トークン方針**: 上記はすべて既存トークン（`--space-1/3/4`, `--icon-md`）で表現できるため**新規トークンは追加しない**（AC-2 は「追加なし」で充足）。詳細は ADR-001。

**アイコングリフ縮小の実装方式**: `Icon` の `size` プロップは静的（型 `16|24|20`）でレスポンシブにできず、JSDoc は `w-*`/`h-*` の className 付与を禁じている。デスクトップ 20px（`size` プロップ）を SSOT として残しつつ、モバイルのみ `className="max-sm:size-[var(--icon-md)]"` で上書きする。lucide が出力する width/height は presentation attribute（specificity 0）なので、クラス由来の `width/height` が `max-sm` で確定的に勝つ。`Icon` の JSDoc に「レスポンシブ縮小に限り size 上書きクラスを許可する」カーブアウトを追記する。詳細・代替案は ADR-002。

## 実装ステップ

スコープ指定の順序（モック先行 → トークン → 実装）に従う。

### 1. モバイルモックの `.action-toolbar` を縮小（モック先行で意図を確立）

- **対象ファイル:** `spec/design/pages/mobile/P11-note-detail.html`
- **変更内容:**
  - `.action-toolbar`（~L436）: `gap: var(--space-2)` → `gap: var(--space-1)`、`margin: var(--space-4) 0 var(--space-6)` → `margin: var(--space-3) 0 var(--space-4)`。`overflow-x: auto` / `scrollbar-width: none` / `padding-bottom: 2px` / `flex-shrink: 0` は維持。
  - markup（~L889）の icon-only ピル内 `<svg width="20" height="20">` → `width="18" height="18"`（公開ピルの 16px グリフ、`role="toolbar"`/`aria-label` は維持）。
- **理由:** モックが見た目の SSOT。実装前に意図するモバイル縮小値を確定させる（AC-1, AC-6）。デスクトップモック `P11-note-detail.html` は変更しない。

### 2. トークン確認（新規追加の要否判断）

- **対象ファイル:** `app/styles/tokens.css` / `spec/design/tokens.md`
- **変更内容:** 変更なし。gap/margin は `--space-1/3/4`、アイコンは `--icon-md`(18px) で表現でき、新規トークン不要であることを確認する（ADR-001 の決定）。
- **理由:** SSOT を最小に保つ。トークンを足さないことで二重管理を増やさない（AC-2）。

### 3. `NoteActions.tsx` に `max-sm:` 縮小変種を追加

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:**
  - `MENU`（L88-89）に `max-sm:my-3 max-sm:mb-4`、`max-sm:gap-1` を追加（既存の `gap-2 my-4 mb-6` はデスクトップ値として残す。`max-sm:` が後勝ちで縮小、デスクトップ不変）。
  - `MENU_RAIL`（L93）に `max-sm:gap-1` を追加（レール内ピル間隔。`contents`/`overflow-x-auto`/`scrollbarHidden` は維持）。
  - icon-only グリフ（`Pencil` L199 / `FolderInput` L224 / `Download` L235）の `Icon` に `className="max-sm:size-[var(--icon-md)]"` を追加（`size={20}` は据え置き＝デスクトップ）。公開ピルの `Globe`（L211, size 既定16）は据え置く。
- **理由:** gap・縦マージン・アイコン密度をモバイルで縮小（AC-3）。床・レール隔離・`role="toolbar"`/`aria-label` には触れず維持（AC-4, AC-5）。モックと一致（AC-6）。

### 4. ツールバー内の他アイコンも同じ縮小を適用

- **対象ファイル:** `app/components/note/detail/UrlCopyButton.tsx`、`app/components/note/detail/NoteActionsMenu.tsx`
- **変更内容:**
  - `UrlCopyButton`（L71, Link2/Check `size={20}`）と `NoteActionsMenu`（L53, MoreHorizontal `size={20}`）の `Icon` に `className="max-sm:size-[var(--icon-md)]"` を追加。
- **理由:** ツールバーの icon-only ピル群でアイコン密度を統一的に縮小し、モックと一致させる（AC-3, AC-6）。⋯ メニューはレール外だが同じツールバー行の icon-only ピルなので密度を揃える。

### 5. Icon の契約更新と品質ゲート

- **対象ファイル:** `app/components/common/Icon.tsx`、（検証）リポジトリ全体
- **変更内容:**
  - `Icon` の JSDoc に、レスポンシブ縮小に限り `size-[var(--icon-*)]` の `max-sm:` 上書きクラスを許可する旨のカーブアウトを追記（`size` プロップはデフォルト/デスクトップ寸法の SSOT のまま）。本体ロジックは変更しない。
  - `pnpm typecheck && pnpm lint:fix && pnpm format` を実行して通す（AC-7）。
- **理由:** アイコングリフのレスポンシブ縮小を契約上明文化し（ADR-002）、共有コンポーネントの利用規約と実装を整合させる。

## 設計判断

- **ADR-001**: gap/margin/icon の縮小に**新規トークンを追加せず**既存 `--space-*` / `--icon-md` を再利用する（SSOT 最小化）。
- **ADR-002**: アイコングリフのモバイル縮小を、`Icon` の `size` プロップ（静的・型制約）を据え置きつつ `max-sm:size-[var(--icon-md)]` クラス上書きで実現し、`Icon` の JSDoc 契約にレスポンシブ縮小のカーブアウトを追記する。代替案（グリフを縮小しない / ラッパ非経由で raw lucide + token クラス）も記録。

詳細は `.issue/787/adr.md`。

## リスクと注意点

- **アイコングリフ縮小は当たり判定を変えない**: 44px 床はボタン（`pillBtn`/`pillBtnIcon`）側にあり、グリフ寸法とは独立。グリフ 20→18 はピル内の視覚密度のみ縮小し、AC-4（44px 維持）を侵さない。逆に「フットプリント縮小」の主因は縦マージンと gap であり、グリフ縮小は density 改善が主目的である点を実装者に明示する。
- **`Icon` 契約のカーブアウトは共有コンポーネントに波及しうる**: JSDoc を緩めるだけで本体は不変だが、将来 `size-*` 上書きが乱用されないよう「レスポンシブ縮小限定」と明記する。`size` プロップがデフォルト寸法 SSOT である原則は維持。
- **presentation attribute 上書きの確実性**: lucide の width/height は presentation attribute（specificity 0）なので class 由来の width/height が勝つ。`size-[var(--icon-md)]` は既存利用実績（`DisplayModeSwitch`/`FilterBar`）があり Tailwind v4 で生成される。
- **gap-1(4px) が狭すぎないか**: 円形ピルの間隔が 4px だと窮屈に見える可能性。モック確認（ステップ1）で実際の見た目を確定し、必要なら margin 主体の縮小に寄せる（gap は据え置きも選択肢）。モック先行の判断に委ねる。
- **`max-sm:` 後勝ちの確実性**: `my-4 mb-6` に対する `max-sm:my-3 max-sm:mb-4` は同プロパティの拡縮で、Tailwind の生成順では variant（`max-sm:`）が base の後にソートされ確定的に勝つ。gap も同様。`min-h`/`min-w` 床には触れないので #633 で問題になった specificity 衝突は発生しない。

## テスト方針

- **モック目視**: `spec/design/pages/mobile/P11-note-detail.html` をブラウザ（390px 幅）で開き、ツールバーの gap/縦マージン/アイコンが縮小され、横スクロールレールが機能することを確認。
- **実装 vs モック一致**: モバイル幅でノート詳細を表示し、gap・縦マージン・アイコン寸法がモックと一致することを確認（AC-6）。
- **タッチ床維持**: モバイル幅で各 icon-only ピルが 44×44px を保つことを DevTools で測定（AC-4）。
- **アクセシビリティ**: `role="toolbar"` / 各 `aria-label` が残り、レールの横スクロールが効くことを確認（AC-5）。
- **デスクトップ非回帰**: `sm` 以上で gap/margin/icon がデスクトップ値（8px / 16・24px / 20px）のままであることを確認。
- **品質ゲート**: `pnpm typecheck && pnpm lint:fix && pnpm format`（AC-7）。

## レビュー履歴

### 1周目

- **判定**: 要件カバレッジ視点・アーキテクチャ/リスク視点とも**問題点ゼロ**（要修正なし）。
- **取り込んだ改善提案**:
  - coverage [S-001]: Issue が名指しした `styles.ts` を変更しない理由と、追加で触る `UrlCopyButton.tsx` / `NoteActionsMenu.tsx` / `Icon.tsx` を含める理由を「調査結果」に reconcile 注記として明示。
  - coverage [S-002] / arch [S-003]: AC-6「実装とモック一致」の射程を3レバー（gap/縦マージン/アイコン密度）の意図値一致に限定する旨を AC 表とスコープ節に明記。モックに無い編集(Pencil)ボタンや rail 先頭の構成・順序の既存乖離は本Issue対象外であることを明示。
  - arch [S-001]: ADR-002 に、presentation-attribute 上書きの前提を既存実績（raw lucide 利用箇所との差分）込みで Icon JSDoc カーブアウトに書き切るべき点を補足。
  - arch [S-002]: trashed 分岐（`NoteActions` L173-182）も `MENU` を共有し縦マージン縮小が波及する点を「調査結果」に明記し、AC 検証対象に追加。
- **見送った改善提案**: なし（1周目の改善提案5件はすべて取り込み。いずれも計画の明確化で低コスト・スコープ内のため）。
