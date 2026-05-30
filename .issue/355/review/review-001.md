# PR Review #001 — P13 アップロードモーダル: LLM 提案精度の向上と登録 UX 改善

**PR:** #361
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（うち実害につながる主要 5 を即時修正）
- Notes: 多数（設計・規約準拠を確認）
- Verdict: **BLOCKED → 修正反映済み（再レビューへ）**

レイヤー: アプリケーション/ユースケース・アダプター/ドメインポート・フロントエンド・テスト の4視点を並列レビュー。

---

## アプリケーション/ユースケース層

#### Blockers
なし

#### Warnings
- **[W-A-001]** `canonicalizeDirectoryPaths` の親辿り `while` ループに循環参照ガードが無い（コメントは「depth cap bounds」と書くが実装は depth 未参照）。データ破損で親子循環があると無限ループ＋メモリ膨張でワーカーがハングし、try/catch（throw 用）でも救えない。
  - 場所: `runIngestionJob.ts:381`
  - 修正: `visited: Set<string>` を導入し循環検出時はその行をスキップ（d1 `findAncestors` の guard を踏襲）。→ **修正済み**

#### Notes
- ADR-006 の独立 UoW での findTree 実行・空配列フォールバック・rate-limit rollback の spy index #2→#3 整合を確認。
- マッチングは ADR-004/005 通り（既存一致→id 解決＆name=null、不一致→leaf 単一名）。`normalizePathForMatch` は `DirectoryName.equals` と整合し過剰一致しない。
- `PipelineDeps` 経由注入で runPipeline の純粋性を維持。LLM には path のみ提示（id 非提示）。

## アダプター層＋ドメインポート

#### Blockers
なし

#### Warnings
- **[W-B-001]** 新規ディレクトリ提案の leaf 名が長すぎると `IngestionPreview.create` が throw し取り込みジョブ全体が `failed` になる（タグは best-effort なのに対し非対称）。
  - 場所: `runIngestionJob.ts` resolveDirectorySuggestion → `valueObject.ts:385`
  - 修正: leaf が `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH` 超過時は `suggestedDirectoryName=null` にフォールバック（提案破棄）。定数を domain VO から export して参照。→ **修正済み**
- **[W-B-002]** openai/gemini アダプターがプロンプト改善（title/dir/tag）と existingDirectories 文脈を取りこぼす。provider 切替で要件2〜4が片肺になる。
  - 場所: `gemini/llmProvider.ts`, `openai/llmProvider.ts` の `buildStructure*`/`buildMetadata*`
  - 修正: 3アダプター共通のプロンプトビルダーを `app/core/adapters/llm/prompts.ts`（既存共有 `jsonEnvelope.ts` と同居）に抽出し、anthropic/openai/gemini すべてが参照。三重複も解消。→ **修正済み**

#### Notes
- `existingDirectories?` の任意化で stub/openai/gemini の後方互換（型・挙動）を確認。JSON envelope/retry/prefill は無傷。
- ポート JSDoc は ADR-002/004/005 と一致。ドメイン層に I/O 漏れなし。
- 巨大ツリー時のトークン量上限は本 Issue スコープ外（plan リスク欄に記載済み）。

## フロントエンド

#### Blockers
なし

#### Warnings
- **[W-F-001]** `CommittedView` の「ノートを開く」`<Link>` が `onClick={onClose}` と route 遷移を二重発火。`onClose` は単なる close でなく `router.navigate({to:"."}) + replaceState` のため、`/notes/$noteId` 遷移と競合し最悪ノートに飛ばない/URL 不整合。
  - 場所: `UploadDialog.tsx` CommittedView の Link
  - 修正: Link から `onClick={onClose}` を除去。`/notes/$noteId` 遷移で `#upload` ハッシュが落ち `open` が false になり自然に閉じる（他 view の Link と同じ慣習）。→ **修正済み**
- **[W-F-002]** `committed` view への遷移・成功 announce・Link 遷移・成功 view で閉じられることの UploadDialog テストが無い。
  - 修正: `UploadDialog.test.tsx` に「editing→commit→committed」テストを追加（編集 title が commit に渡る／成功 announce／`to="/notes/$noteId"`／即 navigate しない を検証）。→ **修正済み**

#### Notes
- `committed` は `isPending` に含めず `closable=true`、backdrop/×/Esc/閉じるで閉じられる（設計通り）。
- 本文プレビュー削除は綺麗（`READONLY_CONTENT` 完全削除、`contentHtml` は wire/domain に残す）。
- 登録ボタン pending は `aria-busy`/`Loader2`/`motion-safe:animate-spin`/「登録中...」で a11y・規約準拠。成功演出は token（text-success）+ utility のみ、handwritten CSS なし。

## テスト

#### Blockers
なし

#### Warnings
- **[W-T-001]** `committed` view 未テスト（= Frontend W-F-002）。→ **修正済み**
- **[W-T-002]** near-miss が既存に過剰一致しないことのテストが無い。
  - 修正: 既存 `Work` に対し `Worked` が id 解決せず新規 `Worked` になるテストを追加。→ **修正済み**
- **[W-T-003]** 多段パス（`親/子`）の `canonicalizeDirectoryPaths` 投影が統合テストで未検証（seed が depth-1 のみ）。
  - 修正: `seedNestedDirectory`（root→parent→child）を追加し、`Work/Reports` の正準投影＆id 解決を検証。親 `Work` も配置先として提示されることも確認。→ **修正済み**

#### Notes
- rate-limit rollback の spy index #2→#3 は run 順 promote→findTree→rollback と整合。
- adapter プロンプト整形テストは `toContain` ベースで脆くない。
- 追加: leaf 長超過でジョブが `failed` でなく `previewing` に到達し name=null になるテスト（W-B-001 の回帰防止）。
- 循環ガード（W-A-001）は内部関数かつ DB に循環を仕込むのが非現実的なため専用テストは見送り。防御コードは d1 `findAncestors` の確立パターンを踏襲。

---

## 修正サマリー（このラウンドで反映）

| ID | 内容 | 対応 |
|---|---|---|
| W-A-001 | canonicalize 循環ガード | visited Set 導入 |
| W-B-001 | leaf 長超過で job 失敗 | 超過時 name=null フォールバック |
| W-B-002 | openai/gemini のプロンプト未追従 | 共有 `llm/prompts.ts` に抽出し3 adapter 共有 |
| W-F-001 | CommittedView Link 二重遷移 | onClick={onClose} 除去 |
| W-F-002 / W-T-001 | committed view 未テスト | UploadDialog.test に追加 |
| W-T-002 | near-miss 過剰一致テスト欠如 | 追加 |
| W-T-003 | 多段パス canonicalize 未検証 | seedNestedDirectory で追加 |

## Design Decisions

- ADR-007 を追加（プロンプトビルダーの共有モジュール化）。

## 検証結果

- `pnpm typecheck`: クリーン
- `./node_modules/.bin/biome check --write app/`: クリーン（残 warning は既存の test biome-ignore）
- `pnpm test:unit`: 2854 passed
- `pnpm test:integration`（runIngestionJob 含む）: 実行中→結果は次ラウンドで確認
