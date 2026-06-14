# TC-admin-reverify — Issue 701 ブラウザ再検証

CSRF（APP_URL 不一致）解消後の、保存・暗号化・接続テストの再検証。

- 実行日: 2026-06-14
- 環境: dev server http://localhost:3000、admin シード済み
- セッション: agent-browser `reverify-admin`（`__Host-session=dev-admin-session-token`）
- 制約: `ADMIN_SPEECH_API_KEY` 未設定。接続テストの成功は検証不可。

## 結果サマリ

| 項目 | 判定 |
| --- | --- |
| 検証項目1 保存→DB→暗号化（AC-1） | PASS |
| 検証項目2 無効キーで接続テスト失敗（AC-1） | 判定不能（クラッシュなしは PASS、401 probe は到達不可） |

## 検証項目1: 保存 → DB → 暗号化（AC-1）

### 操作と判定

| 手順 | 操作 | 結果 | 判定 |
| --- | --- | --- | --- |
| 1 | `reverify-admin` で `/admin/speech` を開く | 認証成功（ログインへリダイレクトされず「文字起こし設定」画面表示）。初期状態は「環境変数から読み込み中」 | PASS |
| 2 | API キー欄に `sk-test-dummy-12345`、model 欄に `gpt-4o-transcribe` を入力 | 入力反映 | PASS |
| 3 | 「変更を保存」を押す | 「保存しました」表示。**403 / CSRF エラーなし**。状態が「DB に保管されたキーを使用中 (••••GgzY)」に変化 | PASS |
| 4 | 保存後の DB 確認（下記クエリ） | 期待値すべて一致 | PASS |
| 5 | 画面を再読込し API キーがマスク表示か確認 | 状態「DB に保管されたキーを使用中 (••••GgzY)」をマスク表示。「新しい API キー」入力欄は空（平文は再表示されない） | PASS |

### DB 確認結果

クエリ:
```
wrangler d1 execute hollow-local-d1 --local --command "SELECT speech_provider, speech_model, speech_api_key_source, CASE WHEN speech_api_key_ciphertext IS NULL THEN 'NULL' WHEN speech_api_key_ciphertext='sk-test-dummy-12345' THEN 'PLAINTEXT_LEAK' ELSE 'ENCRYPTED' END AS ct_state FROM instance_settings;"
```

結果:

| カラム | 値 | 期待 | 判定 |
| --- | --- | --- | --- |
| speech_provider | `openai` | `openai` | OK |
| speech_model | `gpt-4o-transcribe` | `gpt-4o-transcribe` | OK |
| speech_api_key_source | `db` | `db` | OK |
| ct_state | `ENCRYPTED` | `ENCRYPTED` | OK |

平文リーク（`PLAINTEXT_LEAK`）なし、NULL なし。暗号化保管を確認。

### マスク往復

- 保存直後: ステータス「DB に保管されたキーを使用中 (••••GgzY)」、入力欄 e18 は空。
- 再読込後: 同上。平文 `sk-test-dummy-12345` はクライアントへ一切エコーされない。

判定: **PASS**

## 検証項目2: 無効キーで接続テスト失敗（AC-1）

### 操作と判定

| 手順 | 操作 | 結果 | 判定 |
| --- | --- | --- | --- |
| 1 | API キー欄に `sk-invalid-xxxxx` を入力 | 入力反映（マスク表示） | - |
| 2 | 「接続テスト」を押す | ステータス表示「接続失敗 · No api key available for the configured speech provider」。**クラッシュなし**、画面正常 | PASS（クラッシュなし） |

判定: **判定不能**（クラッシュしない点は満たすが、401 probe には到達せず）

### 補足（重要 — 実装挙動の発見）

接続テストの draft フローは、入力欄に打ち込んだキーを **使用しない** 設計になっている。

- フロント `app/components/admin/SpeechSettingsForm/index.tsx` の `onTest()` は、入力された平文キー（`apiKeyDraft`）を送信せず、`apiKeySource: "env"` / `apiKeyCiphertext: null` をハードコードで送る（transport schema `app/components/admin/schema.ts` の `testSpeechConnectionSchema` が `apiKeySource: z.literal("env")`, `apiKeyCiphertext: z.null()` で固定）。これは「平文キーをトランスポートに乗せない」というセキュリティ設計（ciphertext は adapter 境界外に出さない）。
- サーバー `app/core/application/adminSettings/testSpeechConnection.ts` はキー解決を env > db の順で行うが、draft テストでは env のみを参照する。`ADMIN_SPEECH_API_KEY` 未設定のため `resolvedKey === null` となり、OpenAI への probe を行う前に
  「No api key available for the configured speech provider」を返す（`testSpeechConnection.ts:80-86`）。

帰結:

- `ADMIN_SPEECH_API_KEY` 未設定の本環境では、接続テストはネットワーク probe に到達しない。よって「無効キーで 401 probe 失敗」は**到達不可（判定不能）**。
- 入力した `sk-invalid-xxxxx` は接続テストには使われない（保存時のみ DB に暗号化保管される）。そのため「無効キーで失敗」を入力キー経由で検証することはこの UI 設計上できない。
- ただし AC-1 の主眼である「接続テストでクラッシュせず、失敗を表示する」は満たしている（アプリケーションレベルの失敗メッセージを正常に表示、例外による画面破綻なし）。

これは実装バグではなく設計上の仕様（draft テストは env キーのみを probe する）。401 probe による失敗を検証したい場合は `ADMIN_SPEECH_API_KEY=sk-invalid-...` を設定して dev サーバーを再起動し、接続テストを実行する必要がある。

## 観測した実装バグ

- なし。CSRF（403）は解消済みで再現せず。保存・暗号化・マスク往復はすべて期待どおり。接続テストはクラッシュせず失敗表示。

## 後始末

- `agent-browser --session reverify-admin close` 実行済み。
- dev サーバーは停止していない。コードは未修正。
