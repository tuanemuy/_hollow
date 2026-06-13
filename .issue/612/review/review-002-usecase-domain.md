# PR #714 レビュー（ラウンド2・フルレビュー） — Use Case & Domain

対象: PR #714 / `.issue/612/plan.md` / `.issue/612/adr.md`
レビュー日: 2026-06-13
視点: Use Case & Domain（依存方向・集約境界・read-only 射影規約・port 契約・usecase 切替の正しさ）

## 受け入れ基準（Use Case / Domain 関連）の検証

- **AC-1（trashed-but-public 除外）** — 充足。`countPublicByOwner` は `innerJoin(notes, eq(notes.id, publicationStates.noteId))` + `eq(notes.status, "active")` を持ち、relay-lag の trashed-but-public 行を母集合から外す。adapter 実装（`publicationStateRepository.ts` の新 `countPublicByOwner`）と integration test「excludes a trashed-but-public row」で担保。
- **AC-2（listing total と整合）** — 充足。新メソッドの WHERE（owner + visibility=public + published_at NOT NULL + notes.status=active）が `listSortedAll`（同ファイル L255-261）の `whereClause` と完全一致。range 条件は count 側に存在せず、`listSortedAll` も range 無しなら空配列なので、デフォルト経路での厳密一致が成立。integration test「agrees with the listing total ... (AC-2)」で adapter レベルの突き合わせ済み。
- **AC-3（1000 頭打ち解消）** — 充足。COUNT クエリに limit/offset/cursor が無く、構造的に頭打ちが発生しない。usecase 側（`getPublicProfile.ts`）も旧 `{limit:1000}` 経由の `.length` を撤去し `countPublicByOwner(user.id)` に置換済み。
- **AC-4（3 呼び出し元の不変更）** — 充足。`findPublicByOwner`（adapter L197-222）は diff に現れず無改変。`listRelatedPublicNotes.ts`（L87-114, over-fetch 後 in-memory active 再フィルタ）と `deleteAccount.ts`（L60-90, keyset cursor で全 public 行 walk → private flip）はいずれも `findPublicByOwner` を使い続けており未変更。trashed-but-public 行を private に戻す deleteAccount の掃除挙動は維持される。

## Use Case & Domain

### Blockers

- **[B-001]** なし。

### Warnings

- **[W-001]** なし。

### Notes

- **[N-001]** getPublicProfile 切替の残骸チェック: 旧 `publicNotes` ローカル変数・`{ limit: 1000 }` 引数・`.length` 導出はすべて撤去され、未使用 import・未使用変数は残っていない（`getPublicProfile.ts` L40-44）。関数 JSDoc も `findPublicByOwner` 由来の旧記述から `countPublicByOwner`（active 母集合・no limit・listing total 整合）へ正しく更新済み。
- **[N-002]** port JSDoc の契約表現は十分。`countPublicByOwner`（port L87-97）は (1) `notes.status='active'` INNER JOIN による trashed-but-public 除外、(2) `findPublicByOwner.length` と異なり no-limit、(3) listing total と同一 WHERE で整合、を `{@link}` 付きで明示しており、`findPublicByOwner`（active 不問）との意味差を型ではなく契約文で正しく補完している。ADR-001 トレードオフ節の「JSDoc で使い分けを誘導」要件を満たす。
- **[N-003]** 集約境界・read-only 射影規約は維持。新メソッドの戻り値は `number` のみで、Note エンティティを publication 集約へ hydrate しない。cross-aggregate な `notes` JOIN は adapter の read-only SQL 内に閉じており、port IF の「Read-only listing queries return plain id-shaped projections so cross-aggregate joins live in ... the adapter's read-only SQL」規約（port L52-54）に沿う。count 射影は id 射影の延長として規約内。
- **[N-004]** `publicNoteCount` の型（`number`）・意味（公開カタログ件数）は不変（`GetPublicProfileOutput` L10-13 無変更）。presentation（UserPublicTop）への波及なし。値が trashed-but-public 分だけ減るのは仕様どおりの挙動変化。
- **[N-005]** 依存方向は内向きで閉じている: port IF（domain）追加 → D1 adapter 実装 → usecase 切替。`PublicationStateRepository` の実体は D1 のみ（fake 不在）で、port 追加による未実装は発生しない。adapter は `mapDbError` で driver エラーを共有契約へ翻訳しており、cross-layer catch policy（adapter→application）に整合。
- **[N-006]** AC-2 parity test が listing 側を `limit:1000` でキャップしているが、`listSortedAll` の `total` は limit 非依存の COUNT(*) なので parity 検証として正しく機能する（count の no-limit 性が listing total と独立に COUNT で数えられる事実に依存）。テスト設計上の欠陥ではない。念のための備考。
