# PR Review #002 — feat: 共有リンクに QR コード表示を追加しコピー成功テストを整備 (#570)

**PR:** #581
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（全 Round 1 指摘の解消を確認）
- Verdict: **APPROVED**

---

## Frontend
#### Blockers: なし
#### Warnings: なし
- FE-W-001（二重余白）解消 — `mt-3` ラッパー撤去、flex-gap で一律 12px。
- FE-W-002（SVG 寸法）解消 — `QR_CODE` に `[&>svg]:w-full [&>svg]:h-full [&>svg]:block` 追加。
- 動的 import 化で cleanup/race/フォールバック/依存配列いずれも問題なし（`cancelled` ガード健在、import 失敗も `() => {}` で吸収し無描画縮退）。

## Test
#### Blockers: なし
#### Warnings: なし
- TEST-W-001 解消 — 手動制御 Promise で「保留中は空 → 解決後に『コピーしました』」を順検証。await 省略の退行を捕捉できる。
- TEST-W-002 解消 — `vi.waitFor` の条件待ちに置換。
- 動的 import 化後も計14回実行で全 PASS、unhandled rejection / act warning ゼロ。既存 #477 ケースへの副作用なし。

## Security・依存管理・バンドル
#### Blockers: なし
#### Warnings: なし
- SEC-W-001 解消（実バンドル検証）— `rm -rf dist && pnpm build` で qrcode 本体は server 側 `lib-*.js` 1チャンクのみに存在し、NoteDetail server チャンクから `import("./lib-*.js")` の**動的参照のみ**（manifest 上 `isDynamicEntry: true`）。Workers エントリ `dist/server/index.js` に qrcode heavy マーカーゼロ。
- SEC-W-002 解消 — client では qrcode が遅延チャンク（`browser-*.js` 約23kB）に分離、動的参照のみ。yargs 系 CLI 推移依存は client バンドルから完全に tree-shake。
- XSS リスクは依然なし（url は QR 行列にエンコードされ SVG テキストへ非エスケープ混入しない、レンダラソースで再確認）。

---

## Design Decisions
特になし（Round 1 で記録済み: `qrcode` 動的 import 化 = ADR-001 補足）。

## 完了判定
1ラウンド（Round 2）で全視点 Blocker 0 / Warning 0 を達成。レビューループ完了 → APPROVED。
