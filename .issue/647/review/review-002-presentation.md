# レビュー — PR #729 / Issue #647（Presentation / Security 観点）Round 2

**レビュー日:** 2026-06-14
**観点:** Presentation / Security
**Round:** 2（フル再レビュー）
**対象 AC:** AC-2（最小情報・redaction）/ AC-3（構造化ログ）/ AC-4（突き合わせ手順）

## 総評

Round 1 の唯一の Blocker（B-001: RSC マニフェスト未登録 → 本番 500）は解消されている。`app/routes/__root.tsx` に副作用 import `import "@/components/common/sectionFailureReport"` が追加され、既存の auth/public action 群（`LoginForm/action` ほか。PR #297 期から root に同居している確立済みパターン）と並べて登録された。root route は全ルートの server graph 親であり、`SectionErrorBoundary` が到達する `_app/*`・`admin/*`・公開ノート（`u/*` / `notes/public/*`）・未認証画面のすべてを漏れなく覆う。Round 1 の提案2（root 一括登録の方が漏れにくい）を採用した形で、`_app/route.tsx` の `logOutFn` 個別登録より網羅性が高く、登録漏れルートが残らない。

Round 1 の Warning 2件も対応済み:
- W-001（未認証・無制限の公開 POST）: ADR-006 に攻撃面を正面からトレードオフとして明記し、`docs/runtime_cloudflare.md` の triage 節に `section`/`path` の任意 UTF-8 注入（改行/制御文字）への注意喚起を追記。
- W-002（dedup キーの型/区切り衝突）: `JSON.stringify([section, resetKey ?? null])` に変更し、`12` vs `"12"` の型衝突と区切り曖昧性を解消（`SectionErrorBoundary.tsx:170-173`）。

Round 1 の Note も ADR-007（path 平文ログ保存の許容判断）として記録され、過長入力の取りこぼし対策（`slice` クランプ）も追加されている。`pnpm test:unit` 全 3848 件 green。

---

### Presentation / Security

#### Blockers

なし。

Round 1 B-001 は解消。検証内容:
- `app/routes/__root.tsx:34` に `import "@/components/common/sectionFailureReport"` が追加され、同 27-33 行に #718 と同型の罠であること・到達ルート（authenticated / admin / public note）全域を root で覆う意図が JSDoc 化されている。
- root route は全ルートを `<Outlet>` でラップする server-rendered 親であり、auth/public action 群が同じ side-effect import 形式で既に登録されている（PR #297 期からの確立パターン）。`reportSectionFailure` の到達経路（route → server component → `"use client"` `SectionErrorBoundary` → 静的 `import { reportSectionFailure }`）は #718 / `logOutAction` と同型であり、root 登録はその client 連鎖を辿らない RSC ビルドのマニュフェスト凍結に対する正しい対策。
- `_app/route.tsx` の既存 `logOutAction` 登録パターンと整合（同一の副作用 import 慣習）。本 PR は個別ルート登録ではなく root 一括登録を選んだが、これは Round 1 提案の (2) であり `SectionErrorBoundary` の遍在性を踏まえると漏れにくく妥当。

#### Warnings

なし。

Round 1 W-001 / W-002 はいずれも対応済み（総評参照）。新規の問題は検出されなかった。

#### Notes

- **[N-001]** B-001 解消の本番再検証は未実施（マニュアルテスト report.md は依然 dev サーバーでの確認）。root 登録は #718 で実証済みの対策と同型であり、auth action 群が同じ形で本番稼働している前例があるため設計上は確信度が高い。ただし AC-3 の本番成立を厳密に保証するには `pnpm build && pnpm start` でセクション失敗を1回起こし報告 POST 200 + `logger.warn` 出力を確認するのが理想（Round 1 B-001 提案3）。Blocker ではない。

- **[N-002]** 過長入力のクランプは fire-and-forget 経路の取りこぼし防止として妥当（良い）。`SectionErrorBoundary.tsx:181-186` で `section.slice(0, 100)` / `path.slice(0, 2048)` をスキーマ上限に合わせてから送る。`.catch(() => {})` で握り潰す経路では `validateInput` の 400 reject が観測漏れになるため、クライアント側で上限に丸めて「切り詰めてでも報告する」設計はログ観測の取りこぼしを減らす。クランプ済み値はサーバ側スキーマ（`section≤100`/`path≤2048`）を必ず通る。`String.slice` はサロゲートペアを途中で割りうるが、ログ用途では実害なし。

- **[N-003]** redaction 原則は引き続き構造的に二重担保（良い）。スキーマ `.strict()`＋許可キー4固定（`sectionFailureReport.ts:16-23`）、client は `componentDidCatch(_error, _info)` で引数を送信しない意図をコメント化（`SectionErrorBoundary.tsx:90-96`）、テストで negative assertion（`message`/`stack`/`error` 不在）とスキーマ余剰キー拒否を検証。

- **[N-004]** server fn 構成・logger メタ・client bundle 非漏洩は規約準拠（良い）。`createServerFn({method:"POST"}).middleware([errorResponseMiddleware]).inputValidator(validateInput(schema)).handler(...)` は `logOutAction` と同型。`logger.warn("Section render failed", { event: "section_failure", ... })` は ADR-005 の `event`/`kind` 分離と `warn` レベル選択を守る。`getContainer`（`containerStore.ts:1-4` の注記どおり node-only import 無し）の handler 内 await は client graph 漏れなし。

- **[N-005]** ADR-006（未認証・無制限の公開ログ書き込み口）/ ADR-007（path 平文ログ許容）の判断は妥当。未認証で受ける理由（公開ノート等の未認証ページでもセクション失敗は起き、認証必須にすると Issue 目的が未認証経路で未達）は筋が通る。副作用が「ログ1行追記」に限られ、既存の未認証 server fn（auth 系）と同列で突出した危険性はない。レート制限をログ/edge 層（WAF・サンプリング）に委ねる最小スコープ判断、`path` 生値を相関補助として平文許容する判断も、いずれもトレードオフが ADR に明記されており over-engineering 回避として妥当。
