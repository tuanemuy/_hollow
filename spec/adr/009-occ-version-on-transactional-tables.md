# ADR 009: トランザクショナルテーブルに version カラムを一般化する

## ステータス

承認済み（2026-05-16）

## コンテキスト

初期の DB 設計（[spec/database/index.md](../database/index.md)）では、楽観的ロック（OCC）用の `version` カラムは `notes` テーブルのみに記載していた。前提として、編集競合が頻繁に起こりうるのはノート本文のみで、それ以外の集約（タグ、ディレクトリ、公開設定、ビュー、管理設定など）は競合可能性が低いと判断していた。

実装に進む段階で以下が判明した:

- 公開設定（`publication_states`）やビュー（`saved_views`）も「複数タブで同じ画面を開いて両方から更新」という現実的な競合パターンがある
- 管理設定（`instance_settings`）はバックグラウンドの設定反映ジョブと管理画面の手動更新が並走しうる
- ディレクトリの depth は祖先側の移動とリネームが同時に起きると整合性が崩れる
- 各リポジトリが独自に「最新値で上書き」する世界では、`UnitOfWork` 配下での競合検知ポイントが集約ごとにバラつき、application 層が壊れた書き込みを観測する経路が複数化する

逆に「version をどこに付けるか」を集約ごとに議論し続けるのは設計コストが高く、ヒューマンエラーで漏れる懸念がある。

## 決定

**すべての書き換え可能な集約テーブルに `version INTEGER NOT NULL` を持たせ、`UPDATE ... WHERE id = ? AND version = ?` の OCC ガードを共通実装で適用する**。

対象テーブル（既存の `notes` に加える形）:

- `directories`
- `tags`
- `publication_states`
- `share_links`
- `ingestion_jobs`
- `export_jobs`
- `saved_views`
- `instance_settings`
- `user_prompt_overrides`

ドメイン側は `app/core/domain/common/version.ts` の `Version` VO を経由して `Version.next()` でインクリメントする。リポジトリ実装は `_occ_guard` パターンで競合時に `ConcurrencyConflictError` を投げる。

CLAUDE.md の方針（「アプリケーション層に OCC リトライ・デコレータは置かない」「リトライは adapter 内の transient エラー扱いに限る」）は変わらない。OCC コンフリクトはユースケースに伝播し、UI 側で「もう一度試してください」を提示する責務に留める。

参照テーブル（`users` のサブセットや `verification_tokens` のような短命行）には version を付けない。

## 結果

- spec/database/index.md の冒頭に「トランザクショナルテーブルは共通で version カラムを持つ」旨を追記済み
- 各テーブル定義表に `version` 行を追加済み
- 副次的に `share_links.updated_at` も追加（audit trail のため、`version` 並びの位置に追加）
