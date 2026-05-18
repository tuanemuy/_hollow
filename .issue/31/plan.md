# 実装計画 — Issue #31: SavedView に visibility フィルタを永続化

**Issue:** #31
**作成日:** 2026-05-18
**複雑度:** 中〜大規模（複数レイヤーに波及。ただし Issue #8 の `referencingNoteId` 対応と完全同形のパターン適用）

---

## 目的

Issue #8 (PR #28) のフォローアップ。`?visibility=public` 等の URL を SavedView として保存しても復元時に消失する不具合を解消する。ADR-007（Issue #8）で「`visibilityFilter` の永続化全域はドメイン VO 拡張を伴うため別 Issue へ切り出し」と合意済みで、本 Issue がそれを実装する。

---

## スコープ

### 含まれるもの

- `ViewQuery` 値オブジェクトに `visibilityFilter` フィールドを追加（ドメイン）
- `SavedView.reconstruct` の `ReconstructInput` / repair 系処理を更新（ドメイン）
- `D1SavedViewRepository` の `encodeQueryJson` / `decodeQueryJson` / `StoredQueryJson` 拡張（アダプター）
- `ViewQueryDTO` と `toViewQueryDTO` の拡張（アプリケーション）
- `createSavedView` / `updateSavedView` ユースケースの入力受け入れ（アプリケーション）
- フロントエンド `view/schema.ts` の `createSavedViewSchema.query`、`view/actions.ts`、`SaveViewDialog` ペイロード組み立て
- `listSelectors.searchToViewQuery` / `viewQueryToSearch` / `viewQueryEquals` で visibility を往復
- 既存テストの追従（`ViewQuery.create` 呼び出し箇所、selectors テスト）と、新フィールド向けのテスト追加

### 含まれないもの

- search 経路（`?q=...`）への visibility 入力伝達 — ADR-008（Issue #8）で別 Issue 化
- `?viewId=...` 選択時に URL を rewrite する UX — ADR-007（Issue #8）の見送り項目を継続
- `countByOwner` の filter 反映 — ADR-009（Issue #8）の見送り項目を継続
- 既存の JSON 列（`query_json`）に対するマイグレーション — 既存行は `visibilityFilter` キーを欠くだけで Issue #31 のデコード処理が「未指定 = フィルタなし」として後方互換に扱える設計とする（マイグレーション不要）

---

## 設計判断のサマリー

詳細は `.issue/31/adr.md` を参照。

- **ADR-001 (本 Issue)**: `ViewQuery.visibilityFilter` の型は `readonly PublicationVisibility[]`、空配列 `[]` = 「フィルタなし」とする。`tagIds` と同じ multi-valued 慣行に合わせ、`null` は使わない
- **ADR-002 (本 Issue)**: URL 側は `visibility` 単一 enum のまま。selectors で `?visibility=public` ↔ `[publication]` を境界変換する（Issue #8 ADR-001 の port-側-配列・URL-側-単一値ポリシーをそのまま踏襲）
- **ADR-003 (本 Issue)**: 既存 JSON 行で `visibilityFilter` キーが欠ける場合は「フィルタなし」（空配列）として解釈する後方互換デコードを採用。マイグレーションは不要

---

## 実装ステップ

### 1. ドメイン: `ViewQuery` 値オブジェクトに `visibilityFilter` 追加

- **対象ファイル:** `app/core/domain/view/valueObject.ts`
- **変更内容:**
  - `import type { PublicationVisibility } from "@/core/domain/publication/valueObject"` を追加
  - `ViewQuery` 型に `readonly visibilityFilter: readonly PublicationVisibility[]` を追加
  - `ViewQuery.create` の params にも `visibilityFilter: readonly PublicationVisibility[]` を追加。重複は `tagIds` と同じパターンで `Set` で除去し `Object.freeze` する
  - `ViewQuery.empty()` に `visibilityFilter: Object.freeze([])` を含める
  - `ViewQuery.equals` に長さ比較と要素比較を追加。要素順は意味を持たないので、ソート済みインデックス比較とせず素直に位置比較とする（`tagIds` と同様の構造同値を採る — フロントから入る配列は単一値なので順序問題は実害なし）

### 2. ドメイン: `SavedView.reconstruct` を更新

- **対象ファイル:** `app/core/domain/view/entity.ts`
- **変更内容:**
  - `ReconstructInput.query` に `visibilityFilter: readonly string[]` を追加
  - `reconstruct` 内で `visibilityFilter` を `PublicationVisibility.create` 経由で再検証してから `ViewQuery.create` に渡す
  - `repairBrokenConditions` は visibility 値が enum リテラルで「削除されることがない」ため変更不要（broken-condition の対象外）

### 3. アダプター: `D1SavedViewRepository` の JSON 入出力

- **対象ファイル:** `app/core/adapters/d1/repositories/savedViewRepository.ts`
- **変更内容:**
  - `StoredQueryJson` 型に `visibilityFilter: readonly string[]` を追加
  - `decodeQueryJson` で `visibilityFilter` を読む。**キー欠落時は空配列**として扱う（ADR-003、後方互換）。型ガードは `isStringArray` を流用
  - `encodeQueryJson` で `visibilityFilter: view.query.visibilityFilter` を出力
  - `toSavedView` の `ViewQuery` 受け渡し部分に `visibilityFilter: storedQuery.visibilityFilter` を追加

### 4. アプリケーション: DTO の拡張

- **対象ファイル:** `app/core/application/dto/view.ts`
- **変更内容:**
  - `ViewQueryDTO` に `readonly visibilityFilter: readonly ("private" | "unlisted" | "public")[]` を追加（DTO レイヤーは brand 型を持たないので literal union で表現）
  - `toViewQueryDTO` で `visibilityFilter: query.visibilityFilter.map((v) => v)` を出力（型シグネチャ整合のため浅いコピー）

### 5. アプリケーション: usecase の input 受け入れ

- **対象ファイル:** `app/core/application/view/createSavedView.ts`
- **変更内容:**
  - `CreateSavedViewInput.query` に `visibilityFilter: readonly ("private" | "unlisted" | "public")[]` を追加
  - `buildQuery` で `PublicationVisibility.create` を通して `ViewQuery.create` に渡す（不正値は `BusinessRuleError` で弾かれる）
- **対象ファイル:** `app/core/application/view/updateSavedView.ts`
- **変更内容:** 同様に `UpdateSavedViewInput.query` と `buildQuery` を拡張

### 6. フロントエンド: `view/schema.ts` の Zod スキーマ

- **対象ファイル:** `app/components/view/schema.ts`
- **変更内容:**
  - `createSavedViewSchema.query` に `visibilityFilter: z.array(z.enum(["private","unlisted","public"])).default([])` を追加
  - 同ファイル内に visibility 用 enum 定数を新設するか、`@/components/note/schema` で既に定義済みの `visibilitySchema` を `export` して再利用する（重複定義を避ける）— 後者を採用

### 7. フロントエンド: `view/actions.ts` のサーバーアクション

- **対象ファイル:** `app/components/view/actions.ts`
- **変更内容:** `createSavedView` 呼び出し時の `query` に `visibilityFilter: data.query.visibilityFilter` を載せる

### 8. フロントエンド: `SaveViewDialog` のペイロード組み立て

- **対象ファイル:** `app/components/note/list/SaveViewDialog.tsx`
- **変更内容:** `searchToViewQuery(search)` の戻り値 `payload.query.visibilityFilter` を `create({ data: { query: { ..., visibilityFilter } } })` に載せる

### 9. フロントエンド: `listSelectors` の往復関数

- **対象ファイル:** `app/components/note/list/listSelectors.ts`
- **変更内容:**
  - `SaveViewPayload.query` 型に `visibilityFilter: readonly ("private"|"unlisted"|"public")[]` を追加
  - `searchToViewQuery`: `search.visibility !== undefined` のとき `visibilityFilter: [search.visibility]`、未指定なら `[]`
  - `viewQueryToSearch`: `view.query.visibilityFilter.length > 0` のとき `out.visibility = view.query.visibilityFilter[0]`（先頭値を URL に反映）。長さ 0 の場合は省略
  - `viewQueryEquals`: `visibilityFilter` の長さ比較と位置比較を追加

### 10. テストの追従

- **対象ファイル:**
  - `app/core/domain/view/__tests__/valueObject.test.ts`
  - `app/core/domain/view/__tests__/valueObject.property.test.ts`
  - `app/core/domain/view/__tests__/entity.test.ts`
  - `app/core/domain/view/__tests__/entity.property.test.ts`
  - `app/components/note/list/__tests__/listSelectors.test.ts`
- **変更内容:**
  - 既存の `ViewQuery.create` 呼び出しに `visibilityFilter: []` を追加（コンパイル維持）
  - `valueObject.test.ts` に `visibilityFilter` 関連の新テストを追加:
    - `empty()` が空配列を返す
    - `equals` が長さ違い / 値違いで `false` を返す
    - `create` が freeze と重複除去を行う
  - `listSelectors.test.ts` に `visibility` 往復テストを追加:
    - `searchToViewQuery({ visibility: "public" })` → `query.visibilityFilter === ["public"]`
    - `searchToViewQuery(baseSearch)` → `query.visibilityFilter === []`
    - `viewQueryToSearch({ visibilityFilter: ["unlisted"] })` → `out.visibility === "unlisted"`
    - `viewQueryToSearch({ visibilityFilter: [] })` → `"visibility" in out === false`
    - `viewQueryEquals` の visibility 差分検出

### 11. （オプショナル）D1 統合テスト

- **対象ファイル:** `app/core/adapters/d1/__tests__/` 配下に `savedViewRepository.integration.test.ts` が存在しないため新規追加は本 Issue では行わない（既存方針に従う）
- ドメイン + 単体テストでデコード/エンコードのラウンドトリップを担保する代わりに、`savedViewRepository.ts` の encode/decode を直接 unit-test する。場所は `app/core/adapters/d1/repositories/__tests__/savedViewRepository.test.ts` を新規（必要なら）
- **判断**: 既存実装に encode/decode の単体テストが存在しない（リポジトリの責務をドメインの reconstruct とアダプターの JSON 取り扱いに分離している設計）ので、本 Issue でも encode/decode は型レベルで担保し、手動 manual-test で URL → 保存 → 復元のラウンドトリップを検証する方針とする

---

## リスクと注意点

- **JSON 列の後方互換**: 既存の SavedView 行は `query_json` に `visibilityFilter` キーを持たないが、`decodeQueryJson` でキー欠落時に空配列を返すようにするので破壊変更にならない。テストで必ず確認すること
- **`ViewQuery.create` の呼び出し箇所**: 既存テストファイル（5 箇所）でビルド失敗を招く。実装と同じコミットで追従させる
- **`countByOwner` 表示乖離**: ADR-009 で既知の暫定挙動。本 Issue では拡大しない（visibility フィルタ追加で表示乖離が増えるが、Issue #8 で既に許容済み）
- **URL → SavedView の片道圧縮**: URL は single value、ViewQuery は array。ユーザーが SavedView を直接 API で作成して `["public","unlisted"]` のような複数値を保存すると、`viewQueryToSearch` は先頭値だけ URL に出すため SavedView 復元 → URL 化 → 再パースで「unlisted が落ちる」非対称が起こる。**ただし** 本 Issue の UI 経路では SaveViewDialog 経由でしか保存しないので長さは常に 0 か 1、実害なし。ADR-002 で「将来 multi-select 拡張時に URL schema 側を更新する」と明記する

---

## テスト方針

### 自動テスト
- `pnpm test:unit` 内のドメイン value object / selectors テストで以下を担保:
  - `ViewQuery.equals` が `visibilityFilter` 差分を検出する
  - `searchToViewQuery` / `viewQueryToSearch` の visibility 往復
  - `viewQueryEquals` の visibility 差分

### 手動テスト（testing.md 参照）
- ブラウザで `?visibility=public` をセット → SavedView 保存 → ページリロード後 `?viewId=<id>` → visibility が復元され URL と一致表示されること

---

## レビュー反映

レビューはまだ実施していない。Phase 3 で実装後にレイヤー別 PR レビューを通す。
