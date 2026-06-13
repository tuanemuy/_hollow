# レビュー — PR #729 / Issue #647（Presentation / Security 観点）Round 3

**レビュー日:** 2026-06-14
**観点:** Presentation / Security
**Round:** 3（フル再レビュー）
**対象 AC:** AC-2（最小情報・redaction）/ AC-3（構造化ログ）/ AC-4（突き合わせ手順）

## 総評

ゼロベースで全差分・実装ファイル・運用ドキュメントを再走査した。Round 1 の Blocker（B-001: RSC マニフェスト未登録）・Warning（W-001 未認証 POST、W-002 dedup キー衝突）はすべて解消済みで、Round 2 から実装に退行は無い。新規の問題も検出されなかった。

AC-2/AC-3/AC-4 はいずれも充足:
- AC-2: スキーマ `.strict()`＋許可キー4固定（`sectionFailureReport.ts:16-23`）、client は `componentDidCatch(_error, _info)` で引数を送らない意図をコメント化（`SectionErrorBoundary.tsx:90-96`）、テストで negative assertion（`message`/`stack`/`error` 不在）とスキーマ余剰キー拒否を二重担保（`__tests__/SectionErrorBoundary.test.tsx:237-253`、`__tests__/sectionFailureReportSchema.test.ts`）。
- AC-3: `logger.warn("Section render failed", { event: "section_failure", section, scope, path, count })`（`sectionFailureReport.ts:45-51`）が ADR-005 の `event`/`kind` 分離と `warn` レベルを守る。`getContainer()` は client-graph safe で handler 内 await。
- AC-4: `docs/runtime_cloudflare.md:336-360` に突き合わせ手順（時刻近接＋section 主／path 補助）と `cf-ray` を主キーにしない注記、`warn` レベルの見落とし注意、`section`/`path` の log-injection 注意が記載済み。目次にも登録（同 20 行）。

---

### Presentation / Security

#### Blockers

なし。

- B-001（RSC 登録）解消を再確認。`app/routes/__root.tsx:34` に `import "@/components/common/sectionFailureReport"` が auth/public action 群（19-26 行）と同形式の副作用 import として登録され、27-33 行に到達ルート（`_app/*` / `admin/*` / `u/*` / `notes/public/*`）を root の all-routes server graph で漏れなく覆う意図が JSDoc 化されている。root route は全ルートを `<Outlet>` でラップする server-rendered 親であり、登録漏れルートは残らない。
- server fn 構成は規約準拠: `createServerFn({method:"POST"}).middleware([errorResponseMiddleware]).inputValidator(validateInput(sectionFailureReportSchema)).handler(...)` は既存 `logOutAction` と同型。transport 検証は `z.string().min(1).max(100)` / `z.enum(["page","shell"])` / `z.string().max(2048)` / `z.number().int().positive().max(1000)` ＋ `.strict()` で DoS・余剰キー・enum 外を弾く。

#### Warnings

なし。

- W-001（未認証・無制限 POST）: ADR-006 でトレードオフ明記、`docs/runtime_cloudflare.md:349,360` に未認証・無レート制限・log-injection 注意を反映済み。
- W-002（dedup キー型/区切り衝突）: `JSON.stringify([section, resetKey ?? null])`（`SectionErrorBoundary.tsx:173`）で解消済み。`lastReportedKey` の ref 型（`string | undefined`）と格納値（JSON 文字列）も整合。

#### Notes

- **[N-001]** redaction は構造的に二重担保で堅牢（良い）。スキーマ `.strict()`＋許可キー4固定が「将来 `error.message`/stack を payload に足す」改変を構造的に弾き、`componentDidCatch(_error, _info)` の意図コメントが補強。Round 2 の評価から変化なし。

- **[N-002]** 過長入力のクランプ（`section.slice(0,100)` / `path.slice(0,2048)`、`SectionErrorBoundary.tsx:182,184`）は fire-and-forget 経路で `validateInput` の 400 reject による観測漏れを防ぐ妥当な設計。クランプ済み値はサーバ側スキーマ上限を必ず通る。`String.slice` のサロゲートペア分割はログ用途で実害なし。

- **[N-003]** logger メタ・client bundle 非漏洩・`warn` レベル選択はすべて規約準拠（良い）。`event: "section_failure"` は ADR-005 どおり `SerializedError` の `kind` 語彙と分離。`getContainer`（`containerStore.ts` 注記どおり node-only import 無し）の handler 内 await は client graph に漏れない。

- **[N-004]** ADR-006（未認証・無制限の公開ログ書き込み口）/ ADR-007（path 平文ログ許容）の判断は引き続き妥当。未認証で受ける理由（公開ノート等の未認証ページでもセクション失敗は起き、認証必須にすると Issue 目的が未認証経路で未達）は筋が通り、副作用が「ログ1行追記」に限られ既存の未認証 auth 系 server fn と同列で突出した危険性はない。レート制限をログ/edge 層に委ねる最小スコープ判断、`path` 生値を相関補助として平文許容する判断も ADR にトレードオフが明記されており over-engineering 回避として妥当。

- **[N-005]** B-001 解消の本番再検証は依然 dev サーバー確認止まり（`.issue/647/manual-test/report.md`）。root 登録は #718 で実証済みの対策と同型、auth action 群が同形式で本番稼働している前例があり設計上の確信度は高い。AC-3 本番成立を厳密保証するなら `pnpm build && pnpm start` でセクション失敗を1回起こし報告 POST 200 ＋ `logger.warn` 出力確認が理想だが Blocker ではない。Round 2 N-001 から状況変化なし。
