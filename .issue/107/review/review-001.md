# PR Review #001 — infra(issue-107): seed SECRET_BOX_MASTER_KEY in .dev.vars.example for local /admin/llm save

**PR:** #111
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 5
- Verdict: **BLOCKED**（W-001/W-002/W-004 を本 PR で修正、W-003 は別 Issue で対応）

---

## General Review

### Blockers

なし

### Warnings

- **[W-001]** README が staging/production の SECRET_BOX_MASTER_KEY を「`wrangler secret` で provisioning される」と書いているが、実際にはまだ provisioning されていない
  - 場所: `README.md:69-70`、対応する `.dev.vars.example:50-51`
  - 理由: `infra/src/secrets.ts` の `workerSecretSpecs` の `shared` 配列は `BETTER_AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` のみ。`SECRET_BOX_MASTER_KEY` は無い。README / `.dev.vars.example` の文言は「すでに provisioning されている」と読めるため、本番デプロイ時に運用者が誤認するリスクがある。
  - 提案: 「Staging and production keys MUST be provisioned via `wrangler secret` / SOPS」のように未完了の運用課題であることが伝わる表現に変える。

- **[W-002]** `.dev.vars.example` のヘッダーコメント（`workerSecretSpecs` と同期せよ）と本 PR の追加が整合していない
  - 場所: `.dev.vars.example:15-17` (既存ヘッダー) と新規追加セクション
  - 理由: 既存ヘッダーは「`workerSecretSpecs` → `.dev.vars.example`」の同期を強制している。本 PR は逆方向の追加で、宣言と矛盾する状態を作る。追跡 Issue 番号への参照が無いと「同期されていない `.dev.vars.example`」が永久に残る。
  - 提案: `SECRET_BOX_MASTER_KEY` セクション末尾に追跡 Issue 番号を 1 行追加（`# TODO(#xxx): promote to workerSecretSpecs once production secret rotation policy is decided`）。

- **[W-003]** Shipped placeholder の文字列が「いかにも dev」だが、production シークレットスキャナで検知されない可能性
  - 場所: `.dev.vars.example:52`
  - 理由: 値は `decodeMasterKey` を通過してしまい boot エラーにならない。production 流用防止のため CI grep があるとより堅牢。
  - 提案: 本 PR スコープ外。追跡 Issue として「production secrets に shipped placeholder の検知 grep を CI に追加」を起票。

- **[W-004]** manual-test レポートの "EDGE-1" が「中間状態で偶発的に再現」と書かれており、テスト計画通りには実行されていない
  - 場所: `.issue/107/.manual-test/results/summary.md:11`、`.issue/107/.manual-test/results/TC-1.md:25-30`
  - 理由: testing.md のエッジケース 1 は「空に書き換え」を要求しているが、レポートは「未設定」のケースを記録。`decodeMasterKey` 上は同じパスだが記録としては区別すべき。
  - 提案: summary.md / TC-1.md を「未設定状態で再現（空文字書換は未実行・コードパス上同等と判断）」のように区別。

### Notes

- **[N-001]** Plan / scope discipline は明瞭で良い。Issue 本文のスコープを忠実に守っており、PR の差分もスコープと一致。
- **[N-002]** Shipped placeholder の base64 32-byte 検証 OK。`decodeMasterKey` を通過、`WebCryptoSecretBox` 構築時の eager validation も通る。
- **[N-003]** `.dev.vars.example` のセクションコメントは質が高い（生成コマンド・wire format 参照・LOCAL DEV ONLY 警告・production 経路の説明）。
- **[N-004]** README 追記は Quick Start に薄く差し込まれており、既存記述と矛盾せず最小限の変更で良い。
- **[N-005]** PR / plan / testing / report の整合性が高く、Issue #60 TC-2 との接続も明示されている。

---

## Design Decisions

### W-003 の扱い

production シークレットスキャナ用の CI grep 追加は、本 Issue のスコープ「ドキュメントと `.dev.vars.example` の整備のみ／本番運用方針は未介入」を逸脱するため、本 PR では対応せず別 Issue で追跡する。レビュアーも同提案。

### W-002 の追跡 Issue

`workerSecretSpecs` への `SECRET_BOX_MASTER_KEY` 昇格は production 運用方針（鍵ローテーション・shipped placeholder 検知）と一体で決める必要があるため、W-003 の改善案と合わせて 1 つの follow-up Issue にまとめて起票する。
