# PR Review #002 — feat(speech): 録音＋文字起こしによるノート化

**PR:** #736
**Date:** 2026-06-14
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 25
- Verdict: **BLOCKED**（W-001 残を修正 → Round 3 で確認）

## レイヤー別ファイル

- Domain + Use Case: review-002-domain-usecase.md（B: 0 / W: 0）
- Adapter + Infrastructure: review-002-adapter-infra.md（B: 0 / W: 0）
- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Security: review-002-security.md（B: 0 / W: 0）
- Test: review-002-test.md（B: 0 / W: 0 / APPROVED）

## 指摘一覧と仕分け

### このPRで直す
- [frontend W-001 残] AudioRecorder の純関数（pickSupportedMime/formatDuration/recorderStatusText）未テスト・未export。W-002 の「録音中は秒数非依存」a11y 契約が回帰検出できない → **修正済み**（純関数を export し単体テスト16件追加。recorderStatusText の recording=秒非依存を assert）

Round 1 の Blocker 2 / Warning 群はすべて解消確認済み（各 review-002-*.md の Notes 参照）。
