# PR #666 レビュー — General（Round 2 / ゼロベースフルレビュー）

対象: Issue #664「FilterBar: タグフィルタの連続トグルで lost update」
計画: `.issue/664/plan.md`
前提: Round 1 の W-001（トグルロジック重複）への対応として `toggleInSet` ヘルパー抽出が反映済み。

## 受け入れ基準の検証

| AC | 内容 | 判定 |
|---|---|---|
| AC-1 | 3 連クリックで 3 タグすべて `tagNames` に反映 | 満たす。`toggleTag` がトグル計算を search updater 内（`prev.tagNames` 基準）で行い、ユニットテスト "accumulates three rapid toggles"（updater の prev チェーン評価で `["alpha","beta","gamma"]`）＋実機 TC-1（batch 3 連クリックで URL に 3 タグ累積）で検証済み |
| AC-2 | 選択済みタグの再クリックで該当タグのみ解除 | 満たす。"deselects only the re-clicked tag" ＋ TC-2 |
| AC-3 | 全解除で `tagNames` が URL から消える | 満たす。`arr.length === 0 ? undefined : arr` を維持。テストは `final.tagNames === undefined` に加え `"tagNames" in final === true`（明示 undefined によるクリアが homeSearchUpdater の patch overlay に届くこと）まで固定 |
| AC-4 | 連続トグルの累積をユニットテスト検証 | 満たす。`chainUpdaters` が router の functional-updater prev チェーンをシミュレートし、旧実装（固定値クロージャ）への回帰では AC-1 テストが `["gamma"]` で確実に落ちる |

スコープ遵守も確認: `toggleTag` への `page: undefined` 追加なし、他フィルタ（set セマンティクスで lost update にならない）への波及変更なし。

検証実行: `pnpm vitest run FilterBar.test.tsx` → 23 passed、`pnpm typecheck` → クリーン。

## Round 1 指摘の解消確認

- **W-001（解消）**: `toggleInSet(names, name)` が `app/components/note/list/FilterBar.tsx:72-77` に抽出され、optimistic reducer の `toggleTag` ケース（L97-98）と navigate 時 updater（L193）の両方が同一実装を共有。乖離リスクは構造的に解消された。ヘルパー上のコメントも「なぜ共有するか」の why のみで規約準拠。

### General

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 修正アプローチは正しい。レースの根本原因（レンダー時スナップショット `optimistic.tagNames` から事前計算した固定値 `arr` を updater クロージャが掴む）を、TanStack Router が updater 実行時点で渡す `prev` 基準の計算に置換しており、last-write-wins を解消している。optimistic 側は `useOptimistic` のアクションキューが元から累積するため無変更で正しく、`run` の共通経路（transition + navigate await + 失敗時 baseline 復帰）も無変更
- **[N-002]** plan は `prev as Partial<NoteListSearch>` のキャストを想定していたが、`run` の `nav` パラメータが既に `(prev: Partial<NoteListSearch>) => Partial<NoteListSearch>` と型付けされているためキャスト不要で着地。計画より型安全な良い逸脱
- **[N-003]** ユニットテストの `chainUpdaters` は「router が直前 navigate の結果を `prev` として渡す」前提のシミュレーションであり、router 実機の prev 挙動自体はユニットでは担保されない。この限界は plan のリスク項目どおり manual-test（TC-1 の batch click、TC-E1 の eval 同一タスク内連打）で補完されており、TC-E1 レポートが初回 FAIL を agent-browser の ref 失効による偽陽性と切り分けたうえで再検証している点も誠実
- **[N-004]** TagPickerPopover（"+ タグ" リストボックス）も同じ `toggleTag` を呼ぶため、パネル経由の連続トグルにも修正が効く。既存 #478/#467 系テスト（楽観表示・ロールバック・パネル維持）も全件グリーンで既存挙動の退行なし

## 結論

APPROVED。Blockers / Warnings なし。
