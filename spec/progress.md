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
- [ ] identity
- [ ] directory
- [ ] note
- [ ] tag
- [ ] publication
- [ ] ingestion
- [ ] media
- [ ] export
- [ ] search
- [ ] view
- [ ] adminSettings

## Phase 6: フロントエンド
- [ ] P01-P07 (auth / onboarding)
- [ ] P10-P19 (ノート編集・一覧)
- [ ] P20-P24 (公開・エクスポート)
- [ ] P30-P34 (公開ビュー)
- [ ] P40-P46 (管理)

## Phase 7-9: 品質保証
- [ ] 統合品質ゲート (typecheck/lint/test)
- [ ] ブラウザ検証（条件付き）
- [ ] implement-audit
