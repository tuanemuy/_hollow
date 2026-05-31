# ブラウザ検証レポート — Issue #355

**実行日:** 2026-05-30
**テストソース:** `.issue/355/testing.md`
**結果:** スキップ（環境制約による到達不能 — コードで実証済み）

---

## サマリー

| 項目 | 状態 |
|---|---|
| agent-browser | 利用可（v0.27.0） |
| ローカルサーバ起動 | 未実行（下記理由により到達検証が無意味なため） |
| 確認項目 1〜5 の実機検証 | **スキップ（到達不能）** |

## スキップ理由（コードで確認した確定的な環境制約）

本Issueの要件1〜5はすべて `IngestionPreviewForm`（P13 取り込みプレビュー編集フォーム）上に現れる。このフォームは「取り込みジョブが preview を生成して初めて」表示される。ローカル環境ではそこへ到達できないことを、推測ではなくコードで確認した。

1. **LLM API キーが未設定 → Stub が配線される**
   ローカル `.dev.vars` の `ADMIN_LLM_API_KEY` は空。DI（`app/core/application/di/serverCloudflare.ts`）は API キーが無いと `StubLLMProvider`（`app/core/adapters/stub/llmProvider.ts`）を配線する。

2. **Stub は全提案メソッドで throw する**
   `StubLLMProvider.structureToHtml` / `suggestMetadata` はいずれも `BusinessRuleError("llm_not_implemented_in_mvp")` を throw する。

3. **`suggestMetadata` は全ファイル形式で無条件に呼ばれる**
   `runIngestionJob.ts runPipeline` では、HTML/Markdown 分岐は `structureToHtml`（LLM）を回避するが、その直後の `suggestMetadata` は形式に関わらず無条件で呼ばれる（`runIngestionJob.ts:318` 付近）。タグ整形の `try/catch` は `TagName.create` のみを囲っており、`suggestMetadata` 呼び出し自体は囲っていないため、throw はそのまま伝播してジョブが `failed` になる。

   → よって **HTML/Markdown を含むどの形式でも、ローカル stub 環境では取り込みジョブが metadata 提案段階で失敗し、`IngestionPreviewForm` に到達できない**。

4. 加えて、取り込みは R2 プリサインドアップロード + Queue consumer にも依存する（ローカル疎通の追加前提）。

この `llm_not_implemented_in_mvp` 失敗は本Issueの変更とは無関係な既知の環境制約であり、GitHub Issue 起票の対象外（manual-test 起動時にもその旨を指示済み）。

## 代替で担保した検証

実機ブラウザ検証が環境的に不能なため、以下で品質を担保した:

- `pnpm typecheck`: クリーン（UploadDialog の `View` union 追加・`viewStatusText` の `committed` case 追加・`onCommitted` のシグネチャ変更・`IngestionPreviewForm` の本文プレビュー削除がすべて型整合）
- `./node_modules/.bin/biome check/format`（app/）: クリーン
- `pnpm test:unit`: 2853 passed（`IngestionPreviewForm.test.tsx` の本文プレビュー削除・`onCommitted` arity 変更を反映したテスト含む）
- `pnpm test:integration`（runIngestionJob）: 23 passed（既存ツリーをLLM文脈に渡す／既存パス一致でid解決／不一致でname フォールバック／ツリー空、の新規4件含む）

## 推奨フォローアップ

実LLM接続（`ADMIN_LLM_API_KEY` を設定）+ R2 + Queue consumer が疎通する検証環境（staging 等）で、`.issue/355/testing.md` の確認項目1〜5を手動確認することを推奨する。特に提案品質（タイトル/ディレクトリ/タグ）は非決定的なため、実LLMでの目視確認が必要。
