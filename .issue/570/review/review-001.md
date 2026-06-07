# PR Review #001 — feat: 共有リンクに QR コード表示を追加しコピー成功テストを整備 (#570)

**PR:** #581
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 全消し方針のため修正後に再レビュー）

---

## Frontend

#### Blockers
- なし

#### Warnings
- **[FE-W-001]** QR ブロック上部の余白が二重（24px）になりモック/他要素（12px）と不一致。
  - 場所: `index.tsx:472-476`（`<div className="mt-3">`）+ 親 `LINK_ROW`（`styles.ts:64-65` = `flex flex-col gap-3`）
  - 理由: 親が flex `gap-3`(12px) を持つ子に `mt-3`(12px) を追加 → URL 行と QR の間だけ 24px。直後の password/revoke は 12px。モックは一律 12px。
  - 提案: `mt-3` ラッパーを外し `{link.status === "active" ? <QRCodeBlock url={link.url} /> : null}` を直接フラグメント挿入（flex-gap が 12px を担保）。
- **[FE-W-002]** 生成 SVG に width/height 属性が無く、96×96 充填がブラウザのデフォルト解決依存。
  - 場所: `QRCodeBlock.tsx:37-43`、`styles.ts:114`（`QR_CODE`）
  - 提案: `QR_CODE` に `[&>svg]:w-full [&>svg]:h-full [&>svg]:block` を追加してブラウザ非依存に。

#### Notes
- cancelled ガード正しい / dangerouslySetInnerHTML 限定使用妥当 / トークン追従良好 / キャプション文言完全一致 / DOM 順序準拠 / バンドル境界 client 側で適切。

## Test

#### Blockers
- なし

#### Warnings
- **[TEST-W-001]** writeText 解決 → live region 更新の因果がアサーションで証明されていない（`mockResolvedValue` 即解決のため、解決を待たず `setCopied` する退行を検知できない）。
  - 場所: `PublishSettings.test.tsx:307-316`
  - 提案: #477 ケース同様の手動制御 Promise（保留 → 解決）で「保留中は空・解決後に『コピーしました』」を順に検証。
- **[TEST-W-002]** `await Promise.resolve()` 2回というマイクロタスク段数依存で将来の `.then` 段数変化に脆い。
  - 場所: `PublishSettings.test.tsx:309-311`
  - 提案: `vi.waitFor(() => expect(...).toBe("コピーしました"))` で条件待ちに。

#### Notes
- clipboard fake 注入・復元健全 / オプショナルチェーン挙動を正しく再現 / 命名・構造規約整合 / QRCodeBlock 自体の unit 無しは plan スコープと整合。

## Security・依存管理

#### Blockers
- なし

#### Warnings
- **[SEC-W-001]** `NoteActions → PublishSettings → QRCodeBlock → qrcode` が全て静的 import で繋がり、サーバ/初期ロードバンドルへの非混入がソース上保証されずバンドラ任せ。
  - 提案: `pnpm build` 出力でサーバ entry に `qrcode`/`pngjs`/`yargs` が含まれないことを1回検証して記録。
- **[SEC-W-002]** `qrcode` が CLI 専用の重い推移依存（`yargs@15` 一式 ~18パッケージ）を持ち込む（client バンドルでは tree-shake 見込み）。
  - 提案: ブロッカーではない。より軽量な代替（CLI 依存なし）を ADR の「次点」に一行残す。

#### Notes
- dangerouslySetInnerHTML の XSS リスクはレンダラソース確認の結果 実質ゼロ（url は QR 行列にエンコードされ SVG テキストへ非エスケープ混入しない）/ biome-ignore 理由付け適切 / ADR-002 との切り分け妥当。

---

## Design Decisions

`qrcode` を静的 import から `useEffect` 内の動的 import に変更（SEC-W-001 対応）。ADR-001 に追記。

---

## 対応結果（Round 1 → Round 2 へ）

- **FE-W-001（二重余白）** → 修正済み。`mt-3` ラッパー div を撤去し `QRCodeBlock` を直接 flex 子として挿入。一律 12px gap に。
- **FE-W-002（SVG 寸法ブラウザ依存）** → 修正済み。`QR_CODE` に `[&>svg]:w-full [&>svg]:h-full [&>svg]:block` を追加。
- **TEST-W-001（writeText 因果の厳密化）** → 修正済み。手動制御 Promise 化し「保留中は空 → 解決後に『コピーしました』」を順検証。退行（await せず即 setCopied）が一時改変で FAIL になることも確認。
- **TEST-W-002（マイクロタスク段数依存）** → 修正済み。`vi.waitFor` の条件待ちに置換。3回連続 PASS で flaky なし。
- **SEC-W-001（サーバーバンドル非混入の未検証）** → 検証＋修正済み。`pnpm build` 実バンドル確認で qrcode が SSR サーバーチャンクに eager 混入していたため `QRCodeBlock` を動的 import 化。クリーンビルドで SSR チャンクから qrcode 本体が消え、`import("./lib-*.js")` の動的チャンク参照（useEffect 限定・SSR 非実行）になったことを確認。client では遅延チャンクに分離。
- **SEC-W-002（重い CLI 推移依存）** → 動的 import で初期ロード影響を排除（有効リンク表示時のみロード）。代替検討メモを ADR-001 に記録。現状の `qrcode` を維持。

全 Warning 対応済み。Round 2 で再レビュー。
