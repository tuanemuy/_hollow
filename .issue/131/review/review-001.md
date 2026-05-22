# PR Review #001 — refactor(issue-131): constantize BusinessRuleError literals via *ErrorCode

**PR:** #135
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 24
- Verdict: **APPROVED**

---

## Domain Layer

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** `CommonErrorCode` の配置・命名は妥当。`app/core/domain/common/errorCode.ts` は外部 import を一切持たず依存ゼロ（version.ts / event.ts のみが利用）。循環依存リスクなし。
- **[N-002]** value はすべて `lower_snake_case` 規約に合格: `invalid_version`, `invalid_event_id`, `token_not_found`, `token_expired`, `token_consumed`, `token_purpose_mismatch`, `media_not_owned`, `note_trashed`
- **[N-003]** key はすべて `PascalCase` 規約に合格: `InvalidVersion`, `InvalidEventId`, `TokenNotFound`, `TokenExpired`, `TokenConsumed`, `TokenPurposeMismatch`, `MediaNotOwned`, `Trashed`
- **[N-004]** spec 文言との verbatim 一致確認:
  - `token_*` ← `spec/usecases/identity.md:94,107,229,296`, `spec/testcases/identity/index.md:42-45,97-99,127`
  - `media_not_owned` ← `spec/usecases/publication.md:20`, `spec/usecases/identity.md:317`, `spec/testcases/identity/index.md:135`, `spec/domains/{publication,note,media}.md`
  - `note_trashed` ← `spec/usecases/publication.md:20`, `spec/usecases/note.md:51,75,95,113`, `spec/testcases/{publication,note}/index.md`
  - `invalid_version` / `invalid_event_id` は spec 不在につき ADR-001（#131）のとおり prefix 無し lower_snake をデフォルト適用
- **[N-005]** `NoteErrorCode.Trashed` / `AlreadyTrashed` 並立は ADR-002（#131）および #82 ADR-006 の二段階アプローチに沿って正当
- **[N-006]** `IdentityErrorCode.MediaNotOwned` 追加（4 ドメイン目の同値共有）は ADR-003（#131）および #82 ADR-004 に従い、ドメイン横断の依存を増やさない選択として適切
- **[N-007]** `Version.create` / `EventId.create` の value が UPPER → lower に変わる回帰可能性について、grep で production code 内（domain/application/adapter）に `INVALID_VERSION` / `INVALID_EVENT_ID` を assert する箇所が 2 ファイル以外ゼロを確認。回帰リスク事実上ゼロ
- **[N-008]** ドメイン層内の `BusinessRuleError("...")` リテラル直書きはゼロ（残存ヒットは JSDoc コメントのみ）
- **[N-009]** `errorCodeNaming.test.ts` の `EXPECTED_ERROR_CODE_NAMES` Set に `CommonErrorCode` がアルファベット順位置で追加されており、再発防止メカニズムに組み込まれている

---

## Use Case Layer

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** `challenge.ts` の戻り値型ジェネリクスが `typeof IdentityErrorCode.TokenNotFound | ...` の Union として正しく宣言され、`BusinessRuleError<string literal Union>` の型推論が定数経由でも維持されている
- **[N-002]** `updateProfile.ts:78-94` の 3 箇所すべてで `IdentityErrorCode.MediaNotOwned` に置換され、メッセージ文字列は個別に維持
- **[N-003]** publication 3 ファイルの `NoteErrorCode.Trashed` 参照は、publication → note の正方向依存
- **[N-004]** `issueShareLink.ts:74-77` に残る `"visibility_private"` リテラル直書きは、#82 ADR-001 Scope clarification および #131 plan「含まれないもの」スコープ宣言に従い意図的に未対応。スコープ違反ではない
- **[N-005]** plan.md スコープ外の変更は紛れ込んでいない（8 ファイル変更 + `.issue/131/` ドキュメント 3 ファイル）
- **[N-006]** import 文はすべて application → domain の正方向依存
- **[N-007]** 既存 integration テストの string 直書き assert は value 不変なので影響なし
- **[N-008]** `runIngestionJob.integration.test.ts:210` の `"sanitize_failure"` 直書きはテスト fixture 内の意図的投入で production code ではない。スコープ外として問題なし

---

## Test Layer

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** `EXPECTED_ERROR_CODE_NAMES` Set への `"CommonErrorCode"` 追加位置（`errorCodeNaming.test.ts:53`）がアルファベット順として正しい
- **[N-002]** 新規 `common/errorCode.ts` は glob `../*/errorCode.ts` で自動発見される。`pnpm test:unit -- errorCodeNaming.test.ts` は 99 file / 1997 test passed
- **[N-003]** `INVALID_VERSION` / `INVALID_EVENT_ID` を直接 assert していたテストはリポジトリ全体に存在しない（grep ヒットゼロ）
- **[N-004]** 既存 identity integration test（`identity.integration.test.ts:376/398/431/945/1135`）が token_* を文字列リテラル直書き比較しているが、value 不変のためそのまま通る。plan.md「定数経由化 sweep は本 Issue 外」方針と一致
- **[N-005]** `"media_not_owned"` / `"note_trashed"` を直接 assert している integration テストはリポジトリ全体に無い
- **[N-006]** `common/errorCode.ts` 単独の unit test は `errorCodeNaming.test.ts` の汎用検証で全 property が自動カバーされるため不要
- **[N-007]** touch すべきテストの漏れなし。`NoteErrorCode.AlreadyTrashed` 重義性整理は #82 ADR-006 / #131 ADR-002 のとおり意図的に手付かず

---

## Design Decisions

このラウンドで見つかった新規設計判断は特になし。既存 ADR-001〜004（#131）および #82 ADR-001/002/004/005/006 の延長線上で実装されており、レビュアーいずれも妥当性を確認している。
