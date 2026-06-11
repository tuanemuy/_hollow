# 実装計画 — Issue #618 + #627: 公開検索（P32）UX改善 + 結果カード更新日時表示

**Issue:** #618, #627（1ブランチ・1PRでまとめて実装）
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

- #618: 公開検索画面（P32）の機能/UX改善 — ソートの扱い（(b)案: ラベル化）、token input のフォーカス二重表示の修正、期間ファセット等の楽観的更新。
- #627: 公開検索の結果カードに更新日時を表示（PC は grid 右列、モバイルはメタ行折込）。

## スコープ

### 含まれるもの

- `SearchHit`（domain VO）→ adapter projection（FTS / LIKE 両経路）→ `SearchHitDTO` への `updatedAt` 配線
- 結果カードの P30 `NOTE_ROW` 同型 grid 化と日付表示
- token input のフォーカスリング一本化（グローバル `:focus-visible` との競合解消）
- `SearchFilterDrawer` の楽観的更新（期間ラジオ・user/tag token・chips・バッジ）
- ソートラベルのモック側追従（`.sort-btn` → 非インタラクティブなラベル）

### 含まれないもの

- ソート選択肢の追加（(a)案）→ #642 に分離済み
- スニペットの `<mark>` 生文字列バグ → #601（別PR）

## 実装ステップ

### Part A: #627 更新日時の配線と grid 化

#### 1. domain VO に updatedAt 追加

- **対象ファイル:** `app/core/domain/search/valueObject.ts`
- **変更内容:** `SearchHit` に `updatedAt: Date` を追加。JSDoc に「インデックス由来（結果整合）」と明記。
- **理由:** DTO だけに生やすとアダプター→DTO の横断配線になりレイヤー違反。ポート戻り値（VO）→ usecase projection が本プロジェクトの型流儀。

#### 2. adapter projection（両経路）

- **対象ファイル:** `app/core/adapters/d1/searchIndex.ts`
- **変更内容:** `SearchRow` に `updatedAt: string` を追加。FTS 経路（`runMatchQuery`）と LIKE 経路（`runLikeQuery`）の SELECT に `sd.updated_at` を追加。`toHit` で `new Date(row.updatedAt)`、`Number.isNaN(getTime())` なら他フィールド同様 `SystemError`。
- **理由:** 完了条件「FTS 経路・LIKE フォールバック経路の双方で値が入る」。

#### 3. DTO 拡張

- **対象ファイル:** `app/core/application/dto/search.ts`（必要に応じて `search/view.ts`）
- **変更内容:** `SearchHitDTO` に `updatedAt: string`（ISO 8601）を追加し、`toSearchHitDTO` で `hit.updatedAt.toISOString()`。`OwnedSearchHitDTO` の交差型から重複宣言を整理し、`toOwnedSearchHitView` は引き続き `note.updatedAt`（DB 最新行）で上書き（スプレッド順を確認）。JSDoc を「base はインデックス由来、owned は DB 行由来で上書き」と更新。
- **理由:** owned 側の挙動を変えずに base DTO へ日付を追加する。

#### 4. 日付フォーマッタの共有

- **対象ファイル:** `app/components/public/PublicNoteViews.tsx` → 新規 `app/components/public/formatNoteDate.ts`
- **変更内容:** `formatDate` / `formatShort` を小モジュールへ抽出し P30 / P32 で共用。
- **理由:** 完了条件「日付表記が公開面の既存表記と一貫」。重複実装を避ける。

#### 5. スタイル grid 化

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:** `SEARCH_HIT_ROW` を `NOTE_ROW` 同型（`grid grid-cols-[1fr_auto] gap-6 items-center ... max-sm:grid-cols-1 ...`、padding はモック値維持）。`SEARCH_HIT_DATE`（`NOTE_DATE` 同型、`max-sm:hidden`）を追加。
- **理由:** モックの `.result-card` grid と ADR-001（#617）の「将来 grid 化」フック解消。

#### 6. カード再構成

- **対象ファイル:** `app/components/public/PublicSearch.tsx`
- **変更内容:** 左列 main + 右列 `SEARCH_HIT_DATE`（`formatShort`）。メタ行末尾に `formatDate`（モバイルで右列が消えメタ行の日付が残る）。
- **理由:** モバイル「メタ行折込」と P30 同一アナトミーの両立。

### Part B: #618

#### 7. ソートラベルのモック追従

- **対象ファイル:** `spec/design/pages/P32-public-search.html`
- **変更内容:** `.sort-btn` を非インタラクティブなラベルへ（chevron 削除・`<button>` → `<span>`・hover 除去）。マークアップ（`:887` 付近）だけでなく CSS 定義 `:374-385`（`:hover` 含む）とモバイル `@media` 内の `.sort-btn { height: 44px }`（`:842`、インタラクティブ前提のタップ床）も整理する。実装側は現状の `SORT_LABEL`（span）を維持。
- **理由:** (b)案は PR #625 で実質実装済み。残るのはモック側の乖離。

#### 8. フォーカス二重の修正

- **対象ファイル:** `app/components/public/styles.ts`（`TOKEN_FIELD`）
- **変更内容:** `TOKEN_FIELD` に `focus-visible:shadow-none` を追加し、リングをラッパー `TOKEN_INPUT` の `focus-within:shadow-focus` に一本化。
- **理由:** 原因はグローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（`app/styles/index.css:174`）が内側 input に効き、ラッパーの `focus-within:shadow-focus` と二重になること。グローバル側は触らず局所で打ち消す。
- **検証:** 修正前後で Tab フォーカス／クリック+入力（Safari/Chrome）の再現確認。

#### 9. 楽観的更新

- **対象ファイル:** `app/components/public/SearchFilterDrawer.tsx`
- **変更内容:** `FilterBar.tsx` の先例（#354 ADR-003）に倣い、baseline `{ username, tags, period }`（URL 由来）に `useOptimistic(baseline, reducer)` を導入。**transition は async にし、`startTransition(async () => { applyOptimistic(patch); try { await router.navigate(...) } catch {} })` の形で `router.navigate` を await する**（同期 transition だとコールバック終了と同時に楽観値が baseline へスナップバックして機能しない — FilterBar が #478 で踏んだ既知の罠。reject 時は catch して baseline 復帰）。期間ラジオの `checked`・user/tag token・active chips・`activeCount` バッジ・`selectedPeriodCount` の全描画箇所を楽観値ベースに置換。reducer は patch 適用型（連打整合）。**`addTag` / `removeTag` 等のハンドラは URL 確定値ではなく楽観値から次の URL 値を計算する**（連打時に未確定の先行変更を落とさないため。FilterBar の `toggleTag` と同形）。
- **理由:** URL 確定（loader 再実行）前に選択を即時反映する。確立済みパターン踏襲。
- **想定挙動の注記:** ドロワーフッターの「N 件を表示」は楽観 period で facet 集計を引くが、facets 自体は loader 確定まで旧データのままなので件数が一瞬古い値になりうる（許容）。

### 仕上げ

#### 10. 品質ゲート

- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit` / `pnpm test:integration`

## 設計判断

詳細は `.issue/618/adr.md` を参照。

- `updatedAt` は domain `SearchHit` に `Date` で追加（レイヤー整合）
- `OwnedSearchHitDTO` の `updatedAt` は引き続き DB 最新行で上書き（挙動変更なし）
- 日付表記は P30 と同一アナトミー・同一フォーマット（右列 `formatShort`、メタ行 `formatDate`）
- フォーカス二重はグローバル `:focus-visible` を触らず `TOKEN_FIELD` 側で局所打ち消し
- 楽観的更新は `useOptimistic` baseline+reducer パターン踏襲

## リスクと注意点

- `SearchHit` への必須フィールド追加はテストフィクスチャ（`makeHit` 等）に波及 — `tsgo` のコンパイルエラーで漏れを検出
- `updatedAt` の SELECT は FTS / LIKE 両経路で必須（片経路漏れは完了条件違反）
- 楽観値はドロワー内外の**全描画箇所**で参照しないと表示が割れる
- `useOptimistic` のスナップバック対策として reducer は baseline に patch を再適用できる形にする
- フォーカス二重は修正前後のブラウザ実機確認が必須

## テスト方針

- unit: `toSearchHitDTO` の ISO 変換、フィクスチャ更新、owned 側が `note.updatedAt` を採る既存アサーション維持
- integration: `searchIndex.integration.test.ts` に FTS / LIKE 両経路で `updatedAt` が入るアサーション追加
- 手動/ブラウザ: 右列日付（PC）/ メタ行日付（モバイル）、フォーカスリング単一、フィルター即時反映、ソートが非インタラクティブ表示

## レビュー履歴

### 1周目
**修正した点**:
- P-001（アーキ・リスク視点）: ステップ9に async transition（`await router.navigate` + catch で baseline 復帰、#478 既知の罠）を明記

**取り込んだ改善提案**:
- S-001（アーキ）: `addTag`/`removeTag` 等のハンドラは楽観値から次の URL 値を計算することを明記
- S-001（要件）/ S-003（アーキ）: モック `.sort-btn` の CSS 定義・モバイル 44px タップ床も整理対象として明記
- S-002（要件）: 「N 件を表示」が楽観 period × 旧 facets で一瞬古い値になりうる想定挙動を注記

**見送った提案とその理由**:
- S-002（アーキ）: `focus:shadow-none` への変更 — Issue の方針（リング一本化）は `focus-visible:shadow-none` で満たせる。実装時にブラウザ検証で不十分なら `focus:shadow-none` へ切替可と実装メモに残す

### 2周目
両視点とも問題点ゼロで終了。改善提案（owned JSDoc の型定義側コメント更新・suggestion listbox 表示中のフォーカス確認・「tag 追加→即 period 変更」の連続操作テスト）は実装時の注意・testing.md に反映。
