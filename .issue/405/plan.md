# 実装計画 — Issue #405: 保存ビュー管理UIの拡充

**Issue:** #405
**作成日:** 2026-06-02
**複雑度:** 中〜大規模

---

## 目的

#394（PR #403）で意図的にスコープ外とした保存ビュー管理UIの5機能を実装し、`spec/design/pages/P20-views.html` のカンプに実体を与える。ユーザー方針: 全5機能を1PRで一括実装。

## スコープ

### 含まれるもの

1. ビューの編集（絞り込み条件を後から変更）
2. ビューの複製
3. 壊れた条件の修復
4. `/views` からの新規ビュー作成導線
5. 壊れた条件の具体名表示（DTO/イベント/JSON 拡張）

### 含まれないもの

- `?kind=` search param のタブ化（現状の両表示を維持。ADR に方針を1行残す）
- タグ/ディレクトリの soft-delete 化（具体名は削除時スナップショットで対応するため不要）

## 調査結果（既存実装の状態）

| 機能 | domain | usecase | adapter | presentation |
|---|---|---|---|---|
| 1. 編集 | ✅ `updateQuery`/`setSort`/`setDisplayMode` | ✅ `updateSavedView`（query等対応済） | ✅ 既存 save | ❌ EditDialog + server fn |
| 2. 複製 | ✅ `SavedView.create` 再利用 | ❌ `duplicateSavedView` 新規 | ✅ 既存 insert | ❌ server fn + UI |
| 3. 修復 | ✅ `repairBrokenConditions` 完成 | ❌ usecase 新規 | ✅ 既存 save | ❌ server fn + ボタン |
| 4. 新規作成 | ✅ | ✅ `createSavedView` 流用 | ✅ | ❌ 「新しいビュー」ボタン + Dialog |
| 5. 具体名表示 | △ VO 拡張要 | △ DTO/イベント拡張要 | △ JSON 拡張要 | ❌ バナー文言 |

**核心:** ドメイン層はほぼ完成済み。負担は usecase 薄追加と presentation。例外は機能5で、タグ/ディレクトリ hard-delete・削除イベント payload が ID のみという制約から、削除の瞬間に名前をスナップショットする横断変更になる（表示時解決は原理的に不可能）。

## 実装ステップ

### 機能1: ビューの編集

1. **schema.ts に `updateSavedViewSchema`**（`app/components/view/schema.ts`）。`createSavedViewSchema` 流用＋`viewId`。タグは名前配列（`tagNames`）。`renameSavedViewSchema` は維持（インライン名前変更で使用中）。
2. **server function `updateSavedViewFn`**（`SavedViewsList/action.ts`）。`resolveTagNamesToIds` でタグ名→ID 解決し `updateSavedView` usecase に全フィールド渡す。`renameSavedViewFn` と共存。
3. **共通 `ViewFormDialog`** を新設（新規作成と共有、mode 違い）。`SaveViewDialog` は home の URL search 密結合で流用不可。編集初期値は loader で `tagIds`→名前へ逆解決。
4. `SavedViewsList/index.tsx` の row-actions に「編集」ボタン。

### 機能2: ビューの複製

1. **usecase `duplicateSavedView`**（`app/core/application/view/duplicateSavedView.ts`）。`{actorUserId, viewId}`。UoW 内で元 view findById→所有者検証→`SavedView.create`（新 ID・新 name・`isDefault:false`）。name は「`{元名} のコピー`」、衝突時 ` 2`,` 3`... 採番（60字上限 truncate）。query/displayMode/sort 継承。`detectBrokenConditions`→`markBroken` も実行。insert。
2. **server function `duplicateSavedViewFn`** + `duplicateSavedViewSchema = {viewId}`。
3. **UI**: row-actions に「複製」ボタン → `routerInvalidate`。

### 機能3: 壊れた条件の修復

1. **usecase `repairSavedView`**（`app/core/application/view/repairSavedView.ts`）。`{actorUserId, viewId}`。findById→所有者検証→`SavedView.repairBrokenConditions(view, now)`→変化なければ no-op、あれば `save`。薄い orchestration。
2. **server function `repairSavedViewFn`** + schema `{viewId}`。
3. **UI**: broken-banner 内に「修復」ボタン → `routerInvalidate`。

### 機能4: /views からの新規作成導線

1. **UI**: `Page.tsx` の page-header に「新しいビュー」ボタン。
2. クリックで空クエリの `ViewFormDialog`（機能1の共通 Dialog）を開く。`createSavedViewFn` 再利用。空クエリ（全 null/空配列）許容。

### 機能5: 壊れた条件の具体名表示（最重要・影響大）— Option A（削除時スナップショット）

1. **VO**: `BrokenConditionMarker` に `lastSeenName: string` 追加（valueObject.ts）。各 factory に name 引数。`equals`/マージは (kind,id) 同一性のみで name は無視（name 差で誤検知しない）。
2. **entity.ts `reconstruct`**: `lastSeenName` を渡す。旧データ欠落時フォールバック。
3. **削除イベント payload**: `tag.deleted`/`directory.deleted` に name、`note.purged` に title 追加。各 delete usecase は emit 時に渡すだけ。
4. **event decoder** schema に name フィールド追加（optional でフォールバック）。
5. **ハンドラ**: `handleTagDeletedEvent` 等が name を `BrokenConditionMarker.tag(id, name, now)` へ。
6. **adapter JSON**: `encode/decodeBrokenConditionsJson` に `lastSeenName`。`broken_conditions_json` は JSON テキストカラムなので **DB マイグレーション不要**。旧行はフォールバック decode。
7. **DTO**: `SavedViewDTO.brokenConditions` 要素に `lastSeenName`。`toSavedViewDTO` で射影。
8. **UI**: バナー文言を「削除済み{ディレクトリ|タグ|ノート} `{lastSeenName}` を参照しています」に。kind 別ラベル/アイコン、複数件は列挙。

## 設計判断

詳細は `adr.md` 参照。

- **ADR-A**: 具体名は Option A（削除時スナップショット）。表示時解決は hard-delete で原理的に不可。`broken_conditions_json` の JSON 拡張のみでマイグレーション不要。
- **ADR-B**: 複製の命名は「`{元名} のコピー`」自動採番。
- **ADR-C**: 編集/新規作成は共通 `ViewFormDialog` を mode 違いで共有。home の `SaveViewDialog` は別責務として残置。
- **ADR-D**: `?kind=` は現状維持（両表示）。タブ化は本 Issue 範囲外。

## リスクと注意点

- **機能5 の非対称マーカー**: イベント経路（name 付き）と `detectBrokenConditions` 経路（name なし）が同一 (kind,id) でマージされると、name なしが name 付きを潰しうる。`markBroken` マージで「既存に name があり incoming に無ければ保持」する配慮が必要。**テスト必須**。
- **イベント payload 後方互換**: outbox 滞留中の旧 payload（name なし）。decoder の name を optional + フォールバック。
- **旧 broken_conditions_json 行**: `lastSeenName` 欠落。decode フォールバック必須。
- **複製の name 採番と OCC**: 既存 create と同種のため新規リスクではない。
- **factory signature 変更の波及**: `BrokenConditionMarker` の全呼び出し点（ハンドラ3 + service.ts + adapter reconstruct + テスト fakes）。typecheck で漏れ検出。

## テスト方針

- **Domain（unit）**: VO 変更で `valueObject.test.ts`/`entity.test.ts` 更新。`markBroken` の name マージ非対称ケース回帰テスト追加。
- **Application（実 DB, `__tests__/*.test.ts`）**: `duplicateSavedView.test.ts` 新規（成功/採番衝突/Forbidden/壊れ込み複製）。`repairSavedView.test.ts` 新規（修復/no-op/Forbidden）。`updateSavedView` の query 編集経路。削除イベント→`lastSeenName` スナップ。
- **Adapter（integration）**: `broken_conditions_json` の `lastSeenName` round-trip、旧行フォールバック。
- **Frontend/手動**: server fn の型境界。ボタン mutation はブラウザ/integration で担保（`docs/test.md`）。
