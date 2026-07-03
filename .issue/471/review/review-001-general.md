# General Review — PR #816: Issue #471 回帰テスト追加

**PR:** #816（ブランチ `issue/471/admin-users-loader-regression-guard`、base `main`）
**対象:** `/admin/users` データ取得経路の回帰ガード追加（プロダクトコード修正なし）

---

## Review Summary

テストは **AC-2「userRepository.listAll が多様な状態の行を throw せず正しく返すことを回帰テストで固定」を適切に満たしている**。

実装計画（plan.md）との整合性、docs/test.md の integration テスト方針への準拠、assert の正確性をすべて確認した。軽微な Warning 1 件、参考情報 Notes のみ。

---

## Blockers

なし

---

## Warnings

- **[W-001] counter の reset がない**
  - 場所: `app/core/adapters/d1/__tests__/userRepository.integration.test.ts`, モジュール level の `counter` 変数（line 15）
  - 理由: describe ブロック間で `counter` が共有されるため、searchPublicByUsernamePrefix テストの消費分が listAll テストに引き継がれる。prefix 分離（0x01-0x04）により実質的には id 重複はないが、将来的なメンテナンスで counter overflow 風にはなりにくい。
  - 提案: `beforeEach` または describe ブロック手前で `counter = 0;` をリセットするか、あるいはグローバル counter の代わりに describe block local な counter を導入する（大規模な手術になるため、本 PR では不要）

---

## Notes

- **[N-001] JSDoc コメント — CLAUDE.md 方針に合致**
  - `D1UserRepository.listAll (integration, #471)` ブロックのコメント（line 268-274）は、「rehydration failure がなぜ重要か」という non-obvious な why を説明しており、デフォルト no-comment 方針の例外（why のみ）として適切。

- **[N-002] `seedListUser` ヘルパーが計画通り機能**
  - role（admin/member）、banned、deleted、emailVerified、bio、avatarMediaId、lastUsernameChangedAt を制御可能で、AC-2 の「多様な状態」をカバー。
  - prefix=0x04 により既存の seedUser（prefix=0x01）と競合しない。

- **[N-003] deriveStatus の優先順位が正確に固定**
  - テスト 1 の期待値：`["active", "pending", "suspended", "deleted", "active"]`
  - 実装（userRepository.ts line 90-95）との優先順位一致を確認：
    - deleted_at != null → "deleted" ✓
    - banned === 1 → "suspended" ✓
    - emailVerified === 0 → "pending" ✓
    - otherwise → "active" ✓

- **[N-004] 日付比較が正しい**
  - `toEqual(new Date(TZ))` により、ISO 文字列から復元した Date オブジェクトを value で比較（getTime() が同一）。
  - TZ は モジュール level の固定値（"2026-03-01T00:00:00.000Z"）なので、再現性あり。

- **[N-005] cursor の exclusive 性が正確に検証**
  - テスト 2：`userRepository.listAll({ limit: 2, cursor: second })` → `expect([third])`
  - 実装（line 286-290）の `gt(users.id, opts.cursor)` が id > cursor（exclusive）を保証。

- **[N-006] profile フィールドの null/非null マッピング**
  - テスト 1 で、admin は bio/avatarMediaId/lastUsernameChangedAt が非null、active（member）は全て null と明確に分離。
  - MediaAssetId validation（media/valueObject.ts）は non-empty string チェックのみなので AVATAR_ID は通過。

- **[N-007] nextId による id 昇順の保証**
  - `nextId(0x04)` が呼び出されるたびに counter を increment してから block を生成（line 16-20）。
  - 5 回の seedListUser 呼び出しで 5 つの異なる block が生成され、`listAll` の `orderBy(asc(users.id))` と combined で昇順が保証される。
  - テストのコメント「Ids are monotonic in creation order (nextId) and listAll orders by id asc.」（line 343）で意図が明確。

- **[N-008] rehydration error の catch が確認される**
  - toUser（line 97-132）で `User.reconstruct` を try/catch し、rehydrationError を SystemError に変換。
  - テスト 1 が「rehydration failure」なく全員を取得できることで、この エラー処理が実装されていることを間接的に guard。

- **[N-009] 命名・構造が docs/test.md に準拠**
  - ファイル名 `userRepository.integration.test.ts` ✓
  - describe 名 `D1UserRepository.listAll (integration, #471)` ✓
  - テスト内で `container.unitOfWorkProvider.run` で UoW を管理 ✓

---

## Summary

- **回帰ガード妥当性**: ✓ AC-2「throw せず正しく返す」を固定
- **正しさ**: ✓ deriveStatus 優先順位、cursor exclusive、date 比較、profile mapping すべて正確
- **flakiness**: ✓ beforeEach TRUNCATE により状態クリーンアップ（docs/test.md）
- **プロジェクト規約**: ✓ 命名・コメント・assert 形式すべて準拠

W-001 は軽微（prefix 分離により実害なし）で、本 PR merge に支障なし。
