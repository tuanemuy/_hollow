# Progress / Open Risks — Issue #36

実装は完了。受入条件・ADR の核は全て満たし、テストは 1391+ unit / 326+ integration / 13 manual すべて PASS。
以下は本 PR では取り込まなかった「後続検討候補」のリスクと未対応項目。

## 既知のリスク（受容、進捗ドキュメントとして記録）

### R-1: `allowSpaces: true` × `char: "[["` で popup 開きっぱなしのときの query 貪欲一致

- **現象**: 補完ポップアップを開いた直後に `]]` を打たずにスペース込みで本文を書き続けると、`@tiptap/suggestion` の正規表現が行末まで query を伸ばしてしまい、無関係な検索が発火する可能性
- **緩和**: 100ms debounce + AbortController で実害は薄い。ユーザーが Esc や `]]` で抜けるのが通常運用
- **次のアクション**: 別 Issue で「`]]` トリガで明示的に close」「stop pattern を入れる」等の UX 改善を検討
- **発見**: PR #64 レビュー (Frontend W-F4)

### R-2: `allowedPrefixes` デフォルト = `[' ']` のため `foo[[bar` で起動しない

- **現象**: 単語の途中で `[[` を打っても popup が起動しない（行頭・空白後のみ）
- **判断**: マニュアルテストではこのケースは検証していない。UX として「中間挿入を期待する」想定なら `allowedPrefixes: null` に変更
- **次のアクション**: 別 Issue で UX 方針を決めてから対応
- **発見**: PR #64 レビュー (Frontend W-F5)

### R-3: ASCII 外 case-folding 不整合

- **現象**: JS の `String.prototype.toLowerCase()` は Unicode 全体を lowercase 化するが、SQLite の `lower(title)` は ASCII のみ。トルコ語の I 問題（`İstanbul` を `İST` 検索）や独語 ß で silent miss の可能性
- **判断**: 主用途は日本語＋ASCII 英字なので実用上問題なし。`title_normalized` カラム追加は本 Issue スコープ外
- **次のアクション**: 該当言語のユーザーから報告があれば別 Issue で `title_normalized` 列追加検討
- **発見**: PR #64 レビュー (Adapter W-A2)

### R-4: `tagRepository.findByOwner` 既存挙動の網羅的回帰テスト不足

- **現象**: 本 PR で SQL を `like()` → raw `sql ... ESCAPE` に変更したが、変更前を検証する integration test は新規追加分（ESCAPE regression 1 ケース）のみ。「query なし」「並び順」「sort=noteCount + query」等の組合せは unverified
- **判断**: 手動・本番では問題なし（全 323 integration test pass）が、変更レビュー観点で補強の余地あり
- **次のアクション**: 別 PR で `findByOwner` の基本シナリオ網羅テストを追加（本 PR スコープ外）
- **発見**: PR #64 レビュー (Adapter W-A3)

### R-5: マニュアルテスト中に判明した別系統の環境課題（Issue #36 とは別軸）

`.issue/36/manual-test/seed-data.md` および完了報告で記録された 3 件:

1. **instance_settings.singleton の legacy limits_json shape**: 初期化時に `DataIntegrityError`。`DELETE FROM instance_settings` で workaround
2. **検証メールリンクの 404**: `/auth/verify` → 実フロントエンド `/verify-email` の不整合
3. **`pnpm dev` で outbox relay/consumer が走らない**: `note.content_updated` → `resolved_note_id` 解決が pending。本 PR の機能（バックリンク抽出）は DB 直接検証で確認済み

これらは Phase 4 で別 Issue 起票候補（Issue #36 の意図外なので切り出すほうが自然）。

## Test coverage の補強候補（本 PR 内で実施した分は除外）

- `wysiwygSanitizerIntegration.test.ts` への Mention 非漏洩 regression test（getHTML 出力に `data-type="mention"` が出ないことを直接検証）— ADR-001 の核なので別 PR で追加検討
- `internalLinkSuggestPopup.test.tsx` の onClick negative test（`onMouseDown` ではなく `click` を投げて `onSelect` が呼ばれないことを確認）— ADR-003 の罠の対偶
- `INTERNAL_LINK_PATTERN` / `HASHTAG_PATTERN` の canonical 定義との drift 検知（テスト内ローカル再宣言を canonical export 化）

## 本 PR で取り込まなかったレビュー指摘の理由

| Review ID | 内容 | 取り込まなかった理由 |
|-----------|------|---------------------|
| T-W-001 | popup test の position assertion がスコープ外 | レイアウト変更時の brittleness は実害低、describe 分離は overkill |
| T-W-003 | canonical pattern のドリフト検知 | テスト方針の見直しが必要、別 PR で評価 |
| T-W-007 | tag case-insensitive の前提強依存テスト | `nameNormalized` は domain VO で固定、優先度低 |
| F-W-001/W-002 | UX 改善（allowSpaces / allowedPrefixes） | UX 判断が必要、別 Issue で評価（R-1/R-2） |

## 取り込んだレビュー指摘（本 PR で対応）

`.issue/36/review/review-002.md` 参照。
