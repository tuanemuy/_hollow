# レビュー 001 — Domain 層（Issue #580 / PR #782）

対象: `app/core/domain/tag/mergeJob/`（`entity.ts` / `valueObject.ts` / `events.ts` / `errorCode.ts` / `__tests__/`）および `app/core/domain/tag/ports/tagMergeJobRepository.ts`

参照: `.issue/580/plan.md`（AC-1〜AC-8・設計セクション）、`.issue/580/adr.md`（ADR-003 判別共用体 / ADR-006 冪等再開 S-002・S-003 / ADR-007・ADR-008）、規範 `app/core/domain/export/entity.ts`

## Domain

### Blockers

なし。

判別共用体エンティティ・進捗 VO・所有者検証・リハイドレートは設計（ADR-003 / ADR-006）と整合し、型レベルで不正状態を排除できている。ブロッカー級の欠陥は検出されなかった。

### Warnings

- **[W-001]** `recordProgress` は `processed` の単調増加（前進のみ）を強制しない
  - 場所: `app/core/domain/tag/mergeJob/entity.ts:125-139`（`recordProgress`）、`app/core/domain/tag/mergeJob/valueObject.ts:63-86`（`TagMergeProgress.create`）
  - 理由: ADR-006 S-002 と plan（L73 / L94 / L162 / L243 / L250）は「再入時に既存 `total` を保持し `processed` を**前進のみ**させバー逆行を防ぐ」ことを進捗セマンティクスの核に据えている。実装は `total` 保持（`job.progress.total` の再利用）までは正しく満たすが、`processed` の後退（`new < 現在の processed`）は `TagMergeProgress.create` の不変条件 `0 ≤ processed ≤ total` を通過してしまう。つまり「前進のみ」はドメインの型/VO では担保されず、runner の `processed = total − 残件数` という算出ロジック（残件が単調減少する性質）に**暗黙依存**している。CLAUDE.md「make illegal states unrepresentable」の観点では、バー逆行という設計上禁止された遷移が依然 representable で、runner にバグが入れば検知されずに退行する。
  - 提案: `recordProgress` で `if (processed < job.progress.total の現 processed) throw BusinessRuleError(InvalidProgress, ...)` を加えるか、`TagMergeProgress` に「前進」専用の遷移メソッド（`advanceTo(prev, next)`）を設けて単調性を型/実行時で固定する。export の `recordProgress` も同じく未強制だが、export の determinate バーは実質デッドコード（ADR-004 / plan S-002）で逆行が観測されない一方、本 Issue は**初の実 n/total 駆動**であり、ここが唯一「前進のみ」が体感に直結する箇所。最も価値が高い不変条件なのでドメインに引き上げる候補。少なくともテストで「逆行入力を拒否（または無視）する」契約を明文化したい（現 `entity.test.ts` は逆行ケース未カバー）。

### Notes

- **[N-001]** 状態遷移の型ナローイングが ADR-006 S-002 の「Pending 専用 / Processing 再入」を**コンパイル時に**強制できている（良い点・本 PR の白眉）
  - `startProcessing(job: PendingTagMergeJob, ...)` は引数が Pending 限定（`entity.ts:107-123`）、`recordProgress` / `complete` は `ProcessingTagMergeJob` 限定、`fail` は `Pending | Processing` 限定。これにより「crash-resume の processing で誤って `startProcessing` を呼び total を再 seed する」事故が型エラーになり、ADR-006 S-002 の no-reseed が runner の規律ではなく型で担保される。export 規範と同等以上に厳格で、設計意図と完全一致。`entity.test.ts` も pending-only / 再入の挙動を assert 済み。

- **[N-002]** `TagMergeProgress` の不変条件は妥当（`0 ≤ processed ≤ total`・整数・非負）
  - `valueObject.ts:71-85` で `Number.isInteger` + 非負 + `processed > total` 拒否を網羅。`initial()` = 0/0。VO テスト（`valueObject.test.ts:42-66`）が境界（`processed > total`・負値・非整数）を押さえている。W-001（逆行）以外に穴はない。

- **[N-003]** 遷移メソッドが `WithEventDrafts` でなく**裸エンティティ**を返す export からの逸脱は妥当
  - export は全遷移で `WithEventDrafts`（`started` / `completed` / `failed` 等を activity-log 投影向けに emit）。本 PR は `create` のみ `tag.merge.requested` を emit し、`startProcessing` / `recordProgress` / `complete` / `fail` は裸の entity を返す（`entity.ts:107-187`）。ADR-003/ADR-008 の設計（payload は `jobId` のみ・runner が再読込・タグ統合に活動ログ投影は不要）と一致し、不要なイベント定型を持ち込まない縮約として合理的。逸脱は意図的かつ最小。

- **[N-004]** `tag.merge.requested` のイベント表現はドメイン純粋性を保っている
  - `events.ts`: `EventDraft`（`EventId` 無し・`occurredAt` / `aggregateId=jobId` を持つ draft）を返し、`EventId` 付与は application 層に委ねる。payload は `{ jobId }` のみで runner が source/target/progress を再読込（ADR-003）。ドメインに `IdGenerator` / ambient time が漏れていない。`now: Date` は全 API で外部注入。I/O・フレームワーク依存なし。クリーン。

- **[N-005]** `reconstruct` のリハイドレート整合は export 規範どおり堅牢
  - `entity.ts:333-372` が `try/catch → RehydrationError` でラップ（fresh-input の `BusinessRuleError`=4xx と storage 破損=`SystemError(DataIntegrityError)` を分離する設計コメントも踏襲）。`reconstructByStatus`（`entity.ts:191-265`）は状態別に「pending/processing は error/completion フィールド禁止」「completed は `completedAt` 必須・error 禁止」「failed は `errorCode`+`errorReason`+`completedAt` 必須」を検査。`affectedNoteIds` は pending/processing で強制 null。`completedAt` 欠落の completed 行を弾くテストあり（`entity.test.ts`）。opaque な `ownerId`/`TagId`/`NoteId` を `as` ブランドで信頼し adapter 側 re-validate に委ねる方針も export と同形。

- **[N-006]** `assertOwnedBy` の所有者検証は IDOR ガードとして正しい
  - `entity.ts:174-181` で `job.ownerId !== userId`（branded string の値比較）を `Unauthorized` で弾く。AC-8 / plan L140・L219 の「`getTagMergeJob` の IDOR 防止」要件に対応し、`entity.test.ts` が owner 一致/不一致を両方 assert。

- **[N-007]** エラーコード命名規約は遵守、かつ自動検査のカバレッジに正しく取り込まれている
  - `errorCode.ts`: 全 value が `lower_snake_case`（`tag_merge_job_*`）、key が `PascalCase`。`BusinessRuleError(TagMergeJobErrorCode.X, ...)` の第1引数に定数を渡す形（CLAUDE.md「value は文言と verbatim 一致」を満たす）。ADR-007 #2 のとおり `errorCodeNaming.test.ts` の glob に `../*/*/errorCode.ts`（深さ2）が追加され、`EXPECTED_ERROR_CODE_NAMES` に `TagMergeJobErrorCode` が pin 留めされている（確認済み: `domain/__tests__/errorCodeNaming.test.ts`）。深さ2 集約の命名ガードが将来も効く。

- **[N-008]** リポジトリポートの最小化が ADR（P-001 / S-005）と一致
  - `ports/tagMergeJobRepository.ts` は `TransactionalRepository<TagMergeJob>`（OCC `insert/findById/save/delete`）を継承するのみで owner-scoped list を追加していない。「ダイアログが自ジョブ id を 1 件 polling」する ADR-002/ADR-004 の設計に沿い、active ジョブ列挙 API を持たないことでバナー多重性（旧 S-005）を構造的に排除。JSDoc に設計理由が明記され良い。
  - 補足: プロンプトの想定パス `mergeJob/ports/tagMergeJobRepository.ts` ではなく `tag/ports/tagMergeJobRepository.ts` に配置（タグドメイン直下のポート集約に同居）。凝集上の判断として妥当で、逸脱というより配置選択。

- **[N-009]** `complete` が `processed === total` を強制しない点は許容範囲（情報）
  - `complete`（`entity.ts:141-156`）/ `reconstructByStatus` の completed 分岐は進捗の充足（バー 100%）を検査しない。runner が complete 直前に `recordProgress(total)` を呼ぶ前提（plan L94）に依存し、忘れると completed なのにバーが満たないまま閉じうる。ただしダイアログは完了検知で即閉じるため体感影響は小さく、export も同様。W に上げず情報として記録。完了時にバーを確実に満たすなら、`complete` 内で `progress` を `processed=total` に正規化する選択肢もある。

## サマリ

ドメイン層は判別共用体・進捗 VO・所有者検証・リハイドレート・イベント純粋性・命名規約のいずれも export 規範と設計（ADR-003/006/007/008）に高い精度で整合しており、Blocker は無い。型ナローイングで ADR-006 S-002 の no-reseed をコンパイル時に固定できている点は特筆に値する。唯一、設計が核に据える「processed 前進のみ（バー逆行防止）」がドメインで強制されず runner 規律に依存している（W-001）。本 Issue が初の実 n/total 駆動である以上、この不変条件はドメインへ引き上げる価値が高い。
