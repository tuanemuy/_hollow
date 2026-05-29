# 実装計画 — Issue #273: pillBtn (common) と PILL_BTN (layout) を 1 系統に集約する

**Issue:** #273
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

pill ボタンのスタイル定義が `app/components/common/styles.ts` の `pillBtn` / `pillBtnPrimary` / `pillBtnDanger` と、`app/components/layout/styles.ts` の `PILL_BTN` の 2 系統に分かれており、class 文字列がほぼ重複している。将来一方だけ更新されると再び乖離するリスクがあるため、1 系統に集約して単一の真実の源 (SSOT) にする。

## スコープ

### 含まれるもの

- 統合先を **common 側 (`pillBtn` / `pillBtnPrimary` / `pillBtnDanger`)** に決定（Issue 本文のリードに従う。ユーザー確認済み）
- canonical `pillBtn` に `active:scale-[0.985] motion-reduce:active:scale-100`（押下アニメ）を付与し、全 pill ボタンの挙動を統一（ユーザー確認済み）
- `app/components/layout/styles.ts` の `PILL_BTN` を削除
- `PILL_BTN` を import している 8 ファイルを common 側 API に移行
- ADR に統合判断と差分の扱いを記録

### 含まれないもの

- `app/components/public/styles.ts` の `PILL_BTN`（public レイアウト専用の**別系統**。Issue が対象とするのは common と layout の 2 系統のみ。public 版は class 内容も異なり [`data-[danger]` / `active:scale` なし]、consumer も public 配下に閉じているためスコープ外）
- `app/components/layout/styles.ts` の `ROW_ACTIONS_SMALL_PILL`（pill 形状だが高さ 30px の別バリアント。consumer 不在で本 Issue の重複対象でもないため触らない）
- pill ボタンの新規 variant 追加やデザイン刷新

## 調査結果

### 関連ファイル

- **定義**
  - `app/components/common/styles.ts` — `pillBtn`（base） / `pillBtnPrimary`（`data-[primary]:` 駆動の add-on） / `pillBtnDanger`（`${pillBtn} bg-error-surface text-error hover:bg-error-surface`）
  - `app/components/layout/styles.ts` — `PILL_BTN`（`data-[primary]:` / `data-[danger]:` を inline 内包 + `active:scale-[0.985] motion-reduce:active:scale-100`）
- **`PILL_BTN`（layout）consumer = 8 ファイル**
  1. `app/components/layout/Header.tsx`
  2. `app/components/ingestion/IngestionJobRow.tsx`
  3. `app/components/ingestion/IngestionPreviewForm.tsx`
  4. `app/components/identity/AccountDeleteForm/index.tsx`
  5. `app/components/trash/TrashList.tsx`
  6. `app/components/trash/TrashRowActions.tsx`
  7. `app/components/tag/TagActions.tsx`
  8. `app/components/tag/CreateTagForm.tsx`
- **common 側 consumer = ~28 ファイル**（移行不要。`active:scale` 付与による軽微な視覚変化のみ受ける）
- テストで `PILL_BTN` を参照しているファイルは**なし**（grep で確認済み）

### あるべきアーキテクチャ

CLAUDE.md「Styling」より:
- 状態スタイルは `data-*` 属性 + `data-[name]:` variant で表現する
- 繰り返す utility 文字列は module-scoped 定数に切り出す（`common/styles.ts`, `layout/styles.ts` 等は既存の正規パターン）

`common/styles.ts` は「domain-agnostic な共通 UI primitive」の置き場、`layout/styles.ts` は「authenticated app shell」専用。pill ボタンは ingestion / note / tag / trash / identity / directory / layout と全域で使われる domain-agnostic primitive のため、正規の置き場は **common** が妥当。Issue 本文のリードとも一致する。

### 既存実装の状態と差分

`pillBtn`（common）と `PILL_BTN`（layout）の機能差分:

| 機能 | PILL_BTN | pillBtn | 統合後の扱い |
|------|----------|---------|------------|
| `active:scale-[0.985]` + `motion-reduce:active:scale-100` | あり | なし | **pillBtn に付与**（ユーザー確認済み。全 pill 統一） |
| `data-[primary]:*` | inline 内包 | `pillBtnPrimary` add-on で提供 | `${pillBtn} ${pillBtnPrimary}` + `data-primary` で等価 |
| `data-[danger]:*` | inline 内包 | `pillBtnDanger`（無条件適用 + `hover:bg-error-surface`） | `pillBtnDanger` に置換、`data-danger` 属性は除去 |

差分のうち danger の hover 挙動に注意（詳細は ADR-001 参照）:
- `PILL_BTN` + `data-danger`: hover で base の `hover:bg-surface-hover` が当たり赤が外れる
- `pillBtnDanger`: `hover:bg-error-surface` で hover 時も赤を維持
- → 移行後、layout 系 danger ボタンは hover で赤を維持するようになる（軽微な視覚改善。ADR に記録）

### 依存関係

- 純粋なスタイル定数の統合のみ。ロジック・ポート・データフローへの影響なし
- `PILL_BTN` を他の定数（`FORM_ERROR` / `ROW_ACTIONS`）と同時に import しているファイル（TrashRowActions, TagActions, IngestionPreviewForm）は、それらの import は残し `PILL_BTN` のみ common import へ移す

## 実装ステップ

### 1. canonical `pillBtn` に押下アニメを付与＋`pillBtnDanger` を data 駆動 variant 化

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - `pillBtn` の `active:bg-surface-hover` の直後に `active:scale-[0.985] motion-reduce:active:scale-100` を追加する。
  - `pillBtnDanger` を `` `${pillBtn} bg-error-surface ...` `` から data 駆動 variant `"data-[danger]:bg-error-surface data-[danger]:text-error data-[danger]:hover:bg-error-surface"` に作り変える（**実装中にブラウザ検証で灰色描画バグが判明したため。adr.md ADR-003**）。
- **理由:** PILL_BTN の押下フィードバックを失わせず common 系と統一。また `pillBtnDanger` の素 utility が `pillBtn` の `bg-surface` に負けて灰色になる既存バグを variant 化で解消し、primary と対称の機構にする。

> 当初計画では「`pillBtnDanger` は変更しない」としていたが、ブラウザ検証の結果バグが判明したため方針を更新した。これに伴い `pillBtnDanger` の全 consumer（移行 6 + 既存 NoteActions / ConfirmDialog / BulkActionBar の 3）を `` `${pillBtn} ${pillBtnDanger}` `` + `data-danger=""` に統一する（下記ステップ 3 と同形）。

### 2. layout 側 `PILL_BTN` の削除

- **対象ファイル:** `app/components/layout/styles.ts`
- **変更内容:** `PILL_BTN` の export 定数（18-19 行付近）を削除する。`ROW_ACTIONS_SMALL_PILL` など他の定数は残す。
- **理由:** 重複系統の解消。SSOT を common に一本化。

### 3. 8 consumer の import を common へ移行し className を置換

各ファイルで以下を行う:
- import: `PILL_BTN`（from `../layout/styles` または `@/components/layout/styles`）を削除し、`pillBtn`（必要なら `pillBtnPrimary` / `pillBtnDanger`）を `@/components/common/styles` から import する。既に common から import している箇所があればマージする。残りの layout 定数（`FORM_ERROR` / `ROW_ACTIONS`）の import は維持。
- className 置換ルール:
  - `className={PILL_BTN}`（plain） → `className={pillBtn}`
  - `className={PILL_BTN} data-primary=""` → `className={\`${pillBtn} ${pillBtnPrimary}\`}`（`data-primary=""` 属性は維持）
  - `className={PILL_BTN} data-danger=""` → `className={\`${pillBtn} ${pillBtnDanger}\`}`（`data-danger=""` 属性は維持。**当初は `pillBtnDanger` 単独に置換する計画だったが、ブラウザ検証で `pillBtnDanger` の灰色描画バグが判明し data 駆動 variant に作り変えたため。adr.md ADR-003 参照**）

ファイル別の具体箇所:

- **`app/components/layout/Header.tsx`**
  - L57 plain+`data-primary` → `${pillBtn} ${pillBtnPrimary}`（data-primary 維持）
  - L61 plain → `pillBtn`
- **`app/components/ingestion/IngestionJobRow.tsx`**
  - L175(+L176 data-primary) → `${pillBtn} ${pillBtnPrimary}`（data-primary 維持）
  - L185 plain → `pillBtn`
  - L194(+L195 data-danger) → `pillBtnDanger`（data-danger 除去）
  - L207(+L208 data-danger) → `pillBtnDanger`（data-danger 除去）
  - L222 plain → `pillBtn`
- **`app/components/ingestion/IngestionPreviewForm.tsx`**（既に common から import あり = L22）
  - L372 plain → `pillBtn`
  - L380(+L381 data-danger) → `pillBtnDanger`（data-danger 除去）
  - L389 plain → `pillBtn`
  - L398(+L399 data-primary) → `${pillBtn} ${pillBtnPrimary}`（data-primary 維持）
  - import: L28 の layout import から `PILL_BTN` を除き `FORM_ERROR` は残す。`pillBtn`/`pillBtnPrimary`/`pillBtnDanger` を L22 の common import に追加
- **`app/components/identity/AccountDeleteForm/index.tsx`**
  - L84(+L85 data-danger) → `pillBtnDanger`（data-danger 除去）
  - import: `@/components/common/styles` から `pillBtnDanger`
- **`app/components/trash/TrashList.tsx`**
  - L60 plain → `pillBtn`
- **`app/components/trash/TrashRowActions.tsx`**
  - L59 plain → `pillBtn`
  - L68(+L69 data-danger) → `pillBtnDanger`（data-danger 除去）
  - import: layout から `FORM_ERROR`, `ROW_ACTIONS` は残し `PILL_BTN` を除く。common から `pillBtn`, `pillBtnDanger`
- **`app/components/tag/TagActions.tsx`**
  - L86(+L87 data-primary) → `${pillBtn} ${pillBtnPrimary}`（data-primary 維持）
  - L96 plain → `pillBtn`
  - L110 plain → `pillBtn`
  - L120 plain → `pillBtn`
  - L130(+L131 data-danger) → `pillBtnDanger`（data-danger 除去）
  - import: layout から `FORM_ERROR`, `ROW_ACTIONS` は残し `PILL_BTN` を除く。common から `pillBtn`, `pillBtnPrimary`, `pillBtnDanger`
- **`app/components/tag/CreateTagForm.tsx`**
  - L63(+L64 data-primary) → `${pillBtn} ${pillBtnPrimary}`（data-primary 維持）
  - import: layout から `PILL_BTN` を除く。common から `pillBtn`, `pillBtnPrimary`

> 注: 行番号は調査時点のもの。実装時は実ファイルを読んで現在の位置を確認する。

### 4. 検証

- `pnpm typecheck`（未使用 import / 削除した `PILL_BTN` 参照漏れを検出）
- `pnpm lint:fix && pnpm format`
- `grep -rn "PILL_BTN" app/ --include="*.tsx" --include="*.ts" | grep -v "components/public/"` で public 以外の `PILL_BTN` 参照が 0 件であることを確認（public/styles.ts とその consumer の PILL_BTN は別系統として残る = 正常）

## 設計判断

- **統合先 = common（`pillBtn`/`pillBtnPrimary`/`pillBtnDanger`）。** 詳細は adr.md ADR-001。
- **押下アニメは全 pill に統一付与。** 詳細は adr.md ADR-001。
- **public/styles.ts の PILL_BTN はスコープ外。** Issue が名指しする 2 系統に含まれない別系統。

## リスクと注意点

- **danger ボタンの hover 挙動変化**: 移行した 8 系統の danger ボタン（IngestionJobRow 破棄、IngestionPreviewForm 破棄、AccountDeleteForm 削除開始、TrashRowActions 完全削除、TagActions 削除）が hover 時に赤を維持するようになる（従来は灰色化）。軽微な視覚改善だがブラウザ目視で確認する。
- **押下アニメの全体波及**: common 系 ~28 ボタンが押下時に微縮するようになる。`motion-reduce:active:scale-100` で reduced-motion ユーザーには無効化される。
- **import 漏れ/未使用 import**: PILL_BTN 削除後の参照漏れ・未使用 import は `pnpm typecheck` と biome で検出する。
- **`data-danger` 属性除去の漏れ**: `pillBtnDanger` は無条件適用なので `data-danger` 属性は不要。残しても無害だが、混乱を避けるため除去する。除去漏れがあっても見た目は変わらない。

## テスト方針

詳細は testing.md。要点:
- ブラウザで primary / 通常 / danger の各 pill ボタンが従来どおり表示・動作すること
- 押下時に微かな縮小アニメが出ること（全 pill）
- danger ボタンが hover で赤を維持すること
- 自動: `pnpm typecheck` / `pnpm lint` / `pnpm test`

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**要件カバレッジ視点 / アーキ・リスク視点とも「問題点ゼロ」**。8 consumer の網羅性・置換ルール・public スコープ外判断・class 文字列 diff（3 機能差分に過不足なし、`data-[primary]:active:bg-accent-pressed` 欠落なし、class 順序は無影響）・typecheck+biome+grep の検出手段の実効性をいずれも実コードと照合して確認。

**取り込んだ改善提案**:
- S-001（要件視点）: 検証 grep を public 除外の明示形に修正
- S-003（アーキ視点）: ADR-001 に「将来 small pill が必要になったら common 側 variant で足す」一文を追記し再 2 系統化を予防

**反映済みだが追加対応不要と判断**:
- S-001/S-002（アーキ視点）: ConfirmDialog 等 dialog 内ボタンの押下確認・danger の active 挙動は testing.md「#4 押下アニメ（全 pill 共通）」「#3 danger」で実質カバー済み
