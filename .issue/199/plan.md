# 実装計画 — Issue #199: 見出し・本文の幅制約と強制改行による不自然な折り返しを解消する

**Issue:** #199
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

ランディングページ・認証画面で、見出しや本文がデスクトップ表示でも不自然に折り返す問題を解消する。原因は (1) `ch` ベースの `max-w-[Nch]`（CJK で実幅が半減し言語ごとにぶれる）と (2) 折り返し調整目的の `<br />`。これらを撤去し、見出しは `text-balance`/`text-pretty`、本文の読み幅は `rem` / トークンで制御する。

## スコープ

### 含まれるもの

- `app/components/landing/LandingPage.tsx` の `ch` ベース `max-w`（HERO_TITLE / HERO_SUBTITLE / SECTION_TITLE / SECTION_LEAD / TEASER_BODY / FOOTER_TAGLINE）と折り返し目的の `<br />`（FOOTER_TAGLINE 内）
- `app/components/auth/VerifyEmail/index.tsx` の折り返し目的 `<br />`（expired / used）
- `app/components/auth/PasswordResetRequestForm/index.tsx` の折り返し目的 `<br />`
- `app/components/public/styles.ts` PROFILE_BIO の `max-w-[60ch]`（Issue が明示的にレビュー対象）
- `app/components/public/PublicNoteDetail.tsx` パンくずの `max-w-[60ch]`（AC「`ch` ベースの `max-w-*` が消えている」を厳密に満たすため）

### 含まれないもの

- `app/core/adapters/.../resendEmailSender.ts` のメール HTML 本文 `<br>`（メールクライアント表示用。ブラウザ折り返しではなく、変更前/変更後の2行表記という明確な意図）
- `markdownRenderer.ts` のコメント文字列内 `<br>`
- 本文テキストそのものの書き換え・i18n 化（別スコープ）

## 実装ステップ

### 1. LandingPage HERO_TITLE（見出し）

- **対象ファイル:** `app/components/landing/LandingPage.tsx`（HERO_TITLE 定数）
- **変更内容:** `... mx-auto mb-6 max-w-[14ch]` → `... mx-auto mb-6 text-balance`
- **理由:** `ch` 撤去。`text-balance` で行長を均等化しオーファンを防ぐ。`max-w` は完全撤去し、SECTION_TITLE と同じ扱いに揃える（HERO は CONTAINER の `max-w-[var(--container-max)]`=1280px 内に収まるため独自上限は不要）。
- **検証依存:** 18文字・clamp 最大64px のため desktop 幅では1行〜2行に収まる想定。実機（1024/1280px）で行数とオーファンを確認し、もし1行が間延びして見えるなら緩い rem 上限（28〜32rem 目安）を再付与する。当初案の `20rem`(=320px) は5文字/行になり逆に行数が増えるため不採用。

### 2. LandingPage HERO_SUBTITLE（本文）

- **対象ファイル:** 同上（HERO_SUBTITLE 定数）
- **変更内容:** `... leading-relaxed max-w-[40ch] mx-auto` → `... leading-relaxed max-w-[34rem] mx-auto text-pretty`
- **理由:** 本文読み幅を rem 固定化（CJK 実寸を考慮し ch×約0.85 で換算）。`text-pretty` で末尾オーファン抑制。

### 3. LandingPage SECTION_TITLE（見出し）

- **対象ファイル:** 同上（SECTION_TITLE 定数）
- **変更内容:** `... mx-auto mb-4 max-w-[22ch]` → `... mx-auto mb-4 text-balance`
- **理由:** `ch` 完全撤去。clamp フォント(最大40px)は 1280px で自然に1行に収まり、`text-balance` で「す」1文字オーファンを解消。上限は不要。

### 4. LandingPage SECTION_LEAD（本文）

- **対象ファイル:** 同上（SECTION_LEAD 定数）
- **変更内容:** `... leading-relaxed max-w-[56ch] mx-auto` → `... leading-relaxed max-w-[44rem] mx-auto text-pretty`
- **理由:** rem 置換（56ch→44rem≒704px）＋オーファン抑制。

### 5. LandingPage TEASER_BODY（本文）

- **対象ファイル:** 同上（TEASER_BODY 定数）
- **変更内容:** `... leading-relaxed mx-auto mb-5 max-w-[44ch]` → `... leading-relaxed mx-auto mb-5 max-w-[34rem] text-pretty`
- **理由:** rem 置換＋オーファン抑制。

### 6. LandingPage FOOTER_TAGLINE（本文）

- **対象ファイル:** 同上（FOOTER_TAGLINE 定数）
- **変更内容:** `... leading-relaxed max-w-[36ch] m-0` → `... leading-relaxed max-w-[30rem] m-0 text-pretty`
- **理由:** rem 置換。

### 7. LandingPage フッターの `<br />` 削除

- **対象ファイル:** 同上（footer 内 `<p className={FOOTER_TAGLINE}>`）
- **変更内容:** `<br />` を削除し、意味上の2文を別段落に分割。後段に `mt-2` を付与（`m-0` を相殺）。
  ```jsx
  <p className={FOOTER_TAGLINE}>散らかった頭の中に、静かな置き場所を。</p>
  <p className={`${FOOTER_TAGLINE} mt-2`}>
    個人のための、ひっそりとしたノートサーバーです。
  </p>
  ```
- **理由:** 折り返し位置の人為調整を排除。意味上独立した2文なので段落分割が自然。

> **注:** Issue 本文の行番号（VerifyEmail L159/L227 など）は起票時のもので現コードとズレている。対象はステータス名で特定する（expired 説明文 / used 説明文）。実装時は行番号ではなく該当ステータスの JSX を読んで `<br />` を特定すること。

### 8. VerifyEmail expired の `<br />` 削除

- **対象ファイル:** `app/components/auth/VerifyEmail/index.tsx`（expired ステータスの説明文）
- **変更内容:** `<br />` を削除し、カード幅内の自然折り返しに任せる。密接に続く案内文なので1段落のまま改行のみ削除。
- **理由:** 折り返し調整目的の `<br />` 撤去。

### 9. VerifyEmail used の `<br />` 削除

- **対象ファイル:** 同上（used ステータスの説明文）
- **変更内容:** 同上の方針で `<br />` 削除。
- **理由:** 同上。

### 10. PasswordResetRequestForm の `<br />` 削除

- **対象ファイル:** `app/components/auth/PasswordResetRequestForm/index.tsx`（サブタイトル）
- **変更内容:** `<br />` を削除し、自然折り返しに任せる。
- **理由:** 同上。

### 11. public/styles.ts PROFILE_BIO（本文）

- **対象ファイル:** `app/components/public/styles.ts`（PROFILE_BIO 定数）
- **変更内容:** `... leading-relaxed max-w-[60ch] mb-3.5` → `... leading-relaxed max-w-[var(--content-max)] mb-3.5 text-pretty`
- **理由:** プロフィール自己紹介の読み幅制約。本文読み幅の SSOT である既存トークン `--content-max: 760px` を参照するのが規約（SSOT 尊重）に最も整合。`text-pretty` でオーファン抑制。

### 12. PublicNoteDetail パンくず

- **対象ファイル:** `app/components/public/PublicNoteDetail.tsx`（パンくずの省略表示）
- **変更内容:** `whitespace-nowrap max-w-[60ch]` → `whitespace-nowrap max-w-[30rem]`
- **理由:** これは折り返しではなく `text-ellipsis` の打ち切り上限だが、CJK 由来のぶれを除き AC「`ch` ベースの `max-w-*` が消えている」を厳密に満たすため rem 化。見た目はほぼ不変。

### 13. 検証

- **内容:** `pnpm typecheck && ./node_modules/.bin/biome check --write app/` 相当で型・lint・format を確認。`grep -rn "max-w-\[[0-9]*ch\]" app/components/` が0件、landing/auth の折り返し `<br />` が0件であることを機械チェック。

## 設計判断

詳細は `adr.md` を参照。要点:

- 見出し（HERO_TITLE / SECTION_TITLE）は `text-balance` ＋ `max-w` 完全撤去。HERO_TITLE は実機確認で間延びする場合のみ緩い rem 上限を再付与（検証依存）。
- 本文は rem 幅＋`text-pretty`。CJK 実寸を考慮し ch×約0.85 を目安に換算。
- PROFILE_BIO は rem リテラルではなく `--content-max` トークン参照（本文読み幅 SSOT）。
- auth の `<br />` は段落分割せず改行削除のみ（密接に続く1案内）。

## リスクと注意点

- `text-balance` のブラウザ最大行数制限（~6行）は対象見出し（最大3行）に影響なし。
- rem 幅は CJK 基準のため英語ダミー時に行数が増える可能性。ただし readable レンジ内で破綻しない。
- FOOTER_TAGLINE 2段落化時、2段目 `mt-2` を忘れると行間が詰まる。
- メール HTML とパンくず以外のスコープ外要素には触れない。

## テスト方針

- `pnpm build` → `pnpm start`（dist 配信のため build 必須）でランディング `/`・`/signup`・`/login`・`/verify-email`（各 status）・`/password/reset`・プロフィール `/u/$username`（PROFILE_BIO 確認用）を 1024px / 1280px で目視。見出しが不自然に折り返さず、1文字オーファンが消えていることを確認。
- HERO_TITLE は `max-w` 撤去後の行数を必ず確認し、間延びするなら緩い rem 上限を再付与（plan ステップ1の検証依存事項）。
- PROFILE_BIO は `60ch`→`--content-max`(760px) で読み幅が広がるため、長文 bio で1行あたり文字数が極端に増えていないか確認。
- 見出し・本文を一時的に英語ダミーへ差し替え、1024〜1280px で行長・はみ出し・カード突き抜けがないか確認（コミットには含めない）。
- 静的検証: `grep` で `ch` ベース `max-w` と折り返し `<br />` が0件。
- `text-balance`/`text-pretty` は初導入のため `pnpm build` でユーティリティが生成されることを併せて確認。

## レビュー履歴

### 1周目（両視点でレビュー、致命的問題なし）

**修正した点**:
- **[P-001]（アーキ・リスク視点）** Issue 記載の行番号（VerifyEmail L159/L227 等）が現コードとズレている件 → ステップ8/9 直前に「行番号ではなくステータス名で特定する」注記を追加。
- **[S-002]（アーキ・リスク視点）** HERO_TITLE の `max-w-[20rem]` が狭すぎ（5文字/行で逆に行数増加）→ `max-w` を完全撤去し `text-balance` 任せに変更（SECTION_TITLE と統一）。実機で行数を確認し必要なら緩い rem 上限を再付与する検証依存事項として明記。

**取り込んだ改善提案**:
- **[S-001]（要件視点・アーキ視点）** `text-balance`/`text-pretty` は初導入のため `pnpm build` でユーティリティ生成を確認する旨をテスト方針に追加。
- **[S-001]（アーキ視点）** PROFILE_BIO の `60ch`→`760px` で読み幅が広がる点 → プロフィール `/u/$username` を目視確認対象に追加。

**見送った提案とその理由**:
- なし（要件カバレッジ視点は「問題点ゼロ」。アーキ視点の S-003 はパンくず rem 化が妥当との確認のみで対応不要）。

**終了判断**: 要件カバレッジ視点は問題点ゼロ。アーキ・リスク視点の指摘（P-001 はドキュメント注記、S-002 は数値選定）はいずれも反映済みで、残る判断は実機目視に委ねる検証依存事項のみ。実装に進める品質に達したと判断し、レビューループを1周で終了する。
