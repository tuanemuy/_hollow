# 実装計画 — Issue #306: ingestion commit パスで directoryNameToCreate ありの場合に Sidebar が stale になる

**Issue:** #306
**作成日:** 2026-05-29
**複雑度:** 小規模

---

## 目的

`IngestionPreviewForm.tsx` および `IngestionJobRow.tsx` の commit パスで、新規ディレクトリが作成されるケースで Sidebar の directory tree が stale になる問題を解消する。`.issue/299/adr.md` ADR-003 で定義された rule 2（Sidebar の directory tree を改変する mutation）に該当するため、生 `router.invalidate()` を呼ぶ必要がある。

`IngestionJobRow.onCommit` は当初 `directoryNameToCreate` を server function に送っていなかったが、Phase 2 検証で「これは LLM 提案を黙って捨てる仕様乖離」と判断し、Issue #306 のスコープに含めて修正する。詳細は `adr.md` ADR-001（review-001 後に方針確定）。本 PR で Issue #312 も同時に close する。

## スコープ

### 含まれるもの
- `app/components/ingestion/IngestionPreviewForm.tsx` の `onSubmit`（commit パス）成功時、`pendingDirectoryName !== null` のときに `await router.invalidate()` を追加
- `app/components/ingestion/IngestionJobRow.tsx` の `onCommit` で preview の suggested 値（`suggestedDirectoryId` / `suggestedDirectoryName`）を commit 引数に転送し、`willCreateDirectory` の場合に `await router.invalidate()` を追加
- 両ファイルに WHY コメント（rule 2 への参照）を付与

### 含まれないもの
- ingestion ロジック全体のリファクタリング（commit ハンドラ共通化など）
- その他 `router.invalidate()` 呼び出し箇所の見直し
- `routerInvalidate` ラッパーの利用変更（rule 2 は **生** `router.invalidate()` を使う規約のため、ラッパーは使わない）

## 実装ステップ

### 1. IngestionPreviewForm.tsx の commit 成功時に invalidate を追加

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:**
  - `onSubmit` 内の `commit({ ... })` 成功後、`onCommitted` を呼ぶ**前**に、`pendingDirectoryName !== null` の場合のみ `await router.invalidate()` を実行する。
  - WHY コメント `// rule 2: 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate（.issue/299/adr.md ADR-003）` を付与。
- **理由:** `pendingDirectoryName` がある状態で commit が成功すると、サーバー側で新ディレクトリが作成される。Sidebar の directory tree が stale になるため明示的に invalidate が必要。

### 2. IngestionJobRow.tsx の commit パスを `IngestionPreviewForm` と一貫させる

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:**
  - preview の suggested 値から `suggestedDirectoryId` / `suggestedDirectoryName` を読み出し、`commit({ data })` に転送する:
    - `suggestedDirectoryId !== null` → `directoryId` として送信
    - `suggestedDirectoryId === null && suggestedDirectoryName !== null` → `directoryNameToCreate` として送信
  - `willCreateDirectory`（後者のケース）のときのみ `router.navigate(...)` の**前**に `await router.invalidate()` を実行する
  - WHY コメント `// rule 2: 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate（.issue/299/adr.md ADR-003）` を付与
- **理由:** ADR-001 参照。`IngestionPreviewForm` 経由と `IngestionJobRow` 経由で commit 後の挙動を一貫させる仕様乖離修正。LLM が提案した新規ディレクトリ名を反映する。

## 設計判断

- **`routerInvalidate` ラッパー vs 生 `router.invalidate()`**: rule 2 に該当する mutation は `.issue/299/adr.md` ADR-003 で「生 `router.invalidate()` + WHY コメント」と決まっているため、ラッパーは使わない。
- **`IngestionJobRow` の対応スコープ**: ADR-001 参照。review-001 後の方針確定で「仕様乖離（実装漏れ）」と判断し、`IngestionPreviewForm` と一貫させる修正を本 PR に含めた。Issue #312 も同時に close する。
- **`IngestionPreviewForm` の discard パス**: `runDiscard` 内では既に `routerInvalidate(router)` ラッパー経由で `_app` を除外している。Issue 範囲外なので変更しない。

## リスクと注意点

- `router.invalidate()` は `_app` も含めて全 match を invalidate するため、`_app` loader（profile / directory tree）が再評価され、僅かにレスポンスが遅くなる。ただし新規ディレクトリ作成という比較的稀なケースに限定するため許容範囲。
- `router.invalidate()` を `onCommitted` / `router.navigate` より**前**に await することで、画面遷移時には最新の tree が反映済みとなる。順序を逆にすると遷移直後に stale な Sidebar が一瞬見えるリスクがある。
- ADR-003 の rule 2 ルールが明文化されているため、生 invalidate の使用は規約準拠。WHY コメント必須。

## テスト方針

- ブラウザ検証で以下を確認:
  1. `IngestionPreviewForm` で新規ディレクトリ名を指定して commit → 遷移先で Sidebar に新ディレクトリが表示される（LLM 経路含むため Phase 2 ではコードレベル確認に留める）
  2. `IngestionJobRow` で preview の suggested が新規系のとき commit → 遷移先で Sidebar に新ディレクトリが表示される
  3. 既存ディレクトリ ID を選択した commit パスでは、Sidebar tree が変わらない（無駄な invalidate が走らないこと）→ `.issue/306/manual-test/results/TC-3.md` で確認済み
- 既存ユニットテスト（`__tests__/UploadDialog.test.tsx`, `__tests__/IngestionPreviewForm.test.tsx` 等）は壊さない。typecheck / lint で確認。
