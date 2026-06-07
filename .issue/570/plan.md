# 実装計画 — Issue #570: 領域3 P14 公開設定の未追従機能（QR コード・未保存警告・コピー成功テスト）

**Issue:** #570
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

#542 で P14 公開設定をモック（SSOT）追従させた際に見送った未追従機能（トラッカー #563）を追従する。対象は次の3つ:

- **A. 共有リンクの QR コード表示** — 発行済み有効リンクに 96×96 QR + キャプションを表示
- **B. 未保存の変更があります警告** — エディタの dirty 状態を公開設定モーダルに警告表示
- **C. コピー成功ライブリージョンのユニットテスト** — 既存のライブリージョン更新の回帰防止テスト

## スコープ

### 含まれるもの
- **A. QR コード表示** — `qrcode` ライブラリ導入 + 新規 `QRCodeBlock` コンポーネント + `ShareLinkRow` への差し込み（active リンク限定）
- **C. コピー成功ライブリージョンのユニットテスト** — `PublishSettings.test.tsx` にコピー成功時のライブリージョン更新検証ケースを追加
- **B の別Issue化** — 後述の設計判断により B は本Issueでは実装せず、トラッカー #563 配下に別Issue起票（Phase 4 で対応）

### 含まれないもの
- **B. 未保存警告の実装本体** — dirty 状態のページ横断伝搬機構の新設が前提（#542 ADR-001 で既に「本Issue範囲を超える=別Issue引き渡し」と判断済み）。設計判断（Context/共有state vs publishedAt近似）が未決のため別Issue化する。警告UI自体は既存 `ALERT`/`ALERT_WARNING` プリミティブで実装可能だが、dirty 供給経路の設計が本質。
- DTO / loader / domain への変更（A・C はいずれも既存の `ShareLinkDTO.url` 供給で完結）

## 実装ステップ

### A. 共有リンクの QR コード表示

#### 1. QR ライブラリを依存追加

- **対象ファイル:** `package.json`
- **変更内容:** `pnpm add qrcode && pnpm add -D @types/qrcode`
- **理由:** QR 生成ライブラリが未導入。`qrcode`（node-qrcode）は client component で `toString(url, {type:"svg"})` が動作し Cloudflare Workers サーバ側に依存しない。型定義あり・保守実績十分。詳細は ADR 参照。

#### 2. QR スタイル定数を追加

- **対象ファイル:** `app/components/publication/styles.ts`
- **変更内容:** `QR_BLOCK`（`flex items-center gap-4 p-3 bg-bg border border-hairline rounded-md`）、`QR_CODE`（`w-24 h-24 shrink-0 rounded-sm bg-white p-1.5`）、`QR_CAPTION`（`text-xs text-ink-tertiary leading-snug`）を JSDoc 付きで追加。
- **理由:** モック `.qr-block`/`.qr-code`/`.qr-caption`（`P14-publish-settings.html:579-601`）をデザイントークン経由で再現。ドメイン別 styles.ts 集約規約に沿う。`w-24`(96px)/`p-1.5`(6px)/`bg-white` のみ Tailwind 標準スケールで literal px の新規持ち込みを回避。白背景は QR 読み取りのため固定白（`--color-bg` ではなくモック通り `#fff`）。

#### 3. 新規 `QRCodeBlock` コンポーネントを作成

- **対象ファイル:** `app/components/publication/PublishSettings/QRCodeBlock.tsx`（新規）
- **変更内容:** `"use client"` の小コンポーネント。props `{ url: string }`。`useEffect` + `useState` で `import QRCode from "qrcode"` の default 経由で `await QRCode.toString(url, { type: "svg", margin: 0 })` を非同期生成（`toString` は Promise を返す default API）。unmount 後の setState を避ける `cancelled` ガードを入れる。生成済み SVG を `QR_CODE` の `<div>`（`aria-label="QR コード"`）に **`dangerouslySetInnerHTML` で描画（dangerouslySetInnerHTML は自前生成 SVG のみに限定）**。隣に `QR_CAPTION` のキャプションを **通常の JSX** で組む: モック `:945` 準拠で `スマホのカメラで読み取って共有できます。`<br />`リンクと同じアクセス範囲です。`（2文を `<br />` 区切り、両文とも必須）。生成失敗時は何も描画しない（QR はコピー導線の補助）。
- **理由:** QR 生成は client 専用かつ非同期。`ShareLinkRow` から切り出し関心分離。`margin: 0` でモックの padding(6px) と二重余白を避ける。キャプションはユーザー入力ではないので `dangerouslySetInnerHTML` を波及させず通常 JSX で組む。後半文「リンクと同じアクセス範囲です。」はアクセス範囲を伝える重要コピーで欠落させない。

#### 4. `ShareLinkRow` に差し込み

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`
- **変更内容:** URL 行（`LINK_URL_ROW`）の直後に、QR 用の**独立した** `{link.status === "active" ? <QRCodeBlock url={link.url} /> : null}` を `mt-3` で挿入。既存の active アクションブロック（password/revoke）の**内側に入れず**、その前に配置することでモックの DOM 順序（QR → password/revoke）を保つ。`QRCodeBlock` を import。
- **理由:** モックは発行済み有効リンク行の直後・password 入力より前に QR を配置（`:940-947`）。失効済みリンクの QR は無意味なので active に限定。既存 active ブロック内に入れると順序が逆転するため独立挿入する。

### C. コピー成功ライブリージョンのユニットテスト

#### 5. PublishSettings のコピー成功ライブリージョンのテストを追加

- **対象ファイル:** `app/components/publication/PublishSettings/__tests__/PublishSettings.test.tsx`
- **変更内容:** 新規 `describe`（例: "ShareLinkRow copy success live region (N-005)"）を追加。**これは前例の流用ではなく本リポジトリ初の clipboard fake パターン**（`UrlCopyButton.test.tsx` は idle 時の live region 構造しか検証しておらず成功パスは触れていない。`NoteActions.test.tsx` も意図的に clipboard に触れない）。
  - **fake 注入手段（要確定）:** production の `onCopy` は `navigator.clipboard?.writeText(link.url).then(...)`（オプショナルチェーン）で呼ぶため、happy-dom に `navigator.clipboard` が無いと `?.` で短絡し成功パスが走らない → 必ず fake を注入する。注入は `Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, writable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })` で行い、`afterEach` で元の descriptor を退避・復元（無ければ `delete`）する。`navigator.clipboard` が getter-only / 非 configurable で差し替え不可な可能性があるため、**実装時にまず1ケースで PoC して差し替え可否を確認する**。
  - **検証内容:** コピーボタン（`aria-label="リンクをコピー"`）クリック → `act`/`await` 後に `[role="status"]` の `textContent` が `"コピーしました"`、`writeText` が `link.url` で呼ばれたことを検証。idle 時は空文字も確認。
- **理由:** #562 review-002 N-005 の回帰防止。既存 fixture（`activeLink`/`baseInitial`）と `vi.mock` 群を再利用。clipboard fake は新規 describe スコープに閉じ既存ケースに副作用を出さない。

## 設計判断

詳細は `.issue/570/adr.md` を参照。

- **ADR-001: QR ライブラリは `qrcode`（node-qrcode）を採用** — client で動く / Workers 非依存 / 型あり / 保守実績 / SVG でモック忠実。
- **ADR-002: B（未保存警告）は別Issue化** — dirty 伝搬機構の新設という独立した設計タスクで、A/C（自己完結）と前提・規模が質的に異なる。

## リスクと注意点

- **QR 生成の非同期性** — `qrcode.toString` は Promise。`useEffect` 内生成 + `cancelled` ガードで unmount 後 setState を防ぐ（revoke でリンク行が消える既存挙動と整合）。
- **`dangerouslySetInnerHTML`** — 差し込むのは `qrcode` が生成した自前 SVG 文字列（ユーザー入力 HTML ではない）。安全だがレビューで明示する。回避したい場合は `toDataURL` + `<img alt="QR コード">` も可。
- **白背景 literal** — `.qr-code` の白背景は QR 読み取りのためテーマ可変 `--color-bg` ではなくモック通り `bg-white` を維持。
- **active 限定** — 失効済みリンクに QR を出さない（`status === "active"` ガード）。
- **C のテスト環境** — happy-dom に `navigator.clipboard` が無いため fake 注入が必須。注入・復元を新規 describe に閉じる。
- **バンドル** — `qrcode` は `PublishSettings/QRCodeBlock` 配下に閉じ、常時ロードの `NoteActions`（toolbar）から import しない。モーダルチャンクに留める。

## テスト方針

- **ユニット（C）:** `pnpm test:unit` で `PublishSettings.test.tsx` の新規ケースを検証。
- **品質ゲート:** `pnpm typecheck && pnpm lint:fix && pnpm format`。`@types/qrcode` 追加で型解決を確認。
- **QR の手動確認（A）:** ローカルサーバでノート detail → 公開設定モーダル → 限定公開リンク発行 → 有効リンク行に 96×96 QR + キャプション表示、読み取りで `link.url` 一致、失効後は QR が消えることを確認。トークン適用（gap/padding/border/radius）がモックと視覚一致するか並べて確認。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点（アーキ視点 要修正）:**
- **P-001（前例の事実誤認）**: C のテストを「前例の流用」から「本リポジトリ初の clipboard fake パターン確立」に修正。`UrlCopyButton.test.tsx` は idle 構造しか検証しておらず成功パスを触れていない事実、`NoteActions.test.tsx` も clipboard 非依存である事実を Step 5 に明記。
- **P-002（fake 注入手段の未確定）**: `Object.defineProperty(navigator, "clipboard", {configurable, writable, value})` での注入・`afterEach` 復元（無ければ delete）・getter-only の可能性に備えた PoC ステップを Step 5 に明記。

**取り込んだ改善提案:**
- **S-001/S-003（両視点・QR キャプション）**: モック `:945` のキャプションは `<br>` 区切りの2文。両文必須・通常 JSX で組み `dangerouslySetInnerHTML` を波及させない旨を Step 3 に明記。
- **S-002（要件・挿入位置）**: 既存 active アクションブロックの内側に入れず独立挿入してモックの DOM 順序（QR → password/revoke）を保つ旨を Step 4 に明記。
- **S-002（アーキ・API 名）**: `import QRCode from "qrcode"` の default 経由 `await QRCode.toString(...)` Promise 形を Step 3 に明記。
- **S-003（アーキ・規約切り分け）**: `dangerouslySetInnerHTML` の使用が `.note-detail-content` 例外（ADR-002）とは別物である切り分けを ADR-001 に追記。

**見送った提案とその理由:**
- **S-004（アーキ・バンドル検証）**: QR チャンクが初期ロードに含まれない確認は手動確認の「特に注意して見る」程度の補足に留め、計画ステップには昇格しない（モーダル配下 client component として自然にチャンク分割される想定で、検証は testing.md の手動確認でカバー）。

### 2周目

両視点とも問題点ゼロで終了。アーキ視点は1周目の要修正2点（P-001・P-002）と S 系の反映を実コードで裏取りした上で承認（`UrlCopyButton.test.tsx:58` が成功パス未検証・`NoteActions.test.tsx:53` が clipboard 非依存・`index.tsx:378` がオプショナルチェーンであることを確認済み）。要件カバレッジ視点は1周目時点で問題点ゼロ。計画は出荷可能な水準と判断しレビューループ終了。
