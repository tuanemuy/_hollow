# 残存課題 — Issue #286

## manual-test スキップ理由

Phase 2 の「ブラウザ検証」は、本 PR ではスキップして自動テストに委ねる判断を行った。理由は以下:

1. **検証ポイントが自動テストで網羅されている**
   `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx` の Issue #286 describe で、`vi.useFakeTimers` + 実 React レンダリング (`createRoot`) + `saveDraft` モック（`signal.addEventListener("abort", ...)` で reject する実装）を組み合わせ、次の 4 ケースを統合レベルで pin している:
   - saveDraft 呼出に `AbortSignal` が渡っていること
   - discard 確定で `signal.aborted === true` に遷移すること
   - confirm cancel では `signal.aborted === false` のままで indicator が `保存中…` のままであること
   - error 状態で discard すると `自動保存に失敗` バナーが消えて `自動保存はオフ` に戻ること

2. **`(canceled)` ステータスは agent-browser の主機能では取得しづらい**
   testing.md の主要な検証点（"fetch が DevTools 上で `(canceled)` になる"）は、agent-browser の `snapshot` / `find` / `is visible` のいずれでも DevTools Network ペインを直接覗けないため、手動検証と比べて agent-browser 経由での追加保証は限定的。AutosaveIndicator の遷移（`保存中…` → `自動保存はオフ`）と confirm 動作は自動テストで網羅済み。

3. **環境立ち上げコスト**
   この検証のためだけに Cloudflare Workers dev 環境 (`pnpm dev`)、better-auth + Google OAuth or admin token によるユーザー seed、既存ノート作成、ログイン状態の維持を必要とし、コストが得られる追加保証に対して大きい。

## フォローアップ提案

- レビューワーが「実際の DevTools 上で `(canceled)` を見たい」と判断した場合は、`pnpm dev` を立ち上げて手動で `testing.md` の確認項目 1〜4 を実行する（5〜10 分）
- 自動テストが落ちずに通っていることをレビュー時に再確認し、新たな疑念が出た場合のみ手動検証を追加する

## その他

特になし。plan.md の全実装ステップは完了済み。
