# レビュー review-001 — Issue #210（調査 PR）

**日付:** 2026-06-04
**対象:** PR #454（`.issue/210/investigation.md` / `plan.md` / `testing.md`）
**観点:** コード変更なしの調査 PR のため、ドキュメントの主張がコードと事実一致しているかのみを検証
**ステータス:** APPROVED

## 検証した主張と結果

| # | 主張 | 結果 | 根拠 |
|---|---|---|---|
| 1 | `verifyPassword` が verify 成功後に `maybeRehashLegacy` を await する直列で、rehash は legacy 行のみ発火 | 正しい | credentialStore.ts:242,245,296-315（`isScryptEncoded` 早期 return:301） |
| 2 | logIn の UoW#1（verify+rehash）が status チェック UoW#2 より前に完走。pending でも rehash 発火 | 正しい | logIn.ts:37-45→47-52→61-65 |
| 3 | 認証経路に application 層の rate limit / lockout が存在しない | 正しい | login.tsx / authGuard.ts / logIn.ts いずれも該当なし（grep 無返却） |
| 4 | scrypt rehash 先パラメータ N=2^16, r=8, p=1, dkLen=64 | 正しい | scrypt.ts:6-9,81-86 / ADR 012 |
| 5 | Issue #208 の `verifyCurrentForChange`（rehash-free verify）が⑤案 A の先例 | 正しい | credentialStore.ts:317-354,361 |
| 6 | `hash-wasm` がコード・package.json から完全削除 | 正しい | package.json（`@noble/hashes` のみ）/ `grep hash-wasm app/` 0 件 |

## 結論

6 主張すべて事実一致。ドキュメントに事実誤認・誇張・抜けなし。修正不要。1 ラウンドでクリーン。
