# 実装計画 — Issue #241: P13-upload.html モックの FrontMatter 例示を「あれば表示」モデルへ更新

**Issue:** #241
**作成日:** 2026-05-27
**複雑度:** 小規模

---

## 目的

取り込み画面の design モック `spec/design/pages/P13-upload.html` に残っている、Front Matter の旧モデル前提（固定 `title / date / tags / status` 検出）の例示文言を、Issue #230 (#237 PR) で確立された「あれば表示」モデルおよび ADR-001 / ADR-002 の方針に合わせて書き換える。

## スコープ

### 含まれるもの
- `spec/design/pages/P13-upload.html:1123` の `FrontMatter: title, date, tags, status を検出` 文言の書き換え

### 含まれないもの
- 取り込み画面の Front Matter プレビュー UI 全体の再設計（Issue 本文では「余裕があれば」と任意扱い。本モックは `spec/design/index.md:139` でモーダル UI に置き換え済みのフォールバックページ扱いであり、Front Matter プレビュー UI は別途モーダル / Dialog primitive 側で扱うため、本 Issue では文言修正のみに絞る）
- 他ページ・実装コードへの変更（grep で `title, date, tags, status` の固定列挙は P13 の当該 1 行以外に存在しない）

## 実装ステップ

### 1. 例示文言を「あれば表示」モデルに沿った表現へ変更

- **対象ファイル:** `spec/design/pages/P13-upload.html`（1123 行）
- **変更内容:**
  - 旧: `FrontMatter: title, date, tags, status を検出`
  - 新: `FrontMatter: date / title / description などを検出`
- **理由:**
  - ADR-001（`.issue/230/adr.md`）で `KNOWN_KEYS` を撤廃し、`SUGGESTED_KEYS = ["date", "description", "title", "slug"]` のみをサジェスト対象とした。`tags` / `status` は実装側で意味を持たないキーとしてサジェストから外している。
  - ADR-002 により `frontMatter.tags` は新仕様で意味を持たない（タグはハッシュタグに一本化）ため、モック例示からも外す。
  - `date` は `parseFrontMatterDate` で実装側が読むキーであり、強調として先頭に置く。`title` / `description` は一般的な慣習として書かれることが多くサジェスト対象でもあるため例示に含める。
  - 「を検出」という文言は「あれば表示」モデルの趣旨（書かれているキーを汎用的に表示）と矛盾しないよう、固定スキーマ前提を匂わせる `tags, status` を取り除いた上で、例示が一例であることが文脈から読み取れる形にする。

## 設計判断

- 文言は「`date / title / description など`」とし、`date` を先頭に置いて実装側で意味を持つキーであることを暗黙的に強調する。`slug` はサジェスト対象だが慣習的な認知度が `title` / `description` より低いため例示から外し、可読性を優先する。
- 「を検出」の語自体は残す（取り込み時に Front Matter ブロックを抽出する動作を説明する語として依然妥当。「あれば表示」はあくまでエディタ表示モデルの話で、パース挙動の説明とは別レイヤー）。

## リスクと注意点

- 静的モック HTML の文言変更のみで、実装コード・ドメイン・ユースケース・テストへの影響はない。
- `spec/design/index.md:139` の方針により P13-upload.html は「モーダル UI のフォールバックページ」扱い。本変更はそのフォールバック表示の説明文言を最新仕様に追従させるもので、他のデザイン整合性レビュー（`spec/design/review/003.md` の指摘等）とは独立。

## テスト方針

- ブラウザで `spec/design/pages/P13-upload.html` を直接開き、該当行の文言が新表現になっていること、レイアウト崩れがないことを目視確認する。
- `grep -n "title, date, tags, status" spec/` で旧文言が他に残っていないことを確認する。
