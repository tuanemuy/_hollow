# 実装計画 — Issue #55: [spec-sync] frontend: P18 タグ管理画面に一括処理ジョブの進捗表示が未実装

**Issue:** #55
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

`spec/pages/index.md` P18 の機能リスト「一括処理ジョブの進捗表示」が未実装。Issue 本文の背景に明記されている通り、これは**ノート規模が大きいタグ操作（マージ対象ノートが数百件以上）の体験向上を意図したもの**。現状 `mergeTags` / `deleteTag` は UoW 内同期実行で、ボタンが disabled になるだけで「対象規模」と「処理が動いていること」がユーザーに伝わらない。

これを **「対象件数の事前提示」+「実行中の indeterminate progressbar」** の2段構成で解消する。件数事前提示は単なる UX 改善ではなく Issue 要件「ノート規模が大きい場合の体験向上」の核として位置づける。

## スコープ

### 含まれるもの

- `MergeTagDialog` に「対象ノート: N 件」事前提示と、実行中の indeterminate progressbar を追加
- `TagActions` の削除確認ダイアログ（`ConfirmDialog`）に「対象ノート: N 件」事前提示と、実行中の indeterminate progressbar を追加。削除完了まで（または成功時のみ）ダイアログを開いたままにする
- `TagManager` から `noteCount` を `TagActions` に伝搬
- 進捗 UI 用の共有 Tailwind 定数を `app/components/tag/styles.ts`（新規）に追加
- `.issue/55/adr.md` に設計判断記録

### 含まれないもの

- **非同期ジョブ化（案 2）**: outbox / Queue / Worker / 進捗テーブル / SSE 等の新規基盤は導入しない（影響範囲が広く YAGNI）
- **段階フィードバック（案 3）**: usecase が進捗を発行する仕組みは導入しない（domain/application 層に UI 関心事を漏らさない）
- **件数ストリーミング表示**（i/N 表示）: 同期実行のままでは技術的に取得不可能
- **`renameTag` の進捗 UI**: Issue 本文の「背景」が `mergeTags` / `deleteTag` を明示的に対象としていること、リネームはインライン編集 UI で別フロー（ダイアログを開かない）であり進捗 UI の配置が UX 設計上ノイズになることが主理由。技術的には `renameTag` も同じ bulk 構造（500件/page 同期書き換え）を持つため、将来同等の進捗 UI を行内に出す余地はあるが本 Issue では見送る
- **`ConfirmDialog`（共通）の API 変更**: 専用 prop 追加は共通コンポーネントを汚すため避ける。`description` が ReactNode を受けるので呼び出し側で完結させる
- **新規 `@keyframes` の追加**: Tailwind 標準の `animate-pulse` で代替し、グローバル CSS の例外を増やさない
- **`MergeTagDialog` ローカル定数の `note/styles.ts` への集約**: 既存 dialog 系定数の重複整理は本 Issue 外（別 Issue 候補）
- **spec の文言変更**: 「進捗表示」要件は本実装で満たすため `spec/pages/index.md` は無変更

## 実装ステップ

### 1. 進捗 UI 用の Tailwind 定数を `tag/styles.ts`（新規）に追加

- **対象ファイル:** `app/components/tag/styles.ts`（新規）
- **変更内容:** indeterminate progressbar 用の track / bar 定数を追加

```ts
/**
 * Shared Tailwind utility-class constants for tag components.
 *
 * Follows the same plain-string-constant pattern as
 * `note/styles.ts`, `auth/styles.ts`, `layout/styles.ts`, `public/styles.ts`
 * (see CLAUDE.md "Repeated utility strings can be hoisted").
 */

/** Indeterminate progress bar track — 同期処理中の不確定進捗用。 */
export const progressTrack =
  "relative h-1 w-full overflow-hidden rounded-pill bg-surface mt-3";

/** Indeterminate progress bar — animate-pulse でゆるく「動いている」を表現。 */
export const progressBarIndeterminate =
  "absolute inset-0 rounded-pill bg-accent/60 motion-safe:animate-pulse";
```

- **理由:** `note/styles.ts` の冒頭 JSDoc は「note components 用」と明記しており、tag 専用定数はドメイン局所性を保つために `app/components/tag/styles.ts` に新設する。CLAUDE.md は `note/styles.ts`, `auth/styles.ts`, `layout/styles.ts`, `public/styles.ts` の複数ドメイン別 styles ファイル存在を明示しており、`tag/styles.ts` 新設は同パターンの延長。`animate-pulse` は Tailwind 標準なので新規 keyframe 不要。`motion-safe:` で `prefers-reduced-motion: reduce` 時はアニメーションを抑制。

### 2. `TagManager` から `TagActions` に `noteCount` を伝搬

- **対象ファイル:** `app/components/tag/TagManager.tsx`
- **変更内容:** `TagActions` の props に `noteCount={tag.noteCount}` を追加（既に `tag.noteCount` は loader 経由で取得済み、DTO 上は `number`）。`candidates` 配列は**現状の `{ id; name }[]` のまま維持**（progressbar に使うのは source 側件数のみで target 側は不要）
- **理由:** 件数事前提示と progressbar の `aria-valuemax` 値を loader 由来の既存データから供給するため、追加 server function 呼び出しゼロ（Issue #2 ADR-002 の方針と整合）。`candidates` 拡張は不要なスコープ拡大なので避ける。

### 3. `TagActions` を更新（削除フローの進捗 UI + props 拡張）

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:**
  1. props に `noteCount: number` を追加
  2. `MergeTagDialog` に `sourceNoteCount={noteCount}` を渡す
  3. `runDelete` の `onConfirm` を**ダイアログ即時クローズ → 成功時のみ完了後クローズ**に変更:
     ```ts
     const runDelete = () => {
       startTransition(async () => {
         try {
           await removeTag({ data: { tagId } });
           await router.invalidate();
           setConfirmDeleteOpen(false);  // 成功時のみクローズ
           setError(null);
         } catch (e) {
           setConfirmDeleteOpen(false);  // エラー時もクローズして既存の行内 FORM_ERROR 表示に委ねる
           setError(extractSerializedError(e));
         }
       });
     };
     ```
     - **重要**: エラー時もダイアログを閉じる。理由は `ConfirmDialog` が `error` props を持たず、エラー表示は既存の `TagActions` 行内 `FORM_ERROR` で行うため。ダイアログを開いたままだとバックドロップでエラー表示が隠れる。既存挙動と整合。
     - `startTransition` 内の state 更新は deferred になるが、既存 `onRename` も同じパターン（`setIsEditing(false)` を `startTransition` 内）で運用されており実害なし
  4. `ConfirmDialog` の `description` を ReactNode に変更し、`isPending` と `noteCount` に応じて以下のように分岐:
     - **pre-flight (`!isPending`)**:
       - `noteCount > 0`: 「参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。**対象ノート: {noteCount} 件**。続行しますか？」
       - `noteCount === 0`: 「参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。続行しますか？」（件数 0 は冗長な情報なので省略）
     - **in-flight (`isPending && noteCount > 0`)**: 「**{noteCount} 件のノートを更新中…**」+ indeterminate progressbar
     - **in-flight (`isPending && noteCount === 0`)**: 「**削除中…**」のみ（progressbar 省略、瞬時完了想定）
  5. indeterminate progressbar のマークアップ:
     ```tsx
     <div
       role="progressbar"
       aria-busy="true"
       aria-valuemin={0}
       aria-valuemax={noteCount}
       aria-valuenow={undefined}  // 属性自体を出さない（React は undefined で属性をスキップ）
       aria-label={`${noteCount} 件のノートを更新中`}
       className={progressTrack}
     >
       <div className={progressBarIndeterminate} />
     </div>
     ```
  6. `onConfirm` から `setConfirmDeleteOpen(false)` を削除（`runDelete` 内で行うため）
- **理由:** 削除中もユーザーがコンテキストを失わない（同一ダイアログ内で「対象規模 → 実行中 → 完了」が連続）。`ConfirmDialog` 本体は無改修。エラー時はダイアログを閉じて行内 `FORM_ERROR` に既存通り委ねる。

### 4. `MergeTagDialog` に進捗 UI と件数事前提示を追加

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`
- **変更内容:**
  1. props に `sourceNoteCount: number` を追加
  2. 既存 description（`targetTag !== undefined` のとき）に「**対象ノート: {sourceNoteCount} 件**」を追記:
     - `sourceNoteCount > 0`: 「#{sourceName}（**対象ノート: {sourceNoteCount} 件**）を #{targetTag.name} に統合します。…」
     - `sourceNoteCount === 0`: 既存文言のまま（件数表示なし）
  3. `isPending && sourceNoteCount > 0` のとき、フォーム末尾（ボタン行の上）に indeterminate progressbar を描画:
     - 文言: 「**{sourceNoteCount} 件のノートを更新中…**」（`aria-live="polite"` の `<span>` に入れる）
     - マークアップは Step 3 と同じ構造（`role="progressbar"` + `aria-busy="true"` + `aria-valuemin={0}` + `aria-valuemax={sourceNoteCount}`、`aria-valuenow={undefined}` で属性省略）
  4. `<form>` に `aria-busy={isPending}` を付与（既存 `FilterBar` パターン踏襲）
  5. ボタン文言は既存「統合中...」のままで件数併記なし（progressbar に件数が出るため重複回避）
- **理由:** 統合は対象ノート全てへの propagation を伴う bulk 操作なので、規模提示と「動いている」アフォーダンスの両方が必要。

### 5. ADR の確認・更新

- **対象ファイル:** `.issue/55/adr.md`
- **変更内容:** Plan に同期したレビュー反映済み ADR-001〜005 を確認
- **理由:** Issue #2 ADR-004 で「別 Issue で別途検討」とされた経緯を本 Issue でクローズし、判断を残す

### 6. 品質ゲート

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- 既存 `app/core/application/tag/__tests__/tag.integration.test.ts` は usecase 無改修のため素通り想定（リグレッション保護）
- `grep -rn "TagActions\|MergeTagDialog" app/` で他呼び出しがないことを再確認（現状 `tag/` 内のみ — 確認済み）

## 設計判断

詳細は `.issue/55/adr.md` を参照。要点:

- **案 1（同期実行のまま体感を上げる）を採用**。案 2/3 はスコープ過大かつ既存規模（500 件/page ×通常 1-2 ページ）には過剰
- **「件数事前提示 + indeterminate progressbar」の 2 段構成**で Issue 本文の意図（規模感の伝達 + 進行アフォーダンス）を満たす
- **indeterminate progressbar**（`aria-valuenow` 省略）— 同期実行で実進捗値が取れないため、嘘の `aria-valuenow` を出すよりは WAI-ARIA 仕様の indeterminate モードを使う
- **`ConfirmDialog` 共通コンポーネントは無改修** — 呼び出し側で `description` に進捗 UI を埋め込んで完結させる
- **`renameTag` には進捗 UI を出さない** — Issue 本文の「背景」が `mergeTags` / `deleteTag` を明示対象としている + インライン編集 UI で進捗 UI の置き場がない
- **進捗 UI 定数は `tag/styles.ts` 新設** — `note/styles.ts` は note 専用と冒頭で明記されており、ドメイン別 styles ファイルパターンを踏襲
- **新規 `@keyframes` を追加しない** — Tailwind 標準 `animate-pulse` で代替

## リスクと注意点

- **`tag.noteCount` の鮮度**: RSC で取得したキャッシュ値なので、別タブ操作で実件数と乖離する可能性がある。現状の `TAG_RESOLVE_LIMIT = 200` 想定では実害は少ない（ADR-005 で許容を明記）
- **`router.invalidate()` の所要時間**: 削除/統合完了後、`router.invalidate()` の RSC 再取得を待ってからダイアログクローズ → ダイアログ内 progressbar が（処理完了後も）数百 ms 動き続ける可能性がある。視覚的に「処理中の続き」に見えるので致命的ではないが、UX 注意点として記録
- **`useTransition` 中のダイアログクローズ**: `setConfirmDeleteOpen(false)` を `startTransition` 内で呼ぶと state 更新が deferred になる。既存 `onRename` も同パターン（`setIsEditing(false)`）で運用しており実害なしを確認
- **`prefers-reduced-motion`**: `motion-safe:animate-pulse` で対応済み
- **`animate-pulse` の見た目妥当性**: `animate-pulse` は opacity フェード型のため、左→右に流れる典型的な indeterminate bar とは見た目が異なる。手動テストで「処理中であることのアフォーダンス」として読み取れるかを評価し、不十分なら別 Issue で新規 keyframe を導入する（本 Issue では Tailwind 標準で済ます方針を維持）
- **`aria-valuenow={undefined}`**: React は `undefined` で属性を出力しない。`{0}` を書くと「処理 0%」とアナウンスされる別物になるため、必ず `undefined` 経路を使う。`aria-valuemax` も indeterminate progressbar では支援技術が無視する可能性があるが、`aria-label` でスケール感は別途文言で伝える
- **パフォーマンス**: usecase は完全に無変更のため、サーバーリソース・トランザクション時間・D1 書き込み件数に影響なし。Cloudflare Workers CPU time limit に達するスケール（noteCount > 数百〜千）は本 Issue 範囲外
- **影響範囲確認**: `TagActions` / `MergeTagDialog` は `tag/` 内のみで使われている（grep 確認済み）。props 拡張による外部影響なし

## テスト方針

### 自動テスト
- `pnpm typecheck` で型整合性を検証（props 拡張の影響範囲）
- 既存 `tag.integration.test.ts` が無変更で全通過することを確認（usecase 無改修のリグレッション保護）
- 新規ユニットテストは追加しない（純粋 UI 追加で、ロジック分岐は `noteCount === 0` の閾値のみ。手動テストで担保）

### 手動テスト（`.issue/55/testing.md` を参照）
- ノート 0 件 / 数件 / 数百件のタグそれぞれで統合・削除を実行
- progressbar の出現・非出現条件、件数文言、aria 属性、`prefers-reduced-motion` 挙動
- 支援技術での読み上げ確認（`role="progressbar"` + `aria-label` がスケール感を伝えること）
- エラー時の挙動（ダイアログクローズ → 行内 `FORM_ERROR` 表示）

## レビュー反映

### 修正した点
- **P-001**: ADR-004 の `renameTag` スコープ外理由を実装に即して修正（リネームは Outbox 経由 non-blocking ではなく、同じ UoW 内 500件/page 同期書き換え）。新理由: Issue 本文が `mergeTags` / `deleteTag` を明示対象としていること + インライン編集 UI で進捗 UI の置き場がないこと
- **P-002**: ADR-001 / 目的セクションで「件数事前提示」が Issue 要件「ノート規模が大きい場合の体験向上」の核であることを明示
- **P-003**: `TagManager` での `candidates` 要素拡張を削除。`TagActions` の props に `noteCount: number` のみ追加し、`MergeTagDialog` に `sourceNoteCount` として伝搬

### 取り込んだ改善提案
- **S-001 (R1/R2)**: 進捗 UI 定数を `app/components/tag/styles.ts` 新設に変更（ドメイン局所性、CLAUDE.md のドメイン別 styles ファイルパターン踏襲）
- **S-003 (R2)**: 削除フローのエラー時はダイアログを閉じて行内 `FORM_ERROR` 表示に委ねる（`ConfirmDialog` が `error` props を持たないため、ダイアログ開いたままだとエラーが隠れる問題を解消）
- **S-004 (R2)**: `noteCount === 0` のとき件数事前提示も省略（情報価値が低く誤解を招くため）
- **S-005 (R2)**: `setConfirmDeleteOpen(false)` を `startTransition` 内で呼ぶ点を計画に明記（既存 `onRename` と同パターンであることを確認）
- **S-006 (R2)**: `aria-valuenow={undefined}` で属性を出さない実装パターンを plan に明示
- **S-002 (R1) / S-007 (R2)**: 手動テスト時の WAI-ARIA 読み上げ確認 + `animate-pulse` の UX 妥当性評価を testing.md に追加
- **S-008 (R2)**: 他呼び出し漏れチェックを Step 6 に明記（grep 確認済み: tag/ 内のみ）
- **S-003 (R1)**: `router.invalidate()` 後のダイアログクローズ残存時間をリスクに追記

### 見送った提案とその理由
- **S-002 (R2)** `MergeTagDialog` 内ローカル定数を `note/styles.ts` の同名定数へ集約 — スコープ拡大（既存 dialog 系定数の重複整理は別問題）。本 Issue では新規 `tag/styles.ts` に進捗 UI 定数だけを追加し、既存の dialog ローカル定数は触らない

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | ○（一部） | ○（一部） |
| 案 1 を推奨 | ○ | ○ | ○ |
| 件数事前提示 | ○ | ○ | × |
| `ProgressIndicator` 切り出し | × | ○ | × |
| `ConfirmDialog` API 変更 | × | × | ○（`showProgress` 追加） |
| 新規 `@keyframes` | × | × | ○ |
| renameTag 進捗 | × | × | × |

統合方針: Agent 1 ベース（最小変更 + 件数事前提示 + 共通定数）+ Agent 2 の「ConfirmDialog 無改修」原則 + Agent 3 の「`motion-safe:` 対応」を採用。新規コンポーネント切り出しは行わず（重複箇所が2つで YAGNI）、新規 keyframe も追加せず、`ConfirmDialog` も無改修。
