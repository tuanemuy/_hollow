# ADR 012: パスワードハッシュを Argon2id (hash-wasm) から scrypt (@noble/hashes) に切り替える

## ステータス

承認済み（2026-05-24, Issue #211 / PR #207 のフォローアップ）

## コンテキスト

[ADR 011](./011-argon2id-migration.md) で PBKDF2 → Argon2id (`hash-wasm`) への移行を行ったが、staging デプロイ後の最初のサインアップで以下のエラーが連鎖して全滅した：

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000).
  at legacyHashPbkdf2 (index.js:17454)
  at D1CredentialStore.registerPassword (index.js:17575)
```

二段の問題が連鎖していた：

1. **`hash-wasm` の動的 WASM compile は CF Workers 本番でも禁止されている**。`hash-wasm` は base64 で埋め込んだ WASM モジュールを `WebAssembly.compile(<bytes>)` でランタイム生成するが、これは Cloudflare Workers が production を含む全環境で禁止している "dynamic WebAssembly compilation from arbitrary buffers" に該当する。ADR-011 の ADR-005 にあった「Production Cloudflare Workers always allows WASM compile」は誤判断だった。
2. **PBKDF2 fallback も Workers では機能しない**。`crypto.subtle.deriveBits(PBKDF2)` の iterations は 100,000 が上限で、ADR-011 の fallback は 600,000 を指定していたため即死。fallback が一度も成功できない状態だった。

結果として `hash-wasm` 経由の Argon2id 採用は本番で **一度も機能していなかった**。

## 決定

### ライブラリ選定

`@noble/hashes@^2.2.0` の **scrypt** を採用する。

検討した代替候補：

- **`@noble/hashes/scrypt`** (採用): 純粋 JS で動的 WASM compile 不要、`paulmillr/noble-hashes` の audit scope に含まれる監査済み実装、`scryptAsync` で event loop を yield (`asyncTick=10ms`) するため Workers の CPU タイム上限に優しい、OWASP Password Storage Cheat Sheet 推奨アルゴリズムの一つ、依存ゼロ、メンテ活発 (最終 commit 2026-05-12 / 868 stars)
- **`@noble/hashes/argon2`**: 同じノーブル系列だが **未監査 scope**、作者が「Argon2 は JS で速くできない (native 比 5x slower)、scrypt を使え」と明示推奨。却下
- **`openpgpjs/argon2id`**: WASM ベースで Workers の static `.wasm` import に対応するが、最終 commit 2023-08 (約3年放置)。中長期のメンテ不安。却下
- **`cf-hash-wasm`**: hash-wasm の CF 向け fork だが最終 commit 2021-01 (5年放置)。却下
- **`glotlabs/argon2-cloudflare`**: Rust 実装を別 Worker に分離して Service Binding で呼ぶ構成。性能は最良だがアーキ複雑化 / Pulumi 設定追加が必要。却下
- **WebCrypto PBKDF2 (100,000 iter)**: OWASP 推奨を下回るため後退。却下
- **自前実装**: 暗号実装の自前化は禁忌。却下

### パラメータ

OWASP Password Storage Cheat Sheet (2024) scrypt 推奨を、CF Workers Paid plan (30s CPU / 128 MiB heap) に収まる第二プロファイルで採用：

- `N = 2^16 = 65536` (CPU/memory cost; OWASP 第一推奨 2^17 は ~128 MiB で heap 上限と衝突するため一段下げ)
- `r = 8`
- `p = 1`
- `dkLen = 64` (RFC 7914 §2 推奨)
- `saltLength = 16`
- `asyncTick = 10ms` (event-loop yield)

PHC エンコード形式: `$scrypt$ln=16,r=8,p=1$<salt-b64>$<hash-b64>` (PHC 慣習に従う標準形)。

### Verify 側 DoS 防御

malformed / malicious な行が WASM/JS リニアメモリを爆食しないよう、verify 経路に上限ガードを置く：

- `ln <= 17` (将来 OWASP 第一推奨へ上げる余地は残しつつ、それより上は拒否)
- `r <= 16`
- `p <= 4`
- `dkLen <= 128`

### legacy PBKDF2 verify との関係

`accounts.password` の `pbkdf2-sha256-v1$...` 形式 (admin) と share-link 側の `$pbkdf2-sha256$i=...$...$...` 形式は **そのまま verify path に温存** する。Issue #206 / ADR 011 の lazy upgrade 経路は維持し、verify 成功時に scrypt 形式へ書き換える (rehash 先のアルゴリズムが Argon2id → scrypt に変わるだけ)。

ADR 011 の ADR-005 で導入された `WasmUnavailableError` / PBKDF2 fallback は **完全削除**。pure JS の scrypt は test pool でも本番でも同じく動くため、test 側の skip ロジックも撤去できる。

### vitest-pool-workers との整合

scrypt は WASM compile を一切要求しないため、`@cloudflare/vitest-pool-workers` でも production Workers でも完全に同一コードが走る。lazy upgrade の統合テストは `argon2idAvailable()` probe を撤廃し無条件で実行する。

## 結果

- `app/core/adapters/security/scrypt.ts` を新設 (旧 `argon2id.ts` は削除)
- `Argon2idPasswordHasher` → `ScryptPasswordHasher` に rename。共通 export は `hashScrypt` / `verifyScrypt` / `isScryptEncoded`
- `D1CredentialStore` (admin) / `ScryptPasswordHasher` (share-link) の write 経路を scrypt に切り替え
- lazy upgrade は維持。legacy PBKDF2 verify path も両 adapter で維持
- DI 配線 (`serverCloudflare.ts`) はクラス名変更のみ
- 統合テスト `identity.integration.test.ts` の WASM probe skip を撤去
- `package.json`: `hash-wasm` 削除、`@noble/hashes` 追加
- ADR 011 ADR-005 を訂正済み（本ADRへリンク）
- staging deploy で実際にサインアップ → ログインまで通ることを確認する手順は別タスク
