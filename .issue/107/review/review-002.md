# PR Review #002 — infra(issue-107): seed SECRET_BOX_MASTER_KEY in .dev.vars.example for local /admin/llm save

**PR:** #111
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## General Review (Round 2)

### 前回 Warning の解消状況

- **W-001: 解消**。README は「staging and production keys **MUST** be provisioned via `wrangler secret`」へ書き換えられ、続けて「as of this commit, `SECRET_BOX_MASTER_KEY` is not yet wired into `infra/src/secrets.ts` (`workerSecretSpecs`); production rollout is tracked in issue #102」と未完了であることを明示。`.dev.vars.example` 側のコメントも同様の修正済み。
- **W-002: 解消**。`.dev.vars.example` の `SECRET_BOX_MASTER_KEY` セクションに `#102` への参照が追加され、`workerSecretSpecs` との drift（同期されていない理由）が明示的に追跡されている。README / `.dev.vars.example` ヘッダー・ボディの 3 箇所で文言が整合。
- **W-003: 解消**（別 Issue 追跡で妥当）。本 PR スコープ外として Issue #102 にレビューコメントを追加（SOPS 復号結果への grep を CI 追加で提案）。`gh issue view 102 --comments` で確認済み。
- **W-004: 解消**。`summary.md` の EDGE-1 は「PASS — ただし『未設定』ケースで再現（『空文字書換』ケースは未実行）」と区別を明示。TC-1.md でも testing.md との差分が明確に記録された。

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Issue #102 への follow-up コメント（W-003）追加が確認できた。レビュアー提案どおり具体的アクション（SOPS 復号結果への shipped placeholder grep）が記録されており、運用ハンドオフとして十分。
- **[N-002]** TC-1.md の `decodeMasterKey` への参照説明は厳密には不正確（軽微）。実際には DI 側 `serverCloudflare.ts:151` の `env.SECRET_BOX_MASTER_KEY ? ... : NullSecretBox()` という truthy 判定により、空文字も未設定もどちらも DI レベルで `NullSecretBox` に分岐するため、`decodeMasterKey` の "empty" / "is not set" パスは実行時には到達しない。結論「同じ `KeyUnavailable` エラーコードに落ちる」は正しいが、その理由は DI の truthy 判定。Warning には上げないが記録として残す。
- **[N-003]** README の「Note: as of this commit ...」は将来 #102 が完了したら更新が必要な記述。`#102` への参照と "as of this commit" 修飾子がセットなので、Issue クローズ時に追従される想定。
- **[N-004]** Round 1 で挙がった 4 件の Warning がすべて適切に処理されており、新たな regression は検知できなかった。文言の整合性（README ↔ `.dev.vars.example` ヘッダー ↔ `SECRET_BOX_MASTER_KEY` セクション ↔ Issue #102）はすべて一貫している。

---

## Design Decisions

特になし（Round 1 で記録した設計判断のとおりに着地）。
