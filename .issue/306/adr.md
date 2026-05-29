# ADR — Issue #306: ingestion commit パスで directoryNameToCreate ありの場合に Sidebar が stale になる

## ADR-001: `IngestionJobRow` の commit パスでも `directoryNameToCreate` を送る仕様乖離の修正

### Status
Accepted（review-001 後に方針確定）

### Context
Issue #306 の本文は次の前提を置いていた:

> `IngestionPreviewForm.tsx` の `onSubmit`（commit）パスと `IngestionJobRow.tsx:82` の `commit` パスでは、`directoryNameToCreate` が指定されている場合に新規ディレクトリが作られる。

Phase 2 のブラウザ検証で実装と仕様を再確認したところ、**`IngestionJobRow` の commit パスは `directoryNameToCreate` を server function に送っていない**ことが判明:

```ts
// app/components/ingestion/IngestionJobRow.tsx::onCommit (修正前)
const result = await commit({ data: { jobId } });
```

サーバー側 (`commitIngestionPreview` use case) の `resolveDirectoryId` は

```
explicit directoryId → directoryNameToCreate → preview.suggestedDirectoryId → root
```

の優先順位で解決し、**`preview.suggestedDirectoryName` は使われない**。結果として `IngestionJobRow` の commit パスは「LLM が提案した新規ディレクトリ名」を反映せず、`suggestedDirectoryId` が `null` の場合はノートを root 直下に保存していた（`.issue/306/manual-test/results/TC-2.md` 参照）。

初版 review-001 では「これは UX 上意図された挙動の可能性」と見て本 Issue から切り出し別 Issue #312 として起票したが、その後の判断で **仕様乖離（実装漏れ）** と確定。`IngestionPreviewForm` 経由と `IngestionJobRow` 経由で同じ commit server function を呼んでいるにも関わらず挙動が異なるのは利用者から見て一貫性が無く、LLM が提案した directory 名が黙って捨てられる現状は不具合と判断する。

### Decision
- `IngestionJobRow.onCommit` で preview の suggested 値を commit 引数に転送する:
  - `suggestedDirectoryId !== null` → `directoryId` として送信
  - `suggestedDirectoryId === null && suggestedDirectoryName !== null` → `directoryNameToCreate` として送信
- 新規ディレクトリ作成パス（`willCreateDirectory`）では生 `router.invalidate()` を呼び、rule 2（`.issue/299/adr.md` ADR-003）として Sidebar の directory tree を更新する。
- これにより Issue #312（別途起票していた仕様判断 Issue）も本 PR で同時にクローズする。
- 修正対象は `IngestionPreviewForm.tsx` と `IngestionJobRow.tsx` の 2 ファイル（最終形）。

### Consequences
- **良い点:**
  - `IngestionPreviewForm` 経由と `IngestionJobRow` 経由で commit 後の挙動が一貫する
  - LLM が提案した新規ディレクトリ名がユーザーの操作に反映される
  - rule 2 規約を満たす invalidate が正しい位置に入る
  - Issue #306 の意図（「commit パスで Sidebar が stale」問題の解消）が両動線で完全に達成される
- **トレードオフ:**
  - `IngestionJobRow` の「ノートとして保存」がユーザー確認なしで directory を作成するようになる。意図せず directory tree が変わるリスクはあるが、もともと preview 段階で LLM 提案を確認できる UI（regenerate / discard / `IngestionPreviewForm` 経由の編集）が存在するため許容範囲と判断
  - **Semantic shift**: サーバー側 `commitIngestionPreview.resolveDirectoryId` は意図的な非対称設計で、`directoryId`（explicit）は missing/foreign で throw、`preview.suggestedDirectoryId`（fallback）は missing/foreign で root に graceful fallback する。本 PR で `IngestionJobRow.onCommit` は preview の `suggestedDirectoryId` を **explicit** の `directoryId` として送るため、preview 生成〜commit の間に suggested ディレクトリが削除 / 他人に移譲されたケースで commit が `DIRECTORY_NOT_FOUND` / `DIRECTORY_FORBIDDEN` で落ちる挙動に変わる。`IngestionPreviewForm` 側も初期 state を `suggestedDirectoryId` で埋めて explicit 送信しているため同じ brittleness を既に抱えており、PR 後は両動線で挙動が「明示エラー化」で揃う。サーバー側 `suggested → root` graceful fallback は UI 経路では事実上 dead path となり、直接 API 呼び出しや preview の suggested が両方 null のケースのみが該当する
  - 既存テスト（`IngestionJobRow.test.tsx`）は不在のため、新 payload 構築 + 条件付き invalidate のレグレッションガードを別途追加（`.issue/306/review/review-002.md` W-002 対応）

### Notes
別 Issue として起票していた **#312 は本 PR で close**（PR description に `Closes #312` を追記する）。
