# TC-admin-3 — env override 表示・マスク（AC-1 / 項目3）

- **対応:** Issue #701 testing.md 確認項目3
- **実行日:** 2026-06-14
- **結果:** PASS（表示確認分）／ db キーのマスク往復は UI 保存 BLOCKED のため未実施

## 操作と結果

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | env 未設定状態で `/admin/speech` の「現在の状態」を確認 | apiKeySource 既定(env)に従い「環境変数から読み込み中」相当を表示（LLM と対称・既定仕様） | status 領域に「現在の状態」＋「環境変数から読み込み中」を表示。`ADMIN_SPEECH_API_KEY` が優先される旨の説明文あり | PASS |
| 2 | DB の apiKeySource 確認 | env 既定 | DB `speech_api_key_source = env`（既定）。`ADMIN_SPEECH_API_KEY` は `.dev.vars` 未設定 | PASS |
| 3 | LLM 画面との対称性 | env 固定時の挙動が対称 | LLM 画面は `ADMIN_LLM_API_KEY` が実際に設定済みのため入力が **disabled**＋「ADMIN_LLM_API_KEY で固定されているため変更できません」。speech はキー未設定のため入力 **有効**だが apiKeySource 既定=env で「環境変数から読み込み中」表示 | PASS |
| 4 | 保存済み db キーのマスク表示往復 | db 保存後にマスク表示 | UI 保存が CSRF で BLOCKED のため db ciphertext を作れず、マスク表示の往復は未実施 | BLOCKED |

## 補足（仕様整合の確認）

testing.md 項目3 の注記どおり、**env が実際には未設定でも既定 apiKeySource='env' のため
「環境変数から読み込み中」と出るのは LLM 画面と対称の既存仕様であり正常**。
LLM 画面が disabled になるのは `.dev.vars` に `ADMIN_LLM_API_KEY` が実在するため（speech は未設定）で、
両者の差は env キーの有無に由来する一貫した挙動。speech 固有の不整合は見られない。

`.dev.vars` 現状:
- `ADMIN_LLM_PROVIDER` / `ADMIN_LLM_API_KEY` = 設定済み（LLM フォーム disabled）
- `ADMIN_SPEECH_*` = 未設定（speech フォーム有効・source 既定 env）
