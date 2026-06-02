# 実装計画 — Issue #323: UploadDialog editing tree-load effect の view 全体依存を解消する (Perf-M1)

**Issue:** #323
**作成日:** 2026-06-02
**複雑度:** 小規模

---

## 目的

`app/components/ingestion/UploadDialog.tsx` の directory tree をロードする `useEffect` の依存配列に `view` オブジェクト全体が含まれている。内部に `if (view.kind !== "editing") return;` の早期 return があるため副作用は無いが、`setView` で view object の identity が変わるたびに effect が再走する。依存をスカラー（`view.kind === "editing"` の boolean）に絞り、#258 / PR #322 で polling effect に適用したスカラー依存パターンと揃えて可読性・一貫性を改善する。

## スコープ

### 含まれるもの
- tree-load effect の依存配列を `view` 全体から `isEditing`（`view.kind === "editing"` の boolean）に変更
- effect 内の早期 return を派生 boolean を使う形に書き換え
- 古くなったコメント（「the dependency is a string discriminant」と実態が乖離）の更新

### 含まれないもの
- polling effect（#258 / PR #322 で対応済み）の再変更
- focus effect（既に `[view.kind]` に依存済み）の変更
- 振る舞いの変更（リファクタのみ。観測可能な挙動は不変）

## 実装ステップ

### 1. tree-load effect のスカラー依存化

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - effect の直前に派生スカラー `const isEditing = view.kind === "editing";` を導出（polling effect が `waitingJobId` 等を導出するのと同じパターン）
  - effect 本体の早期 return を `if (!isEditing) return;` に変更
  - 依存配列を `[view, tree.length, getTree]` → `[isEditing, tree.length, getTree]` に変更
  - コメントを実態に合わせて更新（「`view` 全体ではなく `isEditing` boolean に依存するので、`kind` が `editing` のまま view identity が変わっても再走しない」旨）
- **理由:** Issue の要件。over-broad な `view` 依存を排し、先行対応（#258）のスカラー依存パターンと一貫させる。

## 設計判断

- `view.kind` を直接依存配列に入れる選択肢もあるが、polling effect が名前付きスカラーを effect 外で導出する確立済みパターンに揃えるため、派生 boolean `isEditing` を導出する形を採用する。意図（「editing かどうか」だけに依存）がコード上明示される。ADR を起こすほどのトレードオフではないため plan.md 内に記録する。

## リスクと注意点

- 振る舞いは不変。`tree.length > 0` の再フェッチ抑止ガードはそのまま残るため、editing → waiting → editing（再生成）の遷移で `isEditing` が false→true に振れても再フェッチは発生しない（既存挙動と同一）。
- biome の `useExhaustiveDependencies` lint に適合させる（`isEditing` を依存に含める）。

## テスト方針

- 既存の `UploadDialog.test.tsx` のリグレッション確認（`pnpm test:unit`）。特に editing 遷移・tree ロード・再生成系のテストが pass すること。
- `pnpm typecheck` / `pnpm lint` がクリーンであること。
</content>
</invoke>
