# 実装進捗

## Phase 2: ドメイン
- [x] identity
- [x] adminSettings
- [x] directory
- [x] tag
- [x] media
- [x] note
- [x] publication
- [x] view
- [x] search
- [x] ingestion
- [x] export

## Phase 3: アダプター
- [x] D1 schema 拡張
- [x] identity repositories / CredentialStore / SessionService / VerificationChallenge / SetupTokenVerifier / EmailSender
- [x] directory repository
- [x] note repository
- [x] tag repository
- [x] publication repository
- [x] ingestion repository / LLM adapter
- [x] media repository / R2 adapter
- [x] export repository
- [x] search repository
- [x] view repository
- [x] adminSettings repository
- [x] DI / UoW 統合配線

## Phase 4: ユースケース
- [x] 共通 DTO モジュール
- [x] identity
- [x] directory
- [x] note
- [x] tag
- [x] publication
- [x] ingestion
- [x] media
- [x] export
- [x] search
- [x] view
- [x] adminSettings
- [x] DI / test helpers 統合

## Phase 5: テスト
- [x] identity
- [x] directory
- [x] note
- [x] tag
- [x] publication
- [x] ingestion
- [x] media
- [x] export
- [x] search
- [x] view
- [x] adminSettings

## Phase 6: フロントエンド
- [x] P01-P07 (auth / onboarding)
- [x] P10-P19 (ノート編集・一覧)
- [x] P20-P24 (公開・エクスポート・設定)
- [x] P30-P34 (公開ビュー)
- [x] P40-P46 (管理)

## Phase 7-9: 品質保証
- [x] 統合品質ゲート (typecheck/lint/test) — 1162 tests PASS
- [x] ブラウザ検証（spec/manual-tests/ 未存在のためスキップ）
- [x] implement-audit — TODO/FIXME ゼロ、MVP 未対応機能は明示的 BusinessRuleError 実装
