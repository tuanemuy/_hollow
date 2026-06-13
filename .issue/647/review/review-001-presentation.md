# レビュー — PR #729 / Issue #647（Presentation / Security 観点）

**レビュー日:** 2026-06-14
**観点:** Presentation / Security
**対象 AC:** AC-2（最小情報・redaction）/ AC-3（構造化ログ）/ AC-4（突き合わせ手順）

## 総評

設計（plan / ADR）の意図はおおむね忠実に実装されている。transport 境界の zod スキーマ（`.strict()`・長さ上限・enum・count 上限）、`event` キーによる `kind` 語彙との分離、`useServerFn` 経由の取得、fire-and-forget 化、redaction 原則の構造的担保（許可キー4つに固定＋negative assertion テスト）はいずれも規約・ADR と整合している。

ただし **本番ビルドでこの報告 server fn が RSC マニフェストに登録されず、production で必ず HTTP 500 になる構造的欠陥** が1件ある。これは本リポジトリが #718（logOutFn）で一度踏み、`_app/route.tsx` と `logOutAction.ts` に明示的な対策コメントまで残している既知の罠であり、その対策が本 PR には適用されていない。dev モードのマニュアルテストでは再現しないため見逃されている。

---

### Presentation / Security

#### Blockers

- **[B-001]** 報告 server fn `reportSectionFailure` が RSC マニフェストに登録されず、本番ビルドで client→server round-trip が「Server function info not found」→ HTTP 500 で失敗する。
  - 場所: `app/components/common/sectionFailureReport.ts:40`（fn 本体）/ 登録漏れ箇所 `app/routes/_app/route.tsx`（および他の到達ルート）
  - 理由: このリポジトリは #718 で「`createServerFn` が **動的 import される `"use client"` コンポーネントの連鎖からのみ**到達する場合、RSC ビルドはその client 連鎖を静的に辿らないため handler がマニフェスト未登録になり、client RPC スタブが production で 500 を返す」という罠を踏み、`app/routes/_app/route.tsx:33-36` と `app/components/layout/logOutAction.ts:18-23` の JSDoc に対策（到達ルートの server graph で副作用 `import "@/components/layout/logOutAction"` を行う）を明記している。`reportSectionFailure` の到達経路は **これと同型**:
    - route `app/routes/_app/index.tsx:55` → `await import("@/components/note/HomePage")`（server component）→ 静的 `import { SectionErrorBoundary }`（`"use client"`、`SectionErrorBoundary.tsx:1`）→ 静的 `import { reportSectionFailure }`（`SectionErrorBoundary.tsx:26`）。
    - `grep` した限り、server graph 側に `import "@/components/common/sectionFailureReport"` 相当の **副作用登録 import はどこにも存在しない**（`logOutAction` のような登録が無い）。`SectionErrorBoundary` は `_app` 配下だけでなく `admin/*` / `note/detail` / `ingestion` / 公開系など多数の RSC ページから client 境界越しに使われるため、登録が必要なルートは複数にまたがる。
    - マニュアルテスト（`.issue/647/manual-test/report.md` TC-2）は `pnpm dev`（dev サーバー）で「POST 200」を確認しているが、#718 の不具合は **production ビルド固有**（dev は server fn を別経路で解決する）であり、dev の 200 は production の動作を**何も保証しない**。これは #718 が当初見逃した経路そのもの。
  - 影響: 本番でセクション失敗が起きると、報告 POST 自体が 500 を返す。fire-and-forget + `.catch(() => {})` のため UI は壊れないが、**AC-3「報告がサーバー側で構造化ログとして出力される」が本番で成立しない**（`logger.warn` まで到達しない）。つまり本 Issue の核心目的（本番でセクション失敗を観測可能にする）が本番環境で達成されない。
  - 提案:
    1. `reportSectionFailure` を `app/components/common/` 内の専用 action モジュール（`logOutAction.ts` 同様の命名・JSDoc）に置いたまま、`SectionErrorBoundary` を **静的 import するすべての server-graph ルート**、最低でも `app/routes/_app/route.tsx`（`logOutFn` と並べて）と公開系ルート（`u/$username/...`、`notes/public/...`、`admin` 系の到達ルート）に副作用 `import "@/components/common/sectionFailureReport"` を追加する。`SectionErrorBoundary` は広範に使われるため、登録漏れルートが残ると当該ルートだけ 500 になる。
    2. もしくは `errorResponseMiddleware` のように `app/__root.tsx` など全ルート共通の server graph で1回登録し、全到達経路をカバーする（`SectionErrorBoundary` の遍在性を踏まえると root 登録のほうが漏れにくい）。
    3. いずれにせよ **production ビルド（`pnpm build && pnpm start`）でセクション失敗を1回起こし、報告 POST が 200 を返し `logger.warn` がログに出ること** を再検証する。dev での確認だけでは AC-3 を満たさない。

#### Warnings

- **[W-001]** 報告 fn は未認証で呼べるが、サーバー側にレート制限が一切なく、認証チェックもない。観測用途として plan/ADR で「最小実装・総量はページ内境界数で bounded」と正当化されているが、**この fn は外部から直接叩ける公開 POST エンドポイントである**点が ADR で正面から評価されていない。
  - 場所: `app/components/common/sectionFailureReport.ts:40-53`
  - 理由: `createServerFn` の handler は認証ミドルウェアを通さず（`errorResponseMiddleware` のみ）、誰でも `{section, scope, path, count}` を投げて `logger.warn("Section render failed", ...)` を任意回数発火できる。スキーマで1リクエストあたりのペイロードサイズ（section≤100, path≤2048, count≤1000）は bounded だが、**リクエスト件数の上限は無い**。悪意ある相手はこのエンドポイントに連続 POST して Workers Logs を `event: "section_failure"` 行で埋め、(a) ログ容量/コストの押し上げ、(b) 本物のセクション失敗の埋没（観測ノイズ）、(c) `section`/`path` フィールドへの任意文字列注入によるログ汚染（zod は長さ/enum は縛るが `section`/`path` の中身は任意 UTF-8 を許容）を引き起こせる。plan の「総量はページ内境界数で bounded」という主張は **正規 client 経由の前提** に立っており、エンドポイントを直接叩く攻撃者には当てはまらない。
  - 提案: 本 Issue の最小スコープとしてレート制限見送りは許容しうるが、(1) ADR にこの「未認証・無制限の公開ログ書き込み口」という攻撃面を明示的にトレードオフとして記録すること（現状 ADR-001 は client 経由前提でこのリスクに言及していない）、(2) `section`/`path` は構造化メタとしてそのままログに出るため、ログ消費側（Cloudflare Logs クエリ・将来の外部転送）で改行/制御文字を含む注入の可能性を `docs/runtime_cloudflare.md` の triage 節に一言注記すること、を推奨。可能なら認証済みユーザーに限定する（`authMiddleware` を噛ませる）か、`section` を許可リスト（既存の境界 section 名 enum）に縛れば注入面と容量面の両方が大幅に縮む。少なくとも「なぜ縛らないか」の判断を残すべき。

- **[W-002]** dedup キーが `section` と `resetKey` の文字列連結で構成され、型をまたいだ衝突と区切り曖昧性がある（観測の正確性に影響）。
  - 場所: `app/components/common/SectionErrorBoundary.tsx:170` (`const dedupeKey = \`${section} ${resetKey ?? ""}\`;`)
  - 理由: `resetKey` は `string | number`。`resetKey={1}`（数値）と `resetKey="1"`（文字列）は同一キーに潰れる。また `section="a b"`, `resetKey="c"` と `section="a"`, `resetKey="b c"` のような区切り曖昧性もありうる。実害は「異なるはずの失敗が dedup で1件に丸められ、報告が落ちる（＝AC-3 の観測漏れ）」方向であり、過剰送信よりは安全側だが、観測の正確性を損なう。セキュリティ影響は低いが、観測目的のコードとしては境界が曖昧。
  - 提案: 単一境界インスタンス内では `section` は不変なので、dedup キーは実質 `resetKey` のみで足りる。`resetKey` を `String(resetKey)` ではなく型タグ付き（例 `${typeof resetKey}:${resetKey}`）にするか、`section` は連結から外して曖昧性を消す。最小修正で済む。

#### Notes

- **[N-001]** redaction 原則は構造的に担保されている（良い）。`sectionFailureReportSchema` は `.strict()` で余剰キーを弾き、許可キーは `{section, scope, path, count}` の4つに固定（`sectionFailureReport.ts:16-23`）。client 側も `componentDidCatch(_error, _info)` で引数を `_` プレフィックスし送信ペイロードに含めない意図をコメント化（`SectionErrorBoundary.tsx:90-96`）、テストで「許可キーのみ・`message`/`stack`/`error` を含まない」を negative assert（`SectionErrorBoundary.test.tsx:239-253`）、スキーマ単体でも余剰キー拒否を検証（`sectionFailureReportSchema.test.ts:63-71`）。AC-2 は二重に守られている。なお `.strict()` は「client が誤って余計なキーを足したら 400 で弾く」防御であり、redaction の本丸は「そもそも client が送らない」設計（許可キー固定＋コメント＋テスト）側にある。両者が揃っているのは適切。

- **[N-002]** server fn の構成は既存パターンに完全準拠（良い）。`createServerFn({ method: "POST" }).middleware([errorResponseMiddleware]).inputValidator(validateInput(schema)).handler(...)` の並びは `logOutAction.ts` / `_app/route.tsx` の `loadAppShell` と同型（`sectionFailureReport.ts:40-53`）。`getContainer()` は client-graph safe（`containerStore.ts:1-4` の注記どおり node-only import なし）で、`errorResponseMiddleware` も同じく静的 import している前例があるため、handler 内 `await getContainer()` の client bundle 漏れ懸念はない。

- **[N-003]** logger 呼び出しの構造化メタは規約と整合（良い）。`logger.warn("Section render failed", { event: "section_failure", ... })`（`sectionFailureReport.ts:45-51`）。`event` キーは `errorResponseMiddleware.logServerError` の `meta.kind`（`SerializedError` の kind 語彙、`errorResponseMiddleware.ts:60-65`）と意図的に別キーで、ADR-005 の混同回避が守られている。`warn` レベルも「局所失敗 < server-fn システムエラー（`error`）」の区別として妥当。`Logger` ポート（`logger.ts:3-8`）の `warn(message, meta?)` シグネチャにも適合。

- **[N-004]** AC-4 の運用ドキュメントは実態と整合（良い）。`docs/runtime_cloudflare.md` の追記は (a) `warn` レベル・`event` タグで filter する手順、(b) `error` だけ追うと見落とす旨の対比、(c) RSC 原エラー（フレームワーク既定 `console.error`）との時刻近接＋section 主・path 補助の人手突き合わせ、(d) `cf-ray` を主キーにしない理由（報告が別 POST）、(e) レート制限なし・自動相関なしのスコープ明示、をすべて含み、ADR-003 / ADR-005 と一致。ただし **B-001 が未解決のままだと、この triage 手順は本番で出ないログを前提にした手順になる**点に注意（B-001 解消が前提）。また W-001 の「`section`/`path` への注入でログ汚染しうる」点を triage 節に一言足すとなお良い。

- **[N-005]** `path` に `window.location.pathname` の生値（動的セグメント実値＝note ID 等を含みうる）をそのまま送っている（`SectionErrorBoundary.tsx:178`）。ADR-003 が「最小情報原則とわずかに緊張する／相関の足がかり以上の意味を持たせない」と認識済みで、本番では redact 対象の機微情報ではない（URL パスは元々 client 側で可視）ため Blocker ではない。ただし note ID 等の識別子がサーバーログに平文で長期保存される点は、ログ保持ポリシー次第でプライバシー観点の留意事項になりうる。スコープ外として許容するなら ADR にその判断（「URL パスのログ保存は許容」）を残すと将来の監査で楽。
