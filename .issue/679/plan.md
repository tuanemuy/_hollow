# 実装計画 — Issue #679: プレビュー編集でタグを削除しても LLM 提案タグが commit 時に復活する

**複雑度:** 小規模
**作成日:** 2026-06-13

## 目的

取り込みプレビューの編集フォームでユーザーがタグ（特に LLM 提案タグ）を削除して保存しても、commit 時に削除したタグが復活してしまうバグを直す。編集フォームのタグリストを最終結果の単一の真実（authoritative）にする。

## 原因

`app/core/application/ingestion/commitIngestionPreview.ts` の commit 時、タグが常にユーザー指定タグと LLM 提案タグの和集合になっている:

```ts
const mergedTagNames = [
  ...explicitTagNames,          // フォームのタグ
  ...preview.suggestedTagNames, // プレビュー生成時の LLM 提案タグ
];
```

フロントエンド（`IngestionPreviewForm`）は既に `preview.suggestedTagNames` を初期値としてタグ入力欄に展開し、submit 時は編集後の全タグリストを `tagNames` として送っている。にもかかわらずバックエンドが `preview.suggestedTagNames` を無条件に再マージするため、削除したタグが戻る。

## 設計

レイヤーはアプリケーション層のみ。ドメインモデルへの影響はない（`NoteService.assembleFromInputs` の責務は不変 — declaredTagNames と本文抽出タグのマージはそのまま）。

`commitIngestionPreview` のタグ解決を、同関数内の `title` / `frontMatter` / `directoryId` と同じ「modification があればそれを使い、なければ preview にフォールバック」パターンに揃える:

```ts
const tagNames =
  mods.tagNames === undefined
    ? preview.suggestedTagNames   // フォーム未関与 / API 呼び出し元が指定しない場合のみ提案タグを使う
    : explicitTagNames;           // フォームのタグリストが authoritative（空配列含む）
```

### マージ仕様の整理（優先順位）

- **フォーム/呼び出し元が `tagNames` を指定（`undefined` でない、空配列含む）**: そのリストが最終的な宣言タグ。`preview.suggestedTagNames` は再マージしない。
- **`tagNames` 未指定（`undefined`）**: 後方互換として `preview.suggestedTagNames` をフォールバック初期値に使う。
- **Front Matter 由来タグ**: 現状そもそも commit 時にタグへ合流していない（front matter は別フィールドで保存され、`assembleFromInputs` のタグ抽出は本文 HTML のインラインタグのみ対象）。よって優先順位の検討対象外。本 Issue で挙動変更しない。
- **本文インラインタグ（`assembleFromInputs` の `tagsFromBody`）**: 宣言タグの後ろにマージされる既存挙動は維持（本 Issue のスコープ外）。

`explicitTagNames` の VO 化（`TagName.create`）は既存どおり関数冒頭で行い、エラーは UoW 前に surface させる。

## 受け入れ基準

| ID | 基準 | 検証 |
| --- | --- | --- |
| AC-1 | フォームで一部の提案タグを削除して commit すると、削除したタグはノートに付かない | integration test（提案タグ2件 → 1件だけ指定して commit → ノートのタグが1件） |
| AC-2 | フォームで全タグを削除（空配列）して commit すると、ノートにタグが付かない | integration test（`tagNames: []` → ノートのタグ0件） |
| AC-3 | `tagNames` を指定しない（`undefined`）場合は従来どおり `preview.suggestedTagNames` が付く | integration test（modifications にタグ無し → suggestedTagNames が付く） |
| AC-4 | ユーザーが新規タグを追加した場合はそのタグが付く | integration test（提案に無いタグ名を指定 → そのタグが付く） |
| AC-5 | 既存の commit 系テストがすべて green | `pnpm test:integration` |

## 実装ステップ

1. `commitIngestionPreview.ts`: `mergedTagNames` の組み立てを上記フォールバックパターンに変更（`explicitTagNames` は維持しつつ、`undefined` 判定で分岐）。`assembleFromInputs` への `declaredTagNames` 引数名は変更不要。
2. `ingestion.integration.test.ts` の `describe("commitIngestionPreview")` に AC-1〜AC-4 のテストを追加（noteTags + tags join でタグ名を検証）。
3. `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test:integration`。

## 影響範囲

- 変更: `app/core/application/ingestion/commitIngestionPreview.ts`（タグ解決の1ブロック）
- 追加: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（テストケース）
- フロントエンド変更なし（既にフォームのタグリストを送信済み）
- 他の呼び出し元なし（`commitIngestionPreviewFn` action 経由のみ。action は `data.tagNames === undefined` のとき渡さないため、フォールバック挙動と整合）

## リスク

- `undefined` と空配列 `[]` の区別が肝。`(mods.tagNames ?? [])` で潰さず、`mods.tagNames === undefined` で明示分岐する。
- 既存の commit テストは `modifications: {}`（tagNames 未指定）でノート作成しており、AC-3 のフォールバックで挙動不変。

## 未解決事項

なし。
