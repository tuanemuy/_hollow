# 動作確認手順 — Issue #336: UI ボタンとリンクのスタイルを整理・統一する

本 PR は presentation 層のスタイル定数（`*/styles.ts`）と JSX の `className` のみを触る純フロント変更。確認対象は「整理・集約したボタン/リンクが従来どおり表示・動作するか（視覚回帰がないか）」に絞る。

> スコープは plan.md「3. スコープ定義」に従う。本 PR で実際に触った対象（`ROW_ACTIONS_SMALL_PILL` 削除 / `NAV_ITEM`・`TREE_ITEM_LINK` の common 集約 / 任意で public `PILL_BTN`）に応じて、下記の該当セクションのみ実施すればよい。

---

## 1. 自動チェック（必須・全 PR 共通）

リポジトリルートで以下を順に実行し、すべて成功すること。

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test
```

確認ポイント:

- `pnpm typecheck`: 削除した定数（`ROW_ACTIONS_SMALL_PILL`）の参照漏れ・未使用 import が 0 件。
- `pnpm lint:fix` / `pnpm format`: 自動修正後にクリーンになる。
- `pnpm test`: 既存テストがすべて green。

定数を削除・集約したら参照漏れを確認:

```bash
grep -rn "ROW_ACTIONS_SMALL_PILL" app/        # 0 件であること
grep -rn "PILL_BTN" app/ | grep -v "components/public/"  # public を据え置く場合、public 配下のみ残るのが正常
```

---

## 2. 開発サーバー起動

```bash
pnpm dev
```

起動後、表示された URL をブラウザで開き、本 PR で触った対象のセクションを確認する。ログインが必要な画面（サイドバー・ディレクトリツリー）は認証後に確認する。

---

## 3. nav-item リンクの非退行確認（#2 = `NAV_ITEM` / `TREE_ITEM_LINK` 集約時・必須）

ログイン後の authenticated 画面で、サイドバーとディレクトリツリーを確認:

### 3.1 サイドバーのナビ項目（`NAV_ITEM`）

- [ ] 各ナビ項目が従来どおりの高さ・パディング（`px-3 py-[7px]`）・角丸（`rounded-md`）・文字サイズで表示される
- [ ] hover で背景色（surface）が変化する
- [ ] 現在ページのナビ項目が選択中表示（背景 surface + 太字）になる（`aria-current=page` / `data-active`）

### 3.2 ディレクトリツリーのリンク（`TREE_ITEM_LINK`）

- [ ] ツリー項目のリンクが従来どおりのパディング・角丸で表示され、長い名前が省略（truncate）される
- [ ] hover で背景色が変化する
- [ ] 選択中のツリー項目が選択中表示（背景 surface + 太字）になる
- [ ] サイドバーのナビ項目とツリーのリンクで、共通部分（角丸・パディング・選択中の見た目）が一致している（集約により同一 base になったこと）

---

## 4. 死蔵定数削除の確認（#1 = `ROW_ACTIONS_SMALL_PILL` 削除時）

- [ ] `ROW_ACTIONS_SMALL_PILL` は consumer 0 のため画面上の見た目変化は無いはず。typecheck / build が通り、行アクションを含む一覧画面に欠落・崩れがないこと

---

## 5. public pill を common へ寄せた場合（#3 = C 採用時のみ）

未ログインで到達できる public 画面（ヘッダ、エラー画面、検索、ユーザー公開トップ）を開く:

- [ ] public 側のボタンが従来どおりの色・角丸・パディングで表示される
- [ ] hover / active が従来どおり動作する
- [ ] 意図的に common へ寄せた差分（例: disabled 挙動の追加）が plan.md / adr.md の記載どおりであること

（public `PILL_BTN` を据え置く判断にした場合、本セクションは「変更なし」を確認するだけでよい。）

---

## 6. 共通の退行チェック（触った全対象）

- [ ] 角丸 / パディング / 文字サイズ / 状態色（hover・選択中 data-active・disabled）が意図せず変わっていない
- [ ] OS の「視差効果を減らす / prefers-reduced-motion」を有効にした状態でも崩れがない

---

## 補足

- 本 PR はバックエンド（domain / application / adapter）に変更を加えないため、API 動作確認やデータ操作の確認は不要。
- 意図的な視覚変化は plan.md「8. リスク」/ adr.md に記載済みのもののみ。それ以外の見た目変化を見つけた場合は退行として扱い修正する。
