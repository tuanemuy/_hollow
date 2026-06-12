# 実装計画 — Issue #664: P10 FilterBar: タグフィルタの連続トグルで lost update（last-write-wins）

**Issue:** #664
**作成日:** 2026-06-13
**複雑度:** 小規模

---

## 目的

FilterBar のタグチップを同一タスク内で連続トグルしたとき、すべてのトグルが `?tagNames=[...]` に累積反映されるようにする（現状は最後の 1 件で上書きされる lost update）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | タグチップを 3 連クリックすると 3 タグすべてが `tagNames` に反映される | Issue本文 | 1 |
| AC-2 | 選択済みタグの再クリックで該当タグだけが解除される（単発トグルの既存挙動維持） | Issue本文（既存挙動） | 1 |
| AC-3 | 全タグ解除で `tagNames` が URL から消える（`undefined` クリア） | 既存挙動維持 | 1 |
| AC-4 | 連続トグルの累積をユニットテストで検証する | テスト方針 | 2 |

## スコープ

### 含まれないもの
- `toggleTag` への `page: undefined` リセット追加（他フィルタは page をリセットするがタグは現状しない。挙動変更は別議論）
- 他フィルタ（date / visibility / referencing）の同種レース対策 — それらは「最後の値が勝つ」セマンティクスが正しい set 操作であり、トグルではないため lost update にならない

## 調査結果

- 関連ファイル:
  - `app/components/note/list/FilterBar.tsx` — `toggleTag`（L182-192）が原因箇所。レンダー時の `optimistic.tagNames` から次の配列 `arr` を事前計算し、`run` に渡す search updater が固定値 `arr` をクロージャで掴む
  - `app/components/note/list/homeSearch.ts` — `homeSearchUpdater(prev, patch)`: prev spread + patch overlay。patch 側で `undefined` を渡すとフィールドをクリア
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — happy-dom + mocked `router.navigate` のテスト基盤あり。navigate に渡された updater を `prev` 付きで呼んで検証できる
- 既存実装の状態: `useOptimistic` の reducer（`reduceFilters` の `toggleTag` ケース）は累積トグルを正しく処理する。URL 側だけが stale スナップショットの固定値で last-write-wins している
- 依存関係: ホームルートの `validateSearch` → loader。updater の出力形は変わらないため影響なし

## 設計

### UI / プレゼンテーション

`toggleTag` の次状態計算を search updater の**内側**へ移し、`prev.tagNames`（TanStack Router が渡す最新の search）を基準にトグルを計算する。optimistic 側は従来どおり `applyOptimistic({ type: "toggleTag", name })` がアクションキューで累積するので変更不要。

ドメイン・ユースケース・アダプター層への影響: なし（純粋なフロントエンドのレース修正）。

## 実装ステップ

### 1. toggleTag のトグル計算を search updater 内へ移動

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `toggleTag` を以下の形に変更する:

  ```ts
  const toggleTag = (name: string) => {
    run({ type: "toggleTag", name }, (prev) => {
      const p = prev as Partial<NoteListSearch>;
      const next = new Set(p.tagNames ?? []);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      const arr = [...next];
      return homeSearchUpdater(prev, {
        tagNames: arr.length === 0 ? undefined : arr,
      });
    });
  };
  ```

  ※ `prev` は `homeSearchUpdater` と同じ理由（クロスルート search union）で unknown 扱いになるため、同様のキャストが必要。
- **理由:** updater 実行時点の最新 search を基準にすることで、連続クリックが互いの結果に積み上がる（last-write-wins の解消）

### 2. 連続トグルの回帰テスト追加

- **対象ファイル:** `app/components/note/list/__tests__/FilterBar.test.tsx`
- **変更内容:** 同一タスク内で 3 つのタグチップを連続クリックし、navigate に渡された各 updater を順に `prev` チェーンで評価して、最終的に 3 タグすべてが `tagNames` に含まれることを検証するテストを追加。選択済みタグの解除（AC-2）と全解除での `undefined` クリア（AC-3）もカバー
- **理由:** AC-1〜AC-3 の回帰防止

## リスクと注意点

- TanStack Router の functional search updater が連続 navigate で「直前の navigate の結果」を `prev` として渡すことが前提（router の標準挙動）。Issue 本文の修正方向もこれに基づく。実機検証（manual-test）で 3 連クリックの累積を必ず確認する
- optimistic 表示と URL の最終状態が一致すること（reducer と updater のトグルロジックが同じ結果に収束すること）を確認する

## テスト方針

- ユニット: FilterBar.test.tsx に連続トグル累積・解除・全解除クリアのテストを追加（`pnpm test:unit`）
- 実機: `pnpm dev` でホームを開き、タグチップ 3 連クリック → URL に 3 タグ反映を確認（testing.md 参照）
