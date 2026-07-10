# テスト実行サマリー

**実行日時**: 2026-07-10
**テストソース**: .issue/819/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`, vite/cloudflare）
**セッション**: agent-browser（`__Host-session` cookie を CDP 注入）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | グローバル進捗バーの DOM 常設＋decorative 契約 | 構造 | PASS | 全ルートで `z-[110]` fixed バー常設・aria-hidden・role/aria-live なし。※重複は既存挙動（analysis 参照） |
| TC-002 | 編集ルートが RSC 再構成後も正常描画（AC-2 機能面） | 正常系 | PASS | `/notes/$id/edit` でエディタ描画・title「ノートを編集」 |
| TC-003 | 非存在ノート編集→インライン not-found（AC-7） | 異常系 | PASS | `role="alert"`「ノートが見つかりません」＋`_app`シェル保持（フルページエラーではない） |
| TC-004 | 一覧→詳細→編集の機能チェーン（AC-4 機能面） | 正常系 | PASS | 各ルート正常遷移・詳細に編集リンク・進捗バー全ルート常設 |
| TC-005 | AC-1/AC-3/AC-6（進捗バー出現200ms・モバイル・reduced-motion） | タイミング/視覚 | N/A（自動検証対象外） | agent-browser は networkidle 後 snapshot のため遷移中の一過的表示を捕捉できない。ユニットテスト（クラス契約）＋testing.md 手動手順で担保 |

**合計**: 自動検証 4 件（PASS: 4 / FAIL: 0）＋ タイミング系 1 件は手動手順/ユニットに委譲

## 主要な発見（非ブロッカー）

- **RootDocument 二重描画（既存挙動・スコープ外）**: `/notes` では進捗バーが 2 個描画されるが、これは head の `<meta charset>`/`<meta viewport>` も同じく 2 個になる既存のフレームワーク挙動に完全連動（バー数＝charset数＝viewport数）。進捗バーは装飾（aria-hidden・pointer-events-none・完全重複）のため影響ゼロ。詳細は `analysis.md`。
