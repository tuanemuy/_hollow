# Issue #483 実装計画: lint 警告をまとめて解消する

**複雑度:** 小規模（機械的な lint 修正、ファイル特定済み）

## 目的

`pnpm lint` のノイズ（警告・info）をゼロにする。機能変更は伴わない。

## スコープ補正（起票時との差分）

Issue 起票時は 901 ファイル・警告 12 件＋info 1 件だったが、コードベース成長により
現在は 1154 ファイル・**警告 25 件＋info 6 件**。Issue の意図は「`pnpm lint` が警告 0 件で
通る」ことなので、現時点の全件を対象にする（行番号は起票時から移動している）。

## 内訳と修正方針

### 1. `lint/style/noNonNullAssertion`（16 件）

- `inlineEditor.test.tsx`（14 件）: `code?.firstChild` / `pre?.firstChild` から取った
  `textNode!`、`p!`、`tr.firstChild!`。小さな narrowing ヘルパー `requireNode()` を追加し、
  宣言時に non-null 化して `!` を除去する。
- `IngestionPreviewForm.test.tsx`（2 件）: `...sampleJob.preview!` → preview を非 null の
  `samplePreview` 定数に抽出して参照。
- `IngestionJobRow.test.tsx`（1 件）: `...previewingJobExistingDir.preview!` → 同様に抽出。

### 2. `suppressions/unused`（3 件）

効果のない `biome-ignore` を削除（説明用の通常コメントは WHY として残す）。

- `WysiwygEditor.tsx:319` — `useExhaustiveDependencies` の biome-ignore
- `PublishSettings.test.tsx:288` — `noDelete` の biome-ignore
- `resendEmailSender.test.ts:308` — `useThrowOnlyError` の biome-ignore（効いていない）

### 3. `lint/suspicious/noTemplateCurlyInString`（3 件）

`it("...")` の説明文に意図的な `${...}` を含む。テンプレートリテラル化＋エスケープは
`noUnusedTemplateLiteral` に弾かれる（中身が補間を必要としないため）catch-22 になるので、
代わりに `${name}` を `<name>` プレースホルダ表記へ書き換え、通常文字列のまま残す
（既存の `<token>` / `<id>` 表記とも揃う）。

- `connectionPing.test.ts:56` — `${type}: ${message}` → `<type>: <message>`
- `view.test.ts:24` / `view.test.ts:35` — `${appUrl}` → `<appUrl>`

### 4. `lint/suspicious/noConfusingVoidType`（1 件 / info）

`PublishSettings/index.tsx` の `type FormState = void;`。`undefined` へ置換すると
`useActionState` の action（`Promise<void>` を返す）が `Promise<undefined>` に widen できず
型エラーになる（ADR-005 の意図）。biome は **generic 型引数位置の `void` は許容**するため、
エイリアスを廃して `useActionState<void, FormData>` へインライン化する（suppression 不要）。

### 5. `lint/complexity/noUselessFragments`（5 件）

`highlightSnippet.test.tsx` の `renderToStaticMarkup(<>{highlightSnippet(...)}</>)`。
`renderToStaticMarkup(element: ReactNode)` は `ReactNode` を直接受けられるため fragment は
不要。`renderToStaticMarkup(highlightSnippet(...))` に簡約する。

### 6. `lint/complexity/useOptionalChain`（1 件）

`useRestoreFieldFocusOnCommit.ts:113` の `el !== null && el.isConnected` を
`el?.isConnected` に置換。

### 7. `deserialize` info（1 件）

`biome.json` の `$schema` を CLI バージョンに合わせて `2.3.14` → `2.4.15` に更新。

## 受け入れ基準

| ID | 基準 |
|----|------|
| AC-1 | `pnpm lint` が警告 0 件・info 0 件で通る |
| AC-2 | `pnpm typecheck` がパスする |
| AC-3 | `pnpm test`（unit）がパスする |
| AC-4 | 各テストの意図（説明文・narrowing）が変わっていない |

## 影響範囲

テストコード中心＋本体 3 ファイル（`WysiwygEditor.tsx`、`PublishSettings/index.tsx`、
`useRestoreFieldFocusOnCommit.ts`）と `biome.json`。いずれも挙動非変更の機械的修正。
