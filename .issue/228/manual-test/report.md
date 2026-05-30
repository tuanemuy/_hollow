# ブラウザ検証レポート — Issue #228: アップロード前カスタムプロンプト入力

**実行日**: 2026-05-30
**ツール**: agent-browser 0.27.0
**サーバー**: http://localhost:3000（`pnpm dev`）
**結果**: 5/5 PASS（FAIL 0、起票 Issue 0）

## 概要
アップロードモーダルに追加した「詳細オプション（カスタムプロンプト）」アコーディオンと、
そのジョブ単位の structure / metadata プロンプト上書きが、ログイン〜アップロード〜
LLM 処理（dev では同期実行）〜プレビューの一連の動線で期待どおり機能することを確認した。

## テスト環境の準備
- ローカル D1 にマイグレーション 0012（override 2列）を適用。
- メール/パスワード認証のテストユーザーを D1 へ直接シード。
  - 当初 UUIDv4 形式の id でシードしたところ `idGenerator.validate`（UUIDv7 必須）に弾かれ
    `DataIntegrityError: Stored user has malformed id` でログイン失敗。
    → id を UUIDv7 形式（`0190a1b2-c3d4-7abc-89ab-...`）に貼り替えて解消。実装バグではなくシード手順の問題。
- ingestion 非同期処理は `pnpm dev` の InlineRelayTrigger で同期実行されるため、
  別途キュー consumer ワーカーの起動は不要。ADMIN_LLM_API_KEY は実 Anthropic キー。

## 結果詳細
results/summary.md および results/ 配下、screenshots/ を参照。

| TC | 結果 | 主要エビデンス |
|----|------|---------------|
| TC-1 | PASS | screenshots/tc-001/step-03-expanded.png（2 textarea 展開） |
| TC-2 | PASS | screenshots/tc-002/step-02-preview.png（タグ/本文にマーカー反映） |
| TC-3 | PASS | screenshots/tc-003/step-01-preview.png（フォールバック・マーカー無し） |
| TC-4 | PASS | screenshots/tc-005/step-03-queue.png（2件とも BATCH_MARKER_999） |
| Edge-1 | PASS | screenshots/tc-004/step-02-result.png（過大入力でエラー） |

## 完了条件の充足
- [x] アップロード時に任意でプロンプトを上書きできる UI（TC-1）
- [x] 上書きはそのジョブ単位のみ（TC-2/TC-4 で適用、ユーザーデフォルト非永続は設計上）
- [x] 空入力ならフォールバック（TC-3）

## 起票した Issue
なし（全 PASS）
