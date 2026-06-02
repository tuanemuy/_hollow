# 動作確認計画 — Issue #417: public 画面のボタン系統を common へ統一する

**Issue:** #417
**作成日:** 2026-06-03

---

## 確認環境

このIssueの変更は `app/components/public/styles.ts` と一部 consumer の CSS クラス文字列のみ。public 画面は未認証で到達できるためログイン不要で検証できる（ShareLinkGate のみ保護リンクのシードが必要）。

### 検証環境の起動

ライブソースを HMR で確認する（フロントの styling 変更なので vite dev で十分）:

```
pnpm dev
```

DB シードが必要な確認項目（PublicSearch / UserPublicTop / ShareLinkGate）向けにローカル D1 マイグレーションを適用しておく:

```
pnpm db:migrate
```

`pnpm start`（`wrangler dev`）はビルド済み `dist` を配信するため、そちらで確認する場合は先に `pnpm build` が必要（live source は反映されない）。本 Issue は dev サーバーでの確認を基本とする。

### 生成 CSS の後勝ち確認

variant・size add-on が生成 CSS 順で意図どおり勝つことの確認用にビルドも通す:

```
pnpm build
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. PublicLayout ヘッダの「ログイン」pill（全 public ページ共通）

- **目的:** PILL_BTN を `${pillBtn} ${pillBtnPrimary}` へ寄せた後も surface pill の見た目が維持され、press feedback が新規付与されること
- **手順:**
  1. 任意の public ページ（`/search` など）を開く
  2. ヘッダ右の「ログイン」pill を確認
  3. hover する／クリック押下中の見た目を確認
- **期待結果:** 灰色 surface 背景・hover で surface-hover・押下で `scale-[0.985]` の沈み込み
- **確認ポイント:** 色・形（rounded-pill・h-9）が旧と一致。押下スケールが新規に出る（意図的差分）

### 2. ErrorPage の primary / surface pill

- **目的:** `data-primary=""` 付き Link が accent を維持し、無印 Link が surface のままであること
- **手順:**
  1. 存在しない public ルート等でエラーページに到達する
  2. 「ホームへ戻る」(`data-primary`) と「検索ページを開く」(無印) を確認
  3. 両ボタンを hover / 押下
- **期待結果:** 「ホームへ戻る」= accent 背景・white 文字、「検索ページを開く」= 灰色 surface。両者で hover 色変化と押下 scale
- **確認ポイント:** primary が灰色に化けていないこと（#273 ADR-003 の variant 後勝ち確認）

### 3. UserPublicTop ページネーション pill

- **目的:** 「前へ/次へ」surface pill の見た目維持と press feedback
- **手順:**
  1. 公開ノートが limit 件超のユーザーの `/u/$username` を開く
  2. ページネーションの「前へ/次へ」を確認・押下
- **期待結果:** surface pill 維持、押下 scale
- **確認ポイント:** ページ送り後もスタイルが安定

### 4. PublicSearch の検索ボタン（最重要）

- **目的:** SEARCH_FORM_BUTTON を `${pillBtn} ${pillBtnPrimary} absolute right-1.5 top-1/2 -translate-y-1/2` + `data-primary=""` へ寄せた後、accent を維持し、**input 内 absolute 配置が PC/モバイル幅で崩れない**こと
- **手順:**
  1. `/search?q=test` を開く
  2. 検索フォーム右端の「検索」ボタンを確認（PC 幅）
  3. ブラウザ幅をモバイル相当（≤640px）に絞り、`max-sm:min-h-[44px]` 発火時のボタン高さと input 内の収まりを確認
  4. ボタンを hover / 押下
  5. 検索結果下部の「次のページ」pill も確認
- **期待結果:** accent 背景維持。PC でもモバイルでも input(h-12=48px) 内に垂直中央で収まり、上下にはみ出さない。hover で accent-hover、押下 scale
- **確認ポイント:** **モバイル幅でボタンが input 下端をはみ出さないこと（ADR-004 の中央寄せ対策の効果確認）**。`data-primary` 付け忘れで灰色化していないこと

### 5. ShareLinkGate の送信ボタン

- **目的:** GATE_SUBMIT を `${pillBtn} ${pillBtnTall} ${pillBtnPrimary} w-full mt-2` + `data-primary=""` へ寄せた後、full-width accent を維持し、disabled ガードが効くこと
- **手順:**
  1. パスワード保護された共有リンク（保護リンクをシード）を開く
  2. 「閲覧する」ボタンを確認（accent / full-width / h-12）
  3. hover / 押下を確認
  4. 送信中（isPending）・ロックアウト中（isLocked）に disabled になる挙動を確認
- **期待結果:** accent 背景・full-width・h-12。disabled 時に opacity-55 + hover/press 抑止。input(h-11) との縦リズムが破綻しない
- **確認ポイント:** 高さが h-11→h-12 に増えても gate カード内のレイアウトが自然（ADR-001）。disabled で押下 scale が抑止される

## エッジケース・異常系

### 1. reduced-motion での press scale 無効化

- **目的:** OS の「視差効果を減らす」設定で押下スケールが無効になること
- **手順:**
  1. OS の reduced-motion を有効にする
  2. 上記 pill / 送信ボタンを押下
- **期待結果:** `motion-reduce:active:scale-100` により押下スケールが出ない

## 既存機能への影響確認

- 各ボタンの遷移先・送信動作（ログイン遷移・検索実行・ページ送り・gate 解錠）が従来どおり機能すること（class 変更のみで挙動ロジックは不変）
- common primitive を変更していないため、authenticated app / auth surface のボタンに影響が出ていないこと（念のため任意の認証画面を1つ確認）

## 確認チェックリスト

- [ ] PublicLayout「ログイン」pill: surface 維持・押下 scale
- [ ] ErrorPage: primary=accent / surface=灰色、両者押下 scale
- [ ] UserPublicTop ページネーション pill: surface 維持・押下 scale
- [ ] PublicSearch「検索」: accent 維持・**モバイル幅で input 内に収まる**・hover/press
- [ ] PublicSearch「次のページ」pill: surface 維持
- [ ] ShareLinkGate「閲覧する」: accent full-width h-12・disabled ガード・縦リズム
- [ ] reduced-motion で press scale 無効
- [ ] 既存遷移/送信動作が不変
- [ ] `pnpm build` / `pnpm typecheck` / `pnpm lint` パス
