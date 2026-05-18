# PR Review #001 — feat(search): propagate visibility through searchOwnNotes + project real value

**PR:** #47
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数
- Verdict: **BLOCKED**（Warning 修正のため）

---

## Domain / Application

### Blockers
なし

### Warnings
なし

### Notes
- 既存パターンとの整合、port セマンティクスの規約 (ADR-002)、テスト契約の十分性すべて適切
- スコープ外の改変なし、ADR-003/004 の方針を厳格に維持

---

## Adapter / Infrastructure

### Blockers
なし

### Warnings

- **[W-001]** SELECT 句における `sd.visibility AS "visibility"` の配置位置がプラン記述と乖離している
  - 場所: `app/core/adapters/d1/searchIndex.ts:170-178`
  - 内容: plan.md L60 では「`sd.tag_names_json` の隣に配置」だが、実装は `tag_names_json` と `bm25(...)` の間。`SearchRow` 型定義 (L28-37) でも `score` の後に `visibility` が来ており、SELECT 句との順序がさらに食い違う
  - 動作影響: ドライバが column 名で alias マッピングするため動作上の問題はない
  - 提案: 型と SELECT 句の順序を `tagNamesJson, visibility, score` で揃える

### Notes
- FTS join 修正 (`sd.note_id = fts.rowid` → `sd.rowid = fts.rowid`) は migration 0001 の FTS5 DDL (`content_rowid='rowid'`) と整合しており正しい
- `Visibility.create` のエラー変換、SQL injection 安全性、クエリプラン影響、書き込み経路無変更すべて適切

---

## Frontend / Loader

### Blockers
なし

### Warnings
なし

### Notes
- `toVisibilityArr` DRY 化、型整合、`mode` 値の保持 (ADR-004)、optional spread パターンすべて適切
- スコープ外の UI 改修 (`NoteList.tsx` / `ListView.tsx` / `TileView.tsx`) は混入なし

---

## Test

### Blockers
なし

### Warnings

- **[W-002]** D1 SearchIndex の integration test 欠如が ADR-005 (FTS join バグ) を看過した事実への対応がない
  - 場所: `.issue/29/adr.md` L181 / `app/core/adapters/d1/__tests__/`（存在しない）
  - 内容: ADR-005 自身が「fake `SearchIndex` を使った unit テストでは検出できない」と認めているが、本 PR には D1 integration test も最小リグレッションケースも追加されていない。先送りする場合は ADR-003 のフォロー Issue 文言に「D1 SearchIndex integration test 新規ハーネス整備」を明示的スコープとして追加すべき
  - 提案: フォロー Issue 起票方針として ADR-003 の対象スコープに明記する（integration test ハーネス新設は数時間規模のため別 Issue 化が妥当）

- **[W-003]** 既存 `forwards the keyword + ownerId filter` ケース内で「`visibility` 未指定時の 3 値デフォルト」も同時検証している
  - 場所: `app/core/application/search/__tests__/searchOwnNotes.test.ts:115-119`
  - 内容: 1 ケース内に 4 つの異なる契約（keyword 伝達 / ownerId 伝達 / 配列返却 / visibility デフォルト）が assertion されており、退行時にどの契約が壊れたか test 名から判別できない
  - 提案: `it("defaults visibilityFilter to all three when visibility is omitted")` 等の独立ケースに切り出す

### Notes
- plan.md「テスト方針」の新規ケースは全て実装済み
- `makeHit` shape 補修は両ファイル適切（own='private' / public='public' のデフォルトで取り違え回避）
- DTO 投影テストは 3 visibility 網羅で配列順序まで assertion している点が良い

---

## Design Decisions
特になし（既存 ADR-001..006 で十分カバー）

---

## 対応方針

- **W-001**: 修正する（`SearchRow` 型と SELECT 句の順序を `tagNamesJson, visibility, score` に揃える）
- **W-002**: ADR-003 のフォロー Issue 文言を更新し、D1 SearchIndex integration test 新規ハーネス整備をスコープに明示する（integration test 自体の追加は別 Issue 化）
- **W-003**: 修正する（独立ケース `defaults visibilityFilter to all three when visibility is omitted` を追加）
