# 実装計画 — Issue #255: Issue #226 フォローアップ: ingestion / note actions の小規模リファクタリング

**Issue:** #255
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 概要

ADR-014 で「フォローアップ Issue で対応」と明示された 3 件 (W-B-001 / W-B-003 / W-T-010) を、それぞれ「単一の責務に絞った最小修正」として片付ける。重複ロジックは共通モジュールに寄せ、`errorReason` の内部実装漏洩は Wire 層でコード化された短い文言に正規化し、テストの `useServerFn` Proxy モックは共通ヘルパーに切り出す。

---

## 調査結果

### 関連ファイル

- **W-B-001 (重複ロジック)**
  - `app/components/note/loaders.ts:302-346` — `FlatDirectory` 型と `loadDirectoryTreeFlat` (RSC 側の loader)
  - `app/components/note/actions.ts:465-507` — `getDirectoryTreeFn` (server fn 側、行単位でほぼ同一の walk/flatten)
  - `app/core/application/directory/getDirectoryTree` — 共通の上流（既に同一）

- **W-B-003 (errorReason 漏出)**
  - `app/components/ingestion/actions.ts:112-166` — `IngestionJobWire` と `toIngestionJobWire`（getIngestionJobFn の戻り型）
  - `app/components/ingestion/loaders.ts:4-18` — `loadIngestionJobs`（RSC からも `IngestionJobDTO` をそのままページ経由で UI へ）
  - `app/components/ingestion/IngestionJobRow.tsx:28, 136-140` — `IngestionJobDTO` を直接 props として受け、`{job.errorCode}: {job.errorReason}` を表示
  - `app/components/ingestion/UploadDialog.tsx:496-500` — `IngestionJobWire` を受け、`{job.errorCode}: {job.errorReason}` を表示
  - `app/core/application/dto/ingestion.ts:38-39, 74-75` — `IngestionJobDTO.errorCode / errorReason: string | null`
  - `app/core/application/ingestion/runIngestionJob.ts:331-377` (`markFailedSafely`) — `errorReason` は `meta.message ?? cause.message ?? String(cause)` で組み立てる（=内部 Error.message が素通り）
  - `app/core/domain/ingestion/errorCode.ts` — 既存の `IngestionErrorCode` 定数群（`unsupported_format` 等の安全な enumerable code）

- **W-T-010 (useServerFn モック)**
  - `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:9-39`（identity-dispatch + chain Proxy）
  - `app/components/ingestion/__tests__/UploadDialog.test.tsx:9-49`（同パターン、4 server fn 分）
  - `app/components/note/list/__tests__/NotePickerDialog.test.tsx:22-35`（同パターン、単一の `mockedFn` で全 dispatch）

### あるべきアーキテクチャ

`CLAUDE.md` から:
- "Make illegal states unrepresentable at the type level before falling back to runtime checks" → 同一構造の値を 2 箇所で構築するのは型ドリフトを許す状態。1 つの型を export して両者が import するか、ファクトリ関数を共通化する。
- "Default to no comments" → 重複ロジックを 2 箇所に書いて「片方は別ファイル」とコメントで補うより、共通関数化が望ましい。
- "Validate at the boundaries" → Wire 型は presentation/transport の境界。内部 Error メッセージのような未バリデート文字列は境界で落とすか、enumerable な形に正規化する。
- "Each `*ErrorCode` value matches a `BusinessRuleError('...')` spec文言" → `errorCode` は enumerable で安全に UI に出せる前提。`errorReason` は自由文字列なので扱いが違う。

`spec/domains/ingestion.md` から:
- `errorReason: string | null` はドメインモデルに残す（ログ・サポート用）
- `errorCode: string | null` は enumerable な短い code（UI 表示の主役）

### 既存実装の状態 / 乖離

- **W-B-001**: walk/flatten ロジックが 2 箇所に同一存在。`FlatDirectory` 型も `loaders.ts` に重複定義され、`actions.ts` 側は無名のインライン型。**設計判断（ADR-008）として認知済み**で、本 Issue がその整理担当。
- **W-B-003**: `errorReason` の元データは `runIngestionJob.markFailedSafely` で生 `Error.message` から組み立てられる（`runIngestionJob.ts:338-342`）。ドメイン保存の段階で `validateErrorReason` は trim + 長さチェックのみで内容のサニタイズはしていない。これが UI に素通り（`IngestionJobRow.tsx:138`, `UploadDialog.tsx:498`）= 内部スタックトレース文字列等が UI に出るリスクあり。
- **W-T-010**: 3 つの test ファイルで `chain Proxy + identity dispatch + createMiddleware/createServerFn ノーオプ` パターンが手書きで重複。さらに `IngestionPreviewForm.test.tsx` と `UploadDialog.test.tsx` で形が微妙に異なる（注釈の量・comment 文言）= 「共通モックヘルパー切り出し」のシグナル。

### 依存関係 / 影響範囲

- W-B-001: `app/components/note/` 内のみ。型 export を `loaders.ts` から行えば `actions.ts` 側はインポート 1 行追加。
- W-B-003: `IngestionJobWire`, `IngestionJobRow`(DTO の props を Wire に変更するか議論), `loadIngestionJobs`(RSC 経路)。**ドメイン/usecase/DTO は変更しない**（spec で要求される property を削除すると DB 永続化や retry に影響する）。漏出を防ぐのは presentation 境界のみ。
- W-T-010: 3 つの test ファイルの import 文置換のみ。`app/components/_test-utils/` 配下に新規ヘルパー追加。

### W-B-003 補足: errorReason は現在 UI で必要か（コード根拠）

事実:
1. `IngestionJobRow.tsx:136-140` と `UploadDialog.tsx:496-500` の **両方で `errorReason !== null` のとき `{errorCode}: {errorReason}` を表示している**。`errorReason` が null なら表示されない。
2. `errorReason` の中身は `runIngestionJob.markFailedSafely` で `Error.message` 由来の自由文字列（例: LLM provider が返す英語スタックトレース風文字列、`fetch` failure メッセージなど）。
3. `errorCode` は `IngestionErrorCode` の enumerable な値が（一部のパスでは）入るが、`runIngestionJob.ts:325-329` を見ると `"ingestion.invalid_state"`, `"ingestion.temp_storage"`, `"ingestion.unknown"` 等の **enumerable とは限らない非整理コード** も入る。
4. `errorCode → ユーザー文言マップ` は現状存在しない（`displayError` は server-fn errors 用で、ジョブの永続化済み failure には未対応）。

結論:
- **`errorReason` の UI 価値は「失敗の原因がわかると嬉しい」程度で必須ではない**（spec/domains/ingestion.md でも UI 必須要件としては書かれていない）。
- 一方で **`errorCode` は UI 必須**（少なくとも何の失敗種別かを示す）。
- 推奨方針: **Wire 側で `errorReason` をクライアントへ流さない（=型から削除）**。UI には `errorCode` のみ表示し、当面はそのまま文字列を見せる（フォローアップで code → 日本語訳マップを整備するのは別 Issue 候補）。ドメイン/DTO 側の `errorReason` は spec/サポート/監査用としてサーバ側で温存する。

---

## 実装ステップ

### W-B-001: `flattenDirectoryTree` 抽出（新規ファイル `directoryTree.ts` に切り出し）

1. 新規ファイル `app/components/note/directoryTree.ts` を作成し、`FlatDirectory` 型と純粋関数を SSOT として置く
   - 対象ファイル（新規）: `app/components/note/directoryTree.ts`
   - 変更内容: 次を export する（`DirectoryTreeNode` は `@/core/application/directory/view` から直接 import — S-005 への応答）:
     ```ts
     import type { DirectoryTreeNode } from "@/core/application/directory/view";

     export type FlatDirectory = Readonly<{
       id: string;
       parentId: string | null;
       name: string;
       depth: number;
       path: string;
     }>;

     export function flattenDirectoryTree(
       tree: ReadonlyArray<DirectoryTreeNode>,
     ): FlatDirectory[] {
       const flat: FlatDirectory[] = [];
       const walk = (node: DirectoryTreeNode, parentPath: string): void => {
         const path = `${parentPath}/${node.name}`;
         flat.push({
           id: node.id as unknown as string,
           parentId:
             node.parentId === null
               ? null
               : (node.parentId as unknown as string),
           name: node.name,
           depth: node.depth,
           path,
         });
         for (const child of node.children) walk(child, path);
       };
       for (const root of tree) walk(root, "");
       return flat;
     }
     ```
   - 理由: P-003 の指摘 — `loaders.ts` は `serverData` ヘルパー（server-only コンテキスト）を含むため、純粋関数を相乗りさせると client から誤 import される将来リスクがある。SSR/CSR 境界を持たない中立ファイルに切り出す。`DirectoryTreeNode` は `view.ts` で既に export 済み（`app/core/application/directory/view.ts:8`）なので直接 import で取れる。

2. `loaders.ts` の `FlatDirectory` 定義と `loadDirectoryTreeFlat` の walk ロジックを差し替え
   - 対象ファイル: `app/components/note/loaders.ts:306-346`
   - 変更内容:
     - `export type FlatDirectory = Readonly<{ ... }>` を削除し、`export type { FlatDirectory } from "./directoryTree"` に置換（既存 import 元 `IngestionPreviewForm.tsx:28` は `note/loaders` から import しているため、re-export で後方互換を維持する）
     - `loadDirectoryTreeFlat` の handler 内 walk/flatten を `const flat = flattenDirectoryTree(tree)` に置き換え
   - 理由: 既存の type-only import 経路（`IngestionPreviewForm.tsx:28` の `import type { FlatDirectory } from "../note/loaders"`）を壊さない最小修正。

3. `getDirectoryTreeFn` から walk ロジックを削除して `flattenDirectoryTree` を呼ぶ
   - 対象ファイル: `app/components/note/actions.ts:474-507`
   - 変更内容:
     - インライン無名型 `Array<{ id, parentId, name, depth, path }>` を削除
     - `import { flattenDirectoryTree, type FlatDirectory } from "./directoryTree"` を追加
     - handler 戻り値型を `Promise<{ flat: readonly FlatDirectory[] }>` に明示
     - `const flat = flattenDirectoryTree(tree)` で置き換え
   - 理由: 構造ドリフトを型レベルで不可能にする（`Make illegal states unrepresentable`）。

4. 既存 caller の typecheck 整合性を確認
   - 対象: `app/components/ingestion/IngestionPreviewForm.tsx:28` (FlatDirectory を type-only import)、`app/components/ingestion/UploadDialog.tsx`（`getDirectoryTreeFn` の戻り値経由）
   - 変更内容: コード修正なし。`pnpm typecheck` で `readonly FlatDirectory[]` が呼び出し先と整合することを確認
   - 理由: `loadDirectoryTreeFlat` は既に `readonly FlatDirectory[]` を返しており、`getDirectoryTreeFn` のインライン型 `Array<{...}>` も呼び出し側は readonly として受けていたため破壊変更ではないが、念のため明示確認する（P-001 への応答）。

### W-B-003: `errorReason` を Wire から削除

1. `IngestionJobWire` から `errorReason` を削除
   - 対象ファイル: `app/components/ingestion/actions.ts:112-127`
   - 変更内容: `errorReason: string | null;` を `IngestionJobWire` の field から削除
   - 理由: 自由文字列で内部実装が UI に漏れるリスクを境界で遮断する。`errorCode` は enumerable なので残す。

2. `toIngestionJobWire` から `errorReason` を投影しない
   - 対象ファイル: `app/components/ingestion/actions.ts:129-166`
   - 変更内容: `errorReason: job.errorReason,` の行を削除
   - 理由: DTO → Wire の境界で落とす（presentation の責務）。

3. `IngestionJobRow` の props を `IngestionJobWire` に変更
   - 対象ファイル: `app/components/ingestion/IngestionJobRow.tsx:7, 27-29, 136-140`
   - 変更内容:
     - `import type { IngestionJobDTO }` を `import type { IngestionJobWire } from "./actions"` に変更
     - `Props.job: IngestionJobDTO` → `Props.job: IngestionJobWire`
     - `statusLabel: Record<IngestionJobDTO["status"], string>` → `Record<IngestionJobWire["status"], string>`
     - `statusChipClass(status: IngestionJobDTO["status"])` → 同様に変更
     - `job.id as unknown as string` のキャストは Wire 側で既に string なので削除可
     - error 表示部分: `{job.errorReason !== null ? ...}` を `{job.errorCode !== null ? <p ...>{job.errorCode}</p> : null}` に変更（**errorCode のみ表示**）
   - 理由: UI には Wire 型のみを通す。loaders 経路でも Wire と同じ shape にして RSC 経路もガード（次ステップ）。
   - **呼び出し元の確認結果（P-004 への応答）**: `grep -r "IngestionJobRow" app/` の結果、`IngestionJobRow` の caller は `app/components/ingestion/UploadPage.tsx:3,37` のみ（owner 向けカード）。`admin/Jobs/index.tsx` は別実装の Row を使うので影響なし。

4. `loadIngestionJobs` を Wire 形に正規化
   - 対象ファイル: `app/components/ingestion/loaders.ts`、新規 `app/components/ingestion/wire.ts`
   - 変更内容:
     - `app/components/ingestion/wire.ts` を新設し、`IngestionJobWire`, `IngestionPreviewWire`, `toIngestionJobWire` をここに移す（actions.ts は server fn 定義に集中させる）
     - `actions.ts` は `wire.ts` から re-export して下流の import パスを壊さない
     - `loaders.ts` は usecase 戻りの `IngestionJobDTO[]` を `toIngestionJobWire` でマップして `{ jobs: readonly IngestionJobWire[] }` 形を返す
   - 理由: ADR-014 で指摘されたとおり、`loadIngestionJobs` 側も同じ漏出経路。Wire 型に統一して**境界で 1 度だけ正規化**する。`wire.ts` 切り出しは P-003 と同じ動機 — Wire 投影は server / RSC / client 境界の中立モジュールに置くのが clean。
   - **シリアライズ確認（P-005 への応答）**: `serverData` の戻り値型推論は `Readonly<{...}>` を含む shape でも問題なく成立する（既に `loadDirectoryTreeFlat` が `readonly FlatDirectory[]` を返している実績あり）。`pnpm typecheck` で再確認する。

5. `UploadPage.tsx` の型整合性確認
   - 対象ファイル: `app/components/ingestion/UploadPage.tsx`
   - 変更内容: `loadIngestionJobs` の戻り値が `IngestionJobWire[]` を含むようになるので、`IngestionJobRow` への props 型と整合する（コード変更は不要なはず、typecheck で検証）
   - 理由: 整合性確認。

6. （上記により）`UploadDialog.tsx:496-500` の表示部も errorCode のみに
   - 対象ファイル: `app/components/ingestion/UploadDialog.tsx:496-500`
   - 変更内容: `{job.errorReason !== null ? (<p>{job.errorCode}: {job.errorReason}</p>) : null}` を `{job.errorCode !== null ? (<p>{job.errorCode}</p>) : null}` に変更
   - 理由: `IngestionJobWire` から `errorReason` を削除した結果、型エラーで強制される。テストの `baseJob` 等から `errorReason` を削除する作業も伴う。

### W-T-010: `useServerFn` モックヘルパー共通化

1. テスト用ヘルパーモジュールを作成
   - 対象ファイル（新規）: `app/components/_test-utils/serverFnMock.ts`
   - 変更内容: プレーンな関数 export とする:
     ```ts
     /**
      * Returns a chainable Proxy stand-in for `createMiddleware` /
      * `createServerFn` builder chains executed at module top-level when
      * `actions.ts` is loaded. `then` is excluded so accidental `await`
      * does not turn the Proxy into a thenable.
      */
     export const serverFnChainStub = (): unknown => {
       const chain = (): unknown =>
         new Proxy(() => chain(), {
           get: (_, prop) => (prop === "then" ? undefined : chain()),
         });
       return chain();
     };

     /**
      * Identity-dispatching `useServerFn` mock. Pass `[ref, mock]` pairs;
      * the returned function compares by referential equality and returns
      * the paired mock. Unknown fns fall back to `undefined` so that
      * unmocked usage is loud (instead of silently passing).
      */
     export const useServerFnRouter =
       <T>(entries: ReadonlyArray<readonly [unknown, T]>) =>
       (fn: unknown): T | undefined => {
         for (const [ref, mock] of entries) if (fn === ref) return mock;
         return undefined;
       };
     ```
   - 配置先: `app/components/_test-utils/serverFnMock.ts`。vitest のデフォルト test 検出パターン（`**/*.{test,spec}.?(c|m)[jt]s?(x)`）に該当しないので test 実行はされない。
   - 理由: 共通モックヘルパー切り出し。**`vi.hoisted` ラップは不要**（P-006 への応答）— 既存テスト (`IngestionPreviewForm.test.tsx:17` の `const commitMock = vi.fn()`) は top-level `const` を `vi.mock` factory 内で参照して正常動作している。これは vitest が `vi.mock` の **登録呼び出し**を hoist する一方、factory 関数自体はモック対象モジュールが import された時点（top-level imports 解決後）で実行されるため。よって import 経由のヘルパー関数も同じタイミングでアクセス可能。

2. 3 つの test ファイルをヘルパー利用に置換
   - 対象ファイル:
     - `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx:20-34`
     - `app/components/ingestion/__tests__/UploadDialog.test.tsx:22-41`
     - `app/components/note/list/__tests__/NotePickerDialog.test.tsx:23-35`
   - 変更内容: 各テストの `vi.mock("@tanstack/react-start", ...)` ブロックをヘルパー呼び出しに置換:
     ```ts
     import {
       serverFnChainStub,
       useServerFnRouter,
     } from "@/components/_test-utils/serverFnMock";

     vi.mock("@tanstack/react-start", () => ({
       useServerFn: useServerFnRouter([
         [commitMock, commitMock],
         [discardMock, discardMock],
       ]),
       createMiddleware: () => serverFnChainStub(),
       createServerFn: () => serverFnChainStub(),
     }));
     ```
   - **実装時の確認**: 1 ファイル目（`IngestionPreviewForm.test.tsx`）の置換後に `pnpm test:unit -- --run IngestionPreviewForm` で動作確認し、`vi.mock` factory がヘルパー import を参照できることを実機検証してから残り 2 ファイルを置換する。もし `ReferenceError: Cannot access ... before initialization` が出た場合は fallback として「helper 配置 → 各 test ファイル側で `vi.hoisted(() => ({ ...同じロジック... }))` で個別宣言、JSDoc で同期させる」案に切り替える。
   - 理由: モック規約を 1 箇所に集約。`actions.ts` の builder API が変わったとき、ヘルパーの 1 箇所修正で済む。

3. `IngestionPreviewForm.test.tsx` と `UploadDialog.test.tsx` の Wire リテラル更新
   - 対象ファイル: 上記 2 ファイル内の `IngestionJobWire` 形のテストフィクスチャ（例: `baseJob`, `sampleJob`）
   - 変更内容: `errorReason: null,` の行を削除（W-B-003 で型から消えるため）
   - 理由: typecheck が通るようにする。

### 後始末

- `pnpm typecheck && pnpm lint:fix && pnpm format` の実行
- `pnpm test:unit` で 3 テストファイルが通ることを確認
- `pnpm test:integration` で `ingestion.integration.test.ts` 等が引き続き通ることを確認（domain/usecase は触らないので影響ゼロのはず）

---

## 設計判断

### W-B-003: errorReason の扱い

3 つの選択肢:
1. **Wire から削除（errorCode のみ UI）** ← **推奨**
2. Wire で redact / サニタイズ（既知パターンの除去）
3. そのまま維持 + UI 側でホワイトリスト変換

選択: **(1) Wire から削除**

理由:
- (2) redaction は「何が internal で何が public か」のルール定義が必要で、ルールが追いつかないと結局漏れる（防御の網が増えるだけで本質解決にならない）。
- (3) は ADR-014 で見送られた現状そのもの。
- (1) は spec/domains/ingestion.md でも `errorReason` が UI 必須要件として書かれておらず、`errorCode` のみで「何の失敗種別か」は伝わる。`errorReason` はサーバ側でログ・サポート参照用として温存（DTO / DB は変更しない）。
- ADR-014 の「Wire 側で `errorReason` を含めない」提案そのものに合致する最小修正。
- 将来 `errorCode → 日本語訳マップ` を整備する場合の追加修正コストも最小（UI は既に `errorCode` だけ参照する形になっている）。

### W-T-010: ヘルパー切り出し vs 最小モックパターン確立

2 つの選択肢:
1. **共通ヘルパーを `app/components/_test-utils/` に切り出す** ← **推奨**
2. JSDoc / comment で「最小モックパターン」をプロジェクトの test スタイルとして規約化（実コードは各テストに残す）

選択: **(1) 共通ヘルパー切り出し**

理由:
- 既に 3 ファイルで `chain Proxy + identity dispatch` を手書きで重複している（W-B-001 と同じ「重複ロジック」問題）。
- (2) の「規約化」は新規テスト追加時にコピペが続く → ドリフトのリスク（W-B-001 が type で起きていることと同じ）。
- (1) は `CLAUDE.md` の「Default to no comments」原則に合う（コードで規約を固定化する vs コメントで誘導する）。
- ヘルパーは 2 関数で完結し、過剰抽象化にはならない。

配置先は `app/components/_test-utils/serverFnMock.ts` に統一する（P-001 R2 への応答）。vitest のデフォルト include パターン `**/*.{test,spec}.?(c|m)[jt]s?(x)` に該当しないので test 実行はされず、`__tests__` 配下に置くより独立したテストユーティリティとして発見性が高い。

---

## リスクと注意点

### W-B-001
- 既存テスト（`listSelectors.test.ts` 等）は loader/action の内部実装に依存していないため影響なし
- `DirectoryTreeNode` 型を usecase モジュールから import する必要がある場合、export がなければ `ReturnType<typeof getDirectoryTree>` から導出する

### W-B-003
- **破壊変更（UI）**: 失敗ジョブの error 表示が「`code: reason`」から「`code` のみ」に変わる。
  - 影響範囲: `IngestionJobRow.tsx`, `UploadDialog.tsx` の失敗時表示
  - 緩和策: `errorCode` は十分情報量を持つ（例: `llm_failure`, `unsupported_format`）。ユーザーフィードバック上ほぼ問題ないと判断。
  - ADR を新規追加（`.issue/255/adr.md` ADR-001）して判断を残す。
- **型の変更**: `IngestionJobRow` の props 型が `IngestionJobDTO` → `IngestionJobWire` に変わる。
  - 影響箇所: `UploadPage.tsx` の呼び出し（loaders を Wire 化するので整合する）
- **DTO / domain / DB は触らない**: spec/domains/ingestion.md で `errorReason` は domain 必須項目。サーバ内部のログ・サポート参照には維持する。

### W-T-010
- `vi.mock` factory はモック対象モジュール import 時点（top-level imports 解決後）でレイジー実行されるため、ヘルパー import の参照は通常可能。万一エラーが出た場合の fallback（`vi.hoisted` 個別宣言）を実装手順に明記済み。
- 既存 3 テストの挙動を変えないこと（モック解決の振る舞いが既存と同一であることを test 実行で確認）。

---

## テスト方針

### W-B-001
- 既存 `pnpm test:unit` / `pnpm test:integration` が通れば OK（純粋関数抽出はリファクタなので新規テスト不要）
- 追加で `flattenDirectoryTree` の直接 unit test を 1 ケース書くと将来のドリフト検知に有用（任意、コスパ判断）

### W-B-003
- `IngestionPreviewForm.test.tsx`, `UploadDialog.test.tsx` のフィクスチャから `errorReason` を削除して typecheck 緑にする
- 既存テストは error 表示自体を assert していない（grep で `errorReason` の test assertion なしを確認済み）ので、テスト変更は最小
- `expect(document.body.textContent).toContain("INGESTION_TIMEOUT")` のような `errorCode` 単独 assertion はそのまま green を保つ
- 動作確認: ジョブが failed 状態のとき UI で `{errorCode}` のみが表示されることを手動 / agent-browser で確認（任意）

### W-T-010
- ヘルパー切り出し後、3 テストファイルが全件 green であることを `pnpm test:unit -- --run app/components/ingestion/__tests__ app/components/note/list/__tests__` で確認
- ヘルパー自体の unit test は不要（テストインフラなので使用先テストが green であれば動作証明になる）

### 統合チェック

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit`
- `pnpm test:integration`
- 3 件すべてリファクタ / presentation 境界のみの変更なので integration test には影響しないはず

---

## レビュー履歴

### 1周目

**修正した点**:
- **P-001 (戻り値の readonly 配列化)**: W-B-001 ステップ 4 に「既存 caller の typecheck 整合性を確認」を追加。
- **P-002 (`IngestionPreviewForm` の既存依存)**: W-B-001 ステップ 2 で `loaders.ts` の `FlatDirectory` を re-export する方針に変更し、type-only import 元 (`IngestionPreviewForm.tsx:28`) の後方互換を維持。
- **P-003 (loaders.ts に純粋関数を相乗りさせる懸念)**: 純粋関数 + `FlatDirectory` 型の SSOT を新規ファイル `app/components/note/directoryTree.ts` に切り出す方針に変更。`loaders.ts` (server-only) と分離。
- **P-004 (IngestionJobRow の呼び出し元未検証)**: `grep -r "IngestionJobRow" app/` を実行し、caller が `UploadPage.tsx` のみであることを確認 → 計画に記録。
- **P-005 (`loadIngestionJobs` Wire 化のシリアライズ)**: W-B-003 ステップ 4 に「`serverData` の `Readonly` 型推論は既に `loadDirectoryTreeFlat` で実績あり」を補記し、typecheck 確認を明示。
- **S-002 (vi.hoisted パターン具体例)**: W-T-010 ステップ 1 のヘルパー実装に `vi.hoisted` ラップの具体コードを追記。

**取り込んだ改善提案**:
- 上記 S-002（コードレベルで詳細化）
- 共通モジュール `app/components/ingestion/wire.ts` を新設して `IngestionJobWire` / `toIngestionJobWire` を切り出す（P-003 と同じレイヤリング動機）

**見送った提案とその理由**:
- S-001 (W-B-001 で「両案採用」の判断記録): plan の現行記述で十分追跡可能（既に export 済みの型 + 関数抽出の 2 段構え）と判断。
- S-003 (manual-test との整合): 該当 manual-test に `errorReason` の表示文言 assertion は存在しないことを Issue 226 testing.md で確認済み。記録は ADR-001 で扱う。
- S-004 (observability への配慮): `errorReason` はサーバ側 DTO/DB に温存され server log にも残るので、運用フローは既存どおり（plan の「設計判断 W-B-003」で温存方針を明示済み）。

### 2周目

**修正した点**:
- **P-001 R2 (ヘルパー配置パス不整合)**: 全箇所を `app/components/_test-utils/serverFnMock.ts` に統一。
- **P-006 (vi.hoisted 別モジュール export の機能不安)**: ヘルパーから `vi.hoisted` ラップを外し、プレーン関数 export に簡素化。既存テストが top-level `const` を `vi.mock` factory 内で参照して動作している事実から、factory はレイジー評価され、imports も同じタイミングでアクセス可能と判断。万一動かない場合の fallback（test 側で `vi.hoisted` 個別宣言）も plan に明記。
- **S-005 (DirectoryTreeNode の import 経路)**: `@/core/application/directory/view` から直接 import すると plan に明記（`view.ts:8` で export 済みを確認）。

**取り込んだ改善提案**:
- 上記 S-005（直接 import に簡素化）
- 実装手順に「1 ファイル目で POC 検証してから残りに展開」を明記し、failure 時の fallback を記録

**見送った提案とその理由**:
- S-001 R2 (DirectoryTreeNode の解決指針): S-005 で `view.ts` 直接 import に統一したので意味を失った。
- S-002 R2 (loaders 戻り型 readonly 整合): plan W-B-003 ステップ 5 の typecheck 確認で吸収する範囲と判断。
- S-006 (wire.ts 切り出し動機の追記): plan の現行記述（"actions.ts は server fn 定義に集中" + P-003 引用）で十分追跡可能。
- S-007 (テストコメントの文言更新): スコープ内の小修正だが、実装時にコメントが残っていれば自然に更新される範囲。plan の明示は不要。

### 3周目

**結果**: 両視点ともに問題点ゼロで終了。改善提案 S-008・S-009 のみ。

**取り込んだ改善提案**:
- **S-008 (`useServerFnRouter` の fallback API)**: `NotePickerDialog.test.tsx` の単一 mockedFn パターン対応として、ヘルパーの 2 引数目に `fallback` を受け取れる形に拡張する判断を実装時に検討。plan のコード例はそのままで、POC 時に「3 ファイル目の単一 fn パターンがどう書けるか」を見て決める。
- **S-009 (assertion 整合の記録)**: テスト方針 W-B-003 に「`expect(document.body.textContent).toContain("INGESTION_TIMEOUT")` 等の `errorCode` 単独 assertion は変更不要」と明記（下記反映）。

**見送った提案とその理由**:
- なし（残提案は plan に反映済み）。
