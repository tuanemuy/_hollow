# ADR — Issue #457: 認証経路の rate limit / lockout 検討（#210 F-2）

## ADR-001: レート制御のレイヤー選定 — CF エッジ第一次、application 層は追加しない

### Status
Proposed

### Context

認証経路（`logIn` / `loginFn` / `authGuard`）に rate limit / lockout は不在（#210 investigation / PR #454 で確定）。守りたいのは (a) scrypt (`N=2^16`, 1 試行 50–100ms CPU) が毎ログインでフル実行される CPU コスト、(b) 総当たり耐性。選択肢：

- **A. CF エッジ**（WAF Rate Limiting Rules + 常時 DDoS 保護 + 任意 Turnstile）。Reference runtime は Cloudflare Workers。エッジは Worker 起動**前**に効く。
- **B. application 層**（`PromptPreviewRateLimiter` 同型の D1 バックト・ポート + アダプター）。Worker 起動後に判定。
- **C. 中間**（エッジを主、app 層に最小限）。

制約：KV / Durable Object バインディングは無く、app 層のステートは実質 D1 のみ。app は現状クライアント IP を取得していない（`loginFn` は `ipAddress: null`）。app 層 429 を返す `tooManyRequests` エラー kind は存在せず、追加は SerializedError union 全レイヤーに波及する。既存方針として未認証 POST エンドポイントの頻度制御はエッジに委譲する前例がある（`.issue/647/adr.md` ADR-006）。

### Decision

**A を採用（エッジ第一次）。application 層にはレート制御 / lockout を追加しない。** app 層フォールバック設計（B の per-IP 限定版）は「エッジ Rate Limiting Rules がプランで使えない場合の待避策」として記録のみ、本 Issue では実装しない。

理由：
1. 守りたいのは scrypt CPU と volumetric。エッジは計算前に shed するため構造上優位。app 層は判定のため attempt ごとに D1 書き込みが hot path に載り、CPU-DoS 保護としては本質的に劣後。
2. オンライン総当たりは scrypt（かつ未存在 email は scrypt スキップ）が既に強律速。残る現実的脅威は volumetric フラッド＝エッジ / DDoS 領域。
3. app 層 429 は union 全体への新 kind 追加 + D1 テーブル + migration + ポート + アダプター + DI + CF-Connecting-IP 配線を要し、エッジ設定（コード変更ゼロ）に対しコスト過大。
4. 「頻度制御はエッジに委譲」という既存アーキテクチャ方針（ADR-006）と一貫。

### Consequences

- 良い点：コード変更ゼロ。Worker CPU / D1 write を消費せず遮断。既存の列挙耐性・エラー契約を一切触らない。既存方針と一貫。
- トレードオフ：CF Rate Limiting Rules の可用性 / クォータがプラン依存 → 使えない場合は待避策（B の per-IP 版）が必要。分散 botnet 総当たりは per-IP ルールを回避する（DDoS / Turnstile 領域で対処、app 単独では解けない）。運用リソース（WAF ルール）はリポジトリ管理外のため、staging / production 両ゾーンへの適用は運用手順として担保する必要がある。

---

## ADR-002: レート制御の粒度 — per-IP を採用、per-account lockout は不採用

### Status
Proposed

### Context

レート制御を入れるとして粒度の候補は IP / email / account。email・account キーの lockout は分散 IP のオンライン総当たりに対応できる一方、認証応答の列挙耐性（現状 `invalid_credentials` へ集約）と干渉しうる。

### Decision

**粒度は per-IP（エッジのカウントキー = クライアント IP）。per-account / per-email の lockout は採用しない。**

理由：
1. **存在オラクル回避**：per-account lockout は、lockout 応答がアカウントごとに差（例 429 vs 401）を持つとアカウント存在を漏らす。未存在 email でも同一挙動を保証する追加実装が要る。per-IP はアカウント identity に一切触れず列挙面ゼロ。
2. **self-DoS 回避**：攻撃者が victim の email を連打して意図的にロックアウトできる。lockout は rate-limit window より副作用が持続的。
3. per-IP はエッジがネイティブに CF-Connecting-IP を把握するため詐称困難かつ実装不要。

### Consequences

- 良い点：現状の `invalid_credentials` 集約による列挙耐性を完全に維持。self-DoS 面が無い。
- トレードオフ：分散 IP からの単一アカウント総当たりには per-IP は弱い。ただしこれは scrypt の律速 + DDoS 保護 + 必要時 Turnstile で受け、per-account lockout の副作用を負うより妥当と判断。将来フォールバックを実装する場合も同じ理由でキーは IP に限定する。

---
