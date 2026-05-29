# PR Review #001 — fix(issue/306): invalidate _app after ingestion commit with new directory

**PR:** #311
**実施日:** 2026-05-29
**レビュー方式:** General Review（小規模 Issue のため単発レビュー）
**最終ステータス:** APPROVED（Blockers 0 / Warnings 2 — いずれも本 Issue スコープでは見送り）

---

## General Review

### Blockers
なし

### Warnings

- **[W-001]** `router.invalidate()` 失敗時の挙動: invalidate 失敗で catch に入ると、commit はサーバー側で成功しているのに `onCommitted` が呼ばれず、ユーザーが「失敗した」と誤認する可能性
  - 場所: `app/components/ingestion/IngestionPreviewForm.tsx:201-206`
  - 理由: `router.invalidate()` が reject した場合、commit はサーバー側で成功（新規ディレクトリ + ノート作成済み）にも関わらず `catch` で `setError` され `onCommitted` がスキップされる。再 submit で `invalid state` 系のエラーになるリスク
  - 提案: `await router.invalidate().catch(() => {})` で invalidate 失敗を許容
  - **対応方針: 本 Issue では見送り**
    - 理由 1: 同じ「invalidate 失敗を catch しない」パターンは `IngestionPreviewForm.runDiscard`, `IngestionJobRow.runDiscard / onRegenerate`, `UploadForm` 等プロジェクト全体で採用されている。本 Issue だけで修正すると一貫性が崩れる
    - 理由 2: `router.invalidate()` は client-side のキャッシュ無効化処理で、実際に reject するシナリオは限定的（route loader が throw した場合等）
    - 理由 3: scope creep を避ける（Issue #306 は「Sidebar が stale になる」問題の解消が目的）
    - フォローアップが必要な場合は別 Issue で「invalidate 失敗時のフォールバック規約」を扱う

- **[W-002]** TC-1 が SKIP のままで「`pendingDirectoryName !== null` で invalidate を走らせると Sidebar が即時反映される」というポジティブパスのブラウザ実機検証が無い
  - 場所: `.issue/306/manual-test/results/`
  - 理由: TC-3（既存ディレクトリ選択）は「invalidate が **走らない** こと」の間接確認。TC-2 は別問題発見で取り下げ
  - 提案: 既存ユーザーで `/upload` → ファイルアップロード → preview → DirectoryPicker 新規名入力 → 登録 のフローを agent-browser で 1 回通す
  - **対応方針: 本 Issue では見送り**
    - 理由 1: TC-1 は LLM 経路を含み、agent-browser での実行は時間とトークンを大幅消費。ユーザー指示で SKIP 済み
    - 理由 2: 修正は `pendingDirectoryName !== null` の場合に生 `router.invalidate()` を呼ぶだけの単純なコード追加（5行）。コードレベルでの正当性は明らか
    - 理由 3: typecheck / unit test (2690 件) / biome lint で品質ゲート通過済み
    - PR 説明欄でも TC-1 SKIP 理由を明記済み

### Notes

- **[N-001]** rule 2 規約への準拠は完璧。生 `router.invalidate()` を使い、WHY コメントに `.issue/299/adr.md ADR-003` への参照と「Sidebar tree が変わるため」という意味的理由の両方を含めている。
- **[N-002]** invalidate 呼び出しの順序が正しい。`onCommitted` の前に await することで、navigate 先の loader 評価時に `_app` も含めて全 match が再評価対象になっており、Sidebar に新規ディレクトリが反映された状態で着地する。順序を逆にすると「遷移直後に旧 Sidebar が一瞬見えてから差し替わる」フリッカー UX になりうる。
- **[N-003]** 判定条件 `pendingDirectoryName !== null` は妥当。DirectoryPicker の `onSelectExisting` / `onSetPendingName` が相手を `null` にする mutually exclusive な state 設計なので、サーバー側の `directoryNameToCreate` 分岐との対応が壊れていない。重複名エラーは catch で `setError` され invalidate は走らない一貫性も保たれる。
- **[N-004]** ADR-001 の論理整合性は高い。元 plan で `IngestionJobRow` も含めていたところを、Phase 2 の検証で「実際には新規ディレクトリ作成パスが存在しない」と判明し scope を絞った判断は妥当。dead code を残さない方針も正しい。
- **[N-005]** 既存テスト（`IngestionPreviewForm.test.tsx`）は変更不要。レグレッションガードとして「`pendingDirectoryName !== null` の commit で `router.invalidate` がちょうど 1 回呼ばれる」ユニットテストを追加する余地はあるが、優先度は低い。
- **[N-006]** typecheck / lint / unit (2690 件) すべて green。PR 説明も ADR-001 のスコープ縮小理由を明示しており適切。

---

## 結論

**APPROVED** — Blockers なし。Warnings 2 件はいずれも本 Issue のスコープ／コスト／一貫性の観点から見送りが妥当と判断。Ready for review に切替可能。
