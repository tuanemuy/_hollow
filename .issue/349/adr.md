# ADR — Issue #349: パスワード最小長の不整合

## ADR-001: PASSWORD_MAX_LENGTH も transport=256 → domain=128 に揃える

### Status
Accepted

### Context
Issue #349 の本文は `PASSWORD_MIN_LENGTH`（transport=8 / domain=12）の不整合を対象としているが、調査の過程で同じ定数ブロック（`app/components/auth/schema.ts`）内の `PASSWORD_MAX_LENGTH` も transport=256 / domain（`app/core/domain/identity/valueObject.ts`）=128 で食い違っていることが判明した。

これは min の不整合と**完全に同種のバグクラス**である: 129〜256 文字のパスワードは Zod transport boundary（`max(256)`）を通過するが、`RawPassword.create` で `BusinessRuleError("password_too_long")` が throw され、field 直下ではなく summary 領域にエラーが出る。Issue の「あるべき姿」（ドメイン値オブジェクトが真実のソース、transport で先に弾く）原則は max にも等しく当てはまる。

選択肢:
- (A) min のみ揃え、max は別 Issue として起票
- (B) min と max を同じ PR で揃える

### Decision
(B) を採用。理由:
- 同じファイル・同じ定数ブロック・同じバグクラスであり、issue-implement Phase 4 の原則「同じファイル・同じ機能・同じ動線の中で気づいた問題は原則その場で修正する」に該当する。
- 別 Issue に切り出すほうが不自然（1 行の定数変更、追加の設計判断なし、波及範囲は同一）。
- Issue の意図（transport と domain の食い違い解消）をより完全に満たす。

### Consequences
- 良い点: パスワード長の transport/domain 不整合がこの PR で完全に解消する。129〜256 文字入力も field 直下エラーになり UX が一貫する。
- トレードオフ: Issue 本文の「想定対応」には min のみ記載されているため、変更が本文の文面より広い。PR 説明で明示し、レビュアーが分離を望めば 1 行で revert 可能とする。
- 既存ユーザーへの影響なし: domain max=128 を超える有効パスワードは存在し得ないため、`loginSchema`（max 参照）を 128 に下げても既存ログインは壊れない。
