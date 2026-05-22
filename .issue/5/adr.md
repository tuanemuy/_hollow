# ADR — Issue #5: tests: note / media / ingestion 統合テスト追加

## ADR-001: ファイル分割方針

### Status
Proposed

### Context
identity は 1 ファイル 1590 行で巨大化し、ファイル先頭の helper 群と末尾の it ブロックが視覚的に離れ、読みづらい。一方 directory / tag は 600〜700 行で 1 ファイル方式が機能している。note / media / ingestion はそれぞれ規模が異なる（note ~17 usecase / media ~9 usecase / ingestion ~7 usecase）。

### Decision
- note: usecase or ライフサイクル単位で 10 ファイル（既存 1 + 新規 9）
- media: 1〜2 ファイル（PurgeOrphans は clock 操作と R2 失敗 stub が要るため分離）
- ingestion: 1〜2 ファイル（RunIngestionJob はパイプライン分岐 10 ケースで分離）

### Consequences
- 良い点: spec ⇔ test の対応が辿りやすい、fixture 集約による可読性向上、変更時の差分が小さい
- トレードオフ: ファイル数は増える（13 ファイル）。isolate 立ち上げコストが累積するが、`vitest-pool-workers` の singleWorker 構成下では許容範囲と判断

---

## ADR-002: 共通 fake への変更を行わない

### Status
Proposed

### Context
RunIngestionJob の `llm_failure` / `ocr_failure` / `sanitize_failure` ケースは、`FakeLLMProvider` / `StubOCRProvider` 等が成功パスしか持たないため、失敗を強制注入する手段が必要。`FakeLLMProvider.setStructureError(err)` 追加 vs テストファイル内ローカル subclass の二択がある。

### Decision
共通 fake には触らず、各テストファイル内でローカル subclass を定義して `createTestContainer()` の戻りを spread + 差し替えするパターンを採る。identity が `EnvSetupTokenVerifier` を per-test override する流儀と整合。

### Consequences
- 良い点: 本 Issue を「テスト追加のみ」のスコープに留められる、共通 fake の API 表面を増やさない、失敗パターンが該当テストに局所化されて読みやすい
- トレードオフ: 同じ失敗 stub を複数ファイルで定義する重複が将来発生する可能性。3 箇所以上で重複したら共通化を別 Issue で検討

---

## ADR-003: spec ケース完全網羅

### Status
Proposed

### Context
spec/testcases/{note,media,ingestion}/index.md には 3 ドメイン合計 ~75 ケースが詳細に定義されている。Issue 本文は「定義されたテストケースがほぼ未実装」「定義されたケースを追加する」と明記している。代表ケースのみ実装する方針（happy + 主要エラー 1〜2）も検討候補だが、Issue 文言と乖離する。

### Decision
spec 表の全ケースを 1:1 で実装する。`it` の名前は spec 表の「期待結果」を平叙化した一文とし、`describe` 冒頭コメントに spec ファイルパス + セクション名を記載する。

### Consequences
- 良い点: spec カバレッジが identity / directory / tag と同等水準に揃う、spec-sync の乖離が解消
- トレードオフ: PR が肥大化（~3000 行）。コミットを note / media / ingestion 単位で分割してレビュー負荷を抑える

---

## ADR-004: spec ⇔ 実装の乖離記録

### Status
Resolved by #43 — #2〜#7, #9, #12〜#17 は spec 文言を実装に合わせて修正。#14 は `IngestionErrorCode.DailyUploadQuotaExceeded` を追加して enum 化。#1（DownloadMedia unlisted）/ #10（RestoreNote slug 衝突）/ #11（DuplicateNote trashed 拒否）/ #18（ListNotesByOwner keyword）/ #15 のリトライ強化は本 Issue 範囲外で別 Issue として継続追跡。#8（RunIngestionJob errorCode）は乖離なしで対応不要。

### Context
spec/testcases/{media,ingestion}/index.md の一部期待結果が現状実装と一致しない箇所が計画レビューで判明した。テストを実装に合わせて書けば green になるが、spec 表現と実装挙動の差分を放置すると次回 spec-sync で同じ乖離が再検出される。

### Decision
本 ADR に乖離を列挙し、Phase 4 で **「spec/testcases の文言を実装に合わせる」または「実装を spec に合わせる」** どちらの方向で解消するかを判断する別 Issue を起票する。本 Issue では下記の方針でテストを書く。

#### 列挙

1. **DownloadMedia — 他人 unlisted + viaShareLinkId 未指定**
   - spec: `BusinessRuleError('media_not_viewable')`
   - 実装: `downloadMedia.ts:72` で `void input.viaShareLinkId`、`MediaService.assertViewableBy` が unlisted を viewable 扱いするため拒否されない
   - 本 Issue の扱い: 当該ケースは `it.todo` で残し、Phase 4 で別 Issue を起票

2. **UploadMedia — サイズ超過**
   - spec: `ValidationError`
   - 実装: `BusinessRuleError(MediaErrorCode.ByteSizeExceeded = "MEDIA_BYTE_SIZE_EXCEEDED")`
   - 本 Issue の扱い: テストは実装に合わせて `isBusinessRuleError + code === ByteSizeExceeded` で検証。Phase 4 で spec 文言を実装に合わせる方向で別 Issue 起票（実装側に変更を入れる必然性が薄いため spec 修正方向）

3. **UploadMedia — storage 失敗**
   - spec: `StorageUnavailableError`
   - 実装: `SystemError(SystemErrorCode.ExternalApiError)` にラップ
   - 本 Issue の扱い: テストは `isSystemError + code === ExternalApiError` で検証。Phase 4 で spec 文言の整合を別 Issue 起票

4. **UploadFile — Queue enqueue**
   - spec: 「temp 保存、Queue enqueue」
   - 実装: temp 保存と outbox 経由のイベント発火のみ。Queue への直接 enqueue は無い
   - 本 Issue の扱い: テストは `ingestion_jobs` + `outbox_events` 行存在まで検証。Phase 4 で spec 文言を「outbox 発火」に合わせる別 Issue 起票

5. **UploadFile — 対応外形式 / サイズ超過のエラーコード文字列**
   - spec: `BusinessRuleError('unsupported_format')` / `BusinessRuleError('size_exceeded')`
   - 実装: `BusinessRuleError(IngestionErrorCode.UnsupportedFormat = 'INGESTION_UNSUPPORTED_FORMAT')` / `BusinessRuleError(IngestionErrorCode.ByteSizeExceedsLimit = 'INGESTION_BYTE_SIZE_EXCEEDS_LIMIT')`
   - 本 Issue の扱い: テストは実装の `IngestionErrorCode` 値で検証。Phase 4 で spec 文言を実装に合わせる方向で別 Issue 起票

6. **RegenerateIngestionPreview / CommitIngestionPreview / DiscardIngestionPreview — 状態不正のエラーコード**
   - spec: `'regeneration_limit_exceeded'` / `'invalid_status_for_regeneration'` / `'invalid_status_for_commit'` / `'invalid_status_for_discard'`
   - 実装: `IngestionErrorCode.RegenerationLimitExceeded = 'INGESTION_REGENERATION_LIMIT_EXCEEDED'` / `IngestionErrorCode.InvalidStateForRegenerate = 'INGESTION_INVALID_STATE_FOR_REGENERATE'` / `IngestionErrorCode.InvalidStateForCommit = 'INGESTION_INVALID_STATE_FOR_COMMIT'` / `IngestionErrorCode.InvalidStateForDiscard = 'INGESTION_INVALID_STATE_FOR_DISCARD'`
   - 本 Issue の扱い: テストは実装の `IngestionErrorCode` 値で検証。Phase 4 で spec 文言を実装に合わせる方向で別 Issue 起票

7. **GetIngestionJob / GetIngestionJobs — 他人のジョブを取得時のエラー型**
   - spec: `AuthorizationError`
   - 実装: `ForbiddenError` (`INGESTION_JOB_FORBIDDEN`)
   - 本 Issue の扱い: テストは `isForbiddenError + code === 'INGESTION_JOB_FORBIDDEN'` で検証。アプリケーション層には `AuthorizationError` クラスが存在せず `ForbiddenError` がその役割を担うため、Phase 4 では spec 文言を `ForbiddenError` に合わせる方向で別 Issue 起票

8. **RunIngestionJob — 失敗時の errorCode 文字列**
   - spec: `markFailed('llm_failure')` / `markFailed('ocr_failure')` / `markFailed('sanitize_failure')`
   - 実装: `classifyPipelineError` は LLM* エラーを `'llm_failure'`、OCR エラーを `'ocr_failure'` に変換、Speech は `'speech_failure'`、PDF は `'pdf_parse_failure'`、Office は `'office_parse_failure'`、`BusinessRuleError` はその `code` をそのまま採用、それ以外は `'ingestion.unknown'`。spec の `'sanitize_failure'` は `BusinessRuleError('sanitize_failure', ...)` を sanitizer から投げると自動的に通る。
   - 本 Issue の扱い: テストは `ThrowingSanitizer` を `BusinessRuleError('sanitize_failure', ...)` で実装し、`errorCode === 'sanitize_failure'` を assert。LLM / OCR は実装通り `'llm_failure'` / `'ocr_failure'` を assert。spec の3経路はそのまま通せた。乖離なし。

9. **CreateNote / SaveNote — `content_too_large`**
   - spec: `BusinessRuleError('content_too_large')`
   - 実装: `assembleFromInputs` 内で `HtmlSanitizer.sanitize` を最初に呼ぶため、`ContentHtml.create` の `ByteSize` 検査が sanitizer 側で発生する。sanitizer は外側で `try / catch` し `SystemError(DataIntegrityError)` にラップして再 throw する（`htmlSanitizer.ts:307`）。したがって usecase は `SystemError` を投げる。
   - 本 Issue の扱い: `createNote.integration.test.ts` のテストは `BusinessRuleError` でも `SystemError(cause=BusinessRuleError(ContentTooLarge))` でも受理する形に書き、テスト名を「translates oversized content into a system-level failure via the sanitizer」と平叙化した。Phase 4 で sanitizer のエラーラップ方針を見直すか、spec 文言を「SystemError 経由」に揃えるかを別 Issue で判断。

10. **RestoreNote — `slug_conflict`**
    - spec: 「復元先 slug 衝突 → BusinessRuleError('slug_conflict')」
    - 実装の DB スキーマ: `uniqueIndex("uniq_notes_owner_slug").on(ownerId, slug)` は active / trashed の status を区別しない。したがって「trashed と active の同一 owner・同一 slug が共存する」フィクスチャがそもそも作れず、テストから到達不能。
    - 本 Issue の扱い: `trashLifecycle.integration.test.ts` で `it.todo` として残し、Phase 4 で「unique index に `WHERE status='active'` を付ける／RestoreNote の事前検証を追加する」のいずれかを別 Issue で判断。

11. **DuplicateNote — trashed ノートの拒否**
    - spec: 「trashed → 動作対象外（仕様: 拒否）」
    - 実装: `duplicateNote.ts` には trashed status の事前チェックが無い。実体としては trashed ノートでも複製が成功してしまう。
    - 本 Issue の扱い: `duplicateNote.integration.test.ts` で `it.todo` として残し、Phase 4 で実装側に検証を追加するか spec 文言を緩和するかを判断する別 Issue を起票。

12. **MoveNote — 移動先ディレクトリ不在**
    - spec: 「移動先存在せず → ResourceNotFoundError」
    - 実装: `moveNote.ts:48` で `ForbiddenError("DIRECTORY_NOT_FOUND")` を投げる（NotFoundError ではなく ForbiddenError として扱う）。Authorization predicate の一部として「アクセス可能なディレクトリのみ存在を確認できる」設計判断。
    - 本 Issue の扱い: テストは `isForbiddenError + code === "DIRECTORY_NOT_FOUND"` で検証。Phase 4 で spec 文言を実装に合わせる別 Issue を起票。

13. **MoveNote / GetNoteDetail / GetBacklinks — `AuthorizationError` 表記**
    - spec: `AuthorizationError`
    - 実装: アプリケーション層には `AuthorizationError` クラスが存在せず `ForbiddenError` がその役割を担う（`errors/index.ts` 参照）。
    - 本 Issue の扱い: テストは `isForbiddenError + code === "NOTE_FORBIDDEN"` / `"DIRECTORY_FORBIDDEN"` で検証。Phase 4 で spec 文言を `ForbiddenError` に揃える別 Issue を起票（既に Issue #5 の他の場所と同一案件）。

14. **UploadFile — 日次クォータ超過のエラーコードに enum が無い**
    - spec: 「日次容量上限超過 → BusinessRuleError」（具体的なコードは指定なし）
    - 実装: `uploadFile.ts` が `IngestionErrorCode` を経由せず素の文字列 `"daily_upload_quota_exceeded"` で `BusinessRuleError` を投げる。他の ingestion 失敗は `IngestionErrorCode.XXX` に揃っているのにこの 1 ケースだけ enum エントリが欠落しており、テストもリテラル比較を強いられる。
    - 本 Issue の扱い: `ingestion.integration.test.ts:382` でリテラル `"daily_upload_quota_exceeded"` をそのまま assert し、コメントで実装側リテラルと一致させる必要を明記。Phase 4 で `IngestionErrorCode.DailyUploadQuotaExceeded` を追加し usecase と spec を一致させる別 Issue を起票。

15. **PurgeOrphans — R2 削除失敗時の挙動が spec と乖離**
    - spec: 「R2 delete 失敗 → 失敗としてカウントし、次のスイープで再試行」
    - 実装: 1st UoW で `orphan → deleting` をコミットしてから `storage.delete` を呼ぶため、失敗時は `deleting` 状態で残る。次のスイープは `status === 'orphan'` でフィルタするため再試行されず、stuck する。
    - 本 Issue の扱い: `purgeOrphans.integration.test.ts:163-186` で `status === "deleting"` を assert し、コメントで spec 乖離を明示。Phase 4 で「`status === 'deleting'` も再試行対象に含める」か「2 段階コミットを 1 トランザクションに統合する」かを判断する別 Issue を起票。

16. **DeleteNote — outbox イベント名 `note.trashed` vs spec `note.deleted`**
    - spec: 「DeleteNote → note.deleted」
    - 実装: 物理削除ではなく status 遷移のため `note.trashed` を発火（`NoteEvents.trashed`）。
    - 本 Issue の扱い: `trashLifecycle.integration.test.ts:108` で `eventType === "note.trashed"` を pin。Phase 4 で spec 文言を `note.trashed` に揃える別 Issue を起票（実装側のイベント名のほうがドメイン意味的に正確）。

17. **RestoreNote — outbox イベント名 `note.restored` vs spec `note.saved`**
    - spec: 「RestoreNote → note.saved」
    - 実装: `NoteEvents.restored` を発火。
    - 本 Issue の扱い: `trashLifecycle.integration.test.ts:161` で `eventType === "note.restored"` を pin。Phase 4 で spec 文言を `note.restored` に揃える別 Issue を起票（#16 と同一の方向性）。

18. **ListNotesByOwner — keyword フィルタは Search ドメインに委譲**
    - spec: 「keyword 指定 → Search ドメインへ委譲」を ListNotesByOwner のテスト表に記載
    - 実装: `listNotesByOwner` は `keyword` パラメータを受け取らない。フルテキスト検索は別ユースケース `searchOwnNotes`（Search ドメイン）が担う。
    - 本 Issue の扱い: `listNotesByOwner.integration.test.ts:343` で `it.todo` として明示的に残し、コメントで委譲先を案内。Phase 4 で spec/testcases の当該行を `searchOwnNotes` の表に移動する別 Issue を起票。

### Consequences
- 良い点: テストが実装と乖離する事態を回避、乖離が後追いで可視化される
- トレードオフ: Phase 4 で起票する Issue が複数になる可能性。ただし spec-sync の本来の使い方（差分を Issue 化）と整合している

---

## ADR-005: spec カバレッジ外の補助テスト追加判断

### Status
Proposed

### Context
ADR-003 で「spec 表の全ケースを 1:1 で実装する」と定めたが、レビュー時に「spec に記載がないが実装ガードとして欠かせない 1 ケース」が見つかった。スコープ厳守なら削除すべきだが、削除すると重大なリグレッション（usecase 本体が常時 noop になる等）が検知できなくなる懸念がある。判断基準と例外を明文化しておく。

### Decision
原則 ADR-003 に従い spec 外テストは追加しない。例外として **「ユースケース本体の happy path が一切検証されない」状態になる場合に限り、最小限の guard テスト 1 件を追加する**。追加したテストには `// ADR-005:` プレフィックスのコメントで判断根拠を明記する。

#### 列挙

1. **ReleaseEditLock — happy path guard 追加**
   - spec/testcases の表は「他人ロックの Release → ReleaseNotOwner」1 行のみ。Release 本体が正常に動くかは検証されない。
   - 実装が常時 noop を返すバグが入っても spec ベーステストでは検知不能。
   - 本 Issue の扱い: `editLock.integration.test.ts` に「lock holder が release すると editLockUserId / acquiredAt / expiresAt が null になる」guard テストを 1 件追加。spec 表には反映しない（テスト側で ADR-005 を参照）。

2. **DownloadMedia — NotFoundError 補助テストの扱い**
   - レビュー時に検討したが、「spec/testcases に記載がないケースは追加しない」原則（plan「含まれないもの」）に基づき削除。Phase 4 で MediaNotFound に該当する spec 行を追加するか、当該補助テストを再導入するかを別 Issue で判断する。

### Consequences
- 良い点: 「spec 表 = テスト一覧」の原則を維持しつつ、スコープ厳守がもたらすリグレッション盲点を最小限のテスト追加で塞げる
- トレードオフ: 「最小限」の判断が属人化しうる。判断の都度 ADR-005 に列挙して透明性を確保する
