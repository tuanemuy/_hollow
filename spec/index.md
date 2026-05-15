# Hollow 設計インデックス

テキスト管理アプリ「Hollow」の設計ドキュメント全体の入口。

## 進捗

- [x] Phase 0: 準備（idea.md 確認 / MVP 範囲確定）
- [x] Phase 1: シナリオ設計
- [x] Phase 2: ページ設計
- [x] Phase 3: 技術設計
  - [x] ドメイン設計
  - [x] ユースケース設計
  - [x] DB 設計
  - [x] テストケース定義
  - [x] クロスフェーズ検証

## 成果物

### アイデア
- [初期アイデア](./idea.md)

### シナリオ（Phase 1）
- [一覧](./scenario/index.md)
- カテゴリ別: [account](./scenario/account.md) / [ingest](./scenario/ingest.md) / [authoring](./scenario/authoring.md) / [organize](./scenario/organize.md) / [browse](./scenario/browse.md) / [publish](./scenario/publish.md) / [export](./scenario/export.md) / [trash](./scenario/trash.md) / [admin](./scenario/admin.md)
- レビュー: [001](./scenario/review/001.md) / [002](./scenario/review/002.md)

### ページ設計（Phase 2）
- [画面一覧](./pages/index.md)
- レビュー: [001](./pages/review/001.md) / [002](./pages/review/002.md)

### ドメイン設計（Phase 3.1）
- [ドメイン一覧](./domains/index.md)
- ドメイン別: [identity](./domains/identity.md) / [directory](./domains/directory.md) / [note](./domains/note.md) / [tag](./domains/tag.md) / [publication](./domains/publication.md) / [ingestion](./domains/ingestion.md) / [media](./domains/media.md) / [export](./domains/export.md) / [search](./domains/search.md) / [view](./domains/view.md) / [adminSettings](./domains/adminSettings.md)
- レビュー: [001](./domains/review/001.md) / [002](./domains/review/002.md) / [003](./domains/review/003.md)

### ユースケース設計（Phase 3.2）
- [共通DTO/エラー](./usecases/index.md)
- ドメイン別: [identity](./usecases/identity.md) / [directory](./usecases/directory.md) / [note](./usecases/note.md) / [tag](./usecases/tag.md) / [publication](./usecases/publication.md) / [ingestion](./usecases/ingestion.md) / [media](./usecases/media.md) / [export](./usecases/export.md) / [search](./usecases/search.md) / [view](./usecases/view.md) / [adminSettings](./usecases/adminSettings.md)
- レビュー: [001](./usecases/review/001.md) / [002](./usecases/review/002.md)

### DB設計（Phase 3.3）
- [スキーマ一覧](./database/index.md)
- レビュー: [001](./database/review/001.md) / [002](./database/review/002.md)

### テストケース（Phase 3.4）
- ドメイン別: [identity](./testcases/identity/index.md) / [directory](./testcases/directory/index.md) / [note](./testcases/note/index.md) / [tag](./testcases/tag/index.md) / [publication](./testcases/publication/index.md) / [ingestion](./testcases/ingestion/index.md) / [media](./testcases/media/index.md) / [export](./testcases/export/index.md) / [search](./testcases/search/index.md) / [view](./testcases/view/index.md) / [adminSettings](./testcases/adminSettings/index.md)

### クロスフェーズ検証（Phase 3.5）
- [001](./review/cross-phase/001.md) / [002](./review/cross-phase/002.md)

### ADR
- [001 マルチユーザー・オープン登録](./adr/001-multi-user-open-registration.md)
- [002 公開機能は同一インスタンス内](./adr/002-publishing-within-same-instance.md)
- [003 メタデータは FrontMatter / タグ / 内部リンク併用](./adr/003-metadata-formats.md)
- [004 LLM プロバイダは単一固定](./adr/004-llm-provider-single-fixed.md)
- [005 ドメイン境界の切り方](./adr/005-domain-boundaries.md)
