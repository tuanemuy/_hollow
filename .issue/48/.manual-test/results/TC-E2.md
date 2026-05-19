# TC-E2: search index に hit があるが DB から削除された競合ケース（ADR-002: drop 動作）

**実行日:** 2026-05-20
**結果:** **SKIP**

## SKIP 理由

testing.md 記載の通り「タイミングウィンドウが短く手動再現困難」(`再現難易度: 高`)。

代替確認として **unit test の drop ケースで挙動を pin 済み** (`searchOwnNotes.test.ts`)。

該当 unit test の概要:
- search index が hit を返し、`findByIds` がそのうち一部 ID で `undefined` を返した場合、
  drop して残りで結果を構成する
- 500 エラーにならない
- `total` は drop 前の hit 数を維持し、UI 側の pagination 計算がズレない（ADR-002 設計）

ブラウザでの再現は purge と index relay 走行のタイミングを精緻に制御する必要があり、
手動操作では現実的でないため SKIP とする。
