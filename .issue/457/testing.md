# 動作確認計画 — Issue #457: 認証経路の rate limit / lockout 検討（#210 F-2）

**Issue:** #457
**作成日:** 2026-07-11

---

## 確認環境

本 Issue の結論は「application 層にレート制御 / lockout を追加しない（CF エッジ第一次）」であり、成果物は**ドキュメントのみ**（`.issue/457/investigation.md`、`docs/runtime_cloudflare.md` への追記、`.issue/457/adr.md`）。ドメイン〜プレゼンテーションのコード変更・スキーマ変更は無い。

したがって実行環境の起動やブラウザ操作による動作確認は不要。検証は**文書レビュー**で行う。

### 検証環境の起動

不要（ランタイムに影響する変更が無いため）。文書のみの変更で、既存の `logIn` / `loginFn` / `authGuard` の挙動は一切変わらない。

### デプロイ方法

なし（ドキュメント変更のみ。ステージング / 本番への反映は不要）。

## 確認項目

### 1. 判断の文書化（レイヤー・粒度）

- **対応する受け入れ基準:** AC-1
- **目的:** ログイン試行のレート制御 / lockout を入れるべきか、入れるならどのレイヤー・粒度かの判断が根拠付きで文書化されていること。
- **手順:**
  1. `.issue/457/investigation.md` を読む。
  2. `.issue/457/adr.md` の ADR-001（レイヤー選定）・ADR-002（粒度）を読む。
- **期待結果:** 「CF エッジ第一次・app 層追加なし」「粒度は per-IP・per-account lockout 不採用」の判断が、根拠（scrypt CPU 保護・volumetric・列挙耐性・実装コスト）とともに明示されている。
- **確認ポイント:** 結論が曖昧でなく一つに定まっているか。トレードオフが省略されていないか。

### 2. CF vs application 層の切り分け

- **対応する受け入れ基準:** AC-2
- **目的:** CF 側（WAF / Rate Limiting Rules）で足りるか、application 層が必要かの切り分けが文書化されていること。
- **手順:**
  1. `.issue/457/investigation.md` の切り分け表（効くタイミング / CPU-DoS 耐性 / IP 信頼性 / 実装コスト等）を読む。
- **期待結果:** エッジは Worker 起動前に効くため scrypt CPU / volumetric に構造優位、app 層は attempt ごとの D1 write が hot path に載る、という切り分けが両論併記で示されている。

### 3. 列挙攻撃耐性との整合

- **対応する受け入れ基準:** AC-3
- **目的:** 採用判断が現状の列挙耐性（`invalid_credentials` 集約）を損なわないことが示されていること。
- **手順:**
  1. `.issue/457/investigation.md` の列挙耐性分析セクションを読む。
- **期待結果:** per-IP エッジ制御はアカウント identity に触れず列挙面ゼロを維持する、per-account lockout は存在オラクル / self-DoS で列挙耐性を後退させるため不採用、という整合分析が示されている。

### 4. 推奨 CF 設定の運用可能性

- **対応する受け入れ基準:** AC-4
- **目的:** 推奨 WAF Rate Limiting Rule が運用者に適用できる粒度で `docs/runtime_cloudflare.md` に記載されていること。
- **手順:**
  1. `docs/runtime_cloudflare.md` の認証エッジ保護セクションを読む。
- **期待結果:** カウントキー（IP = CF-Connecting-IP）、閾値の初期目安、アクション（block / managed challenge）、staging / production 両ゾーンへの適用、Rate Limiting Rules のプラン依存性、既存の §Observability のエッジ委譲方針との一貫性が記載されている。

### 5. フォールバック設計の記録と未実装の明示

- **対応する受け入れ基準:** AC-5
- **目的:** application 層フォールバック設計が既存アーキテクチャ（ポート / D1 アダプター / エラー kind）に照らして具体化され、**未実装であること**が明示されていること。
- **手順:**
  1. `.issue/457/investigation.md` および `plan.md` の「（記録のみ・未実装）application 層フォールバック設計」を読む。
- **期待結果:** `PromptPreviewRateLimiter` パターン踏襲・per-IP 限定・`tooManyRequests` kind 追加の波及コストが記録され、本 Issue では実装しないことが明記されている。

## エッジケース・異常系

コード変更が無いため実行時の異常系検証は対象外。文書上の論理的な網羅性のみを確認する:

- **分散 botnet 総当たり:** per-IP エッジルールを回避する脅威が、DDoS 保護 + 必要時 Turnstile + scrypt 律速の多層防御として整理されているか。
- **CF プランでの Rate Limiting Rules 不可用時:** フォールバック（app 層 per-IP 限定）の前提が investigation / runtime doc に明記されているか。

## 既存機能への影響確認

- **ログイン挙動:** `logIn` / `loginFn` / `authGuard` はコード変更が無いため、既存のログイン・認証挙動に影響しないことを確認する（差分がドキュメントファイルに限られることを `git diff --name-only` で確認）。
