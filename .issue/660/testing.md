# 動作確認計画 — Issue #660: a11y 表示モード segmented を APG Radio Group 化

**Issue:** #660
**作成日:** 2026-06-25

---

## 確認環境

このIssueの変更（フロントエンドの a11y / キーボード操作）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate        # ローカル D1 にマイグレーション適用（初回 / スキーマ未適用時のみ）
pnpm seed:dev-admin    # 動作確認用の管理ユーザー + サンプルノートを投入
pnpm dev               # vite dev サーバー（Cloudflare runtime）を起動
```

起動後、ブラウザで以下を開く:

- ホーム（認証アプリ）: `http://localhost:5173/`（`pnpm dev` の出力する URL に合わせる）
- 公開トップ（P30）: `http://localhost:5173/u/{seed で作成されたユーザー名}`

表示モード segmented（list / tile / calendar アイコンの並び）は、ホームのツールバーと公開トップのコントロール行に表示される。

### デプロイ方法

ステージング反映が必要な場合のみ:

```bash
pnpm deploy:staging
```

（本Issueは表示層のみの変更で、検証環境のみで確認できる。デプロイは必須ではない。）

## 確認項目

### 1. radiogroup / radio セマンティクス（ホーム）

- **対応する受け入れ基準:** AC-1, AC-5
- **目的:** 表示モード segmented が `role="radiogroup"` + `role="radio"` + `aria-checked` になり、`tablist`/`tab`/`aria-selected` が消えていることを確認する。
- **手順:**
  1. ホーム `/` を開く。
  2. ブラウザの開発者ツールで表示モード segmented（list/tile/calendar）の DOM を検証する。
  3. コンテナに `role="radiogroup"` / `aria-label="表示形式"`、各ボタンに `role="radio"` と `aria-checked`（選択中のみ `true`）が付いていることを確認する。
- **期待結果:** コンテナ = radiogroup、各ボタン = radio、選択中のみ `aria-checked="true"`。`role="tablist"` / `role="tab"` / `aria-selected` は存在しない。
- **確認ポイント:** スクリーンリーダー（VoiceOver 等）で各ボタンが「ラジオボタン（選択 / 未選択）n/N」と読み上げられること。

### 2. roving tabindex と Tab フォーカス（ホーム）

- **対応する受け入れ基準:** AC-2
- **目的:** segmented 全体で Tab フォーカスが1回だけ停止すること（roving tabindex）。
- **手順:**
  1. ホームでアドレスバーや他要素からキーボードの Tab で順にフォーカスを移す。
  2. 表示モード segmented に到達したときの挙動を観察する。
  3. 開発者ツールで選択中ボタンのみ `tabindex="0"`、非選択が `tabindex="-1"` を確認する。
- **期待結果:** Tab は segmented に1回だけ停止し、次の Tab で segmented を抜ける（3ボタンを個別に巡回しない）。フォーカスは現在の選択モードのボタンに当たる。
- **確認ポイント:** focus-visible の accent outline が選択中ボタンに表示されること。

### 3. 矢印キーナビゲーションと即時切り替え（ホーム）

- **対応する受け入れ基準:** AC-3
- **目的:** 矢印キーで選択が移動し、移動と同時に表示モードが切り替わること（APG Radio Group）。
- **手順:**
  1. ホームで表示モード segmented にフォーカスを当てる（確認項目2の状態）。
  2. ArrowRight / ArrowDown を押す → 次のモードへ。
  3. ArrowLeft / ArrowUp を押す → 前のモードへ。
  4. Home を押す → 先頭（リスト）、End を押す → 末尾（カレンダー）。
  5. 末尾でさらに ArrowRight、先頭でさらに ArrowLeft を押して両端ラップを確認する。
- **期待結果:** 矢印移動と同時に `aria-checked` が移り、ノート一覧の表示（list/tile/calendar）が即座に切り替わる。URL の `?display=` も更新される（home は `replace:true` なので履歴は増えない）。両端でラップする。
- **確認ポイント:** 連続して矢印を押しても表示が壊れない・フォーカスが segmented から外れないこと。

### 4. focus-visible の知覚性（ホーム + 公開トップ）

- **対応する受け入れ基準:** AC-4
- **目的:** キーボードフォーカス時に accent outline でフォーカス位置が知覚できること（WCAG 2.4.7）。
- **手順:**
  1. ホームと公開トップの両方で、キーボード（Tab / 矢印）で表示モード segmented にフォーカスを当てる。
  2. マウスクリックでフォーカスした場合と比較する。
- **期待結果:** キーボード操作時のみ accent outline が表示される（`focus-visible`）。outline は背景に対し 3:1 以上のコントラストで明確に視認できる。
- **確認ポイント:** 公開トップの segmented（以前 outline 欠落）にも outline が出ること。

### 5. 公開トップの radiogroup 化（P30）

- **対応する受け入れ基準:** AC-5
- **目的:** 公開トップの表示モード segmented も radiogroup 化され、既存の表示切り替え挙動が不変であること。
- **手順:**
  1. 公開トップ `/u/{username}` を開く。
  2. 表示モード segmented をクリック / 矢印キーで list / tile / calendar を切り替える。
  3. DOM で radiogroup/radio/aria-checked を確認する。
- **期待結果:** クリック・キーボードどちらでも表示が切り替わり、URL ナビゲーション・楽観的更新（useOptimistic）の挙動は従来どおり。
- **確認ポイント:** 同じ行にある並び替え・フィルタ系メニュー（SortPopover / TagAddPopover）の挙動が変わっていないこと。

### 6. メニュー項目の focus-visible 統一（menuItem / 並び替え・タグ追加）

- **対応する受け入れ基準:** AC-6
- **目的:** 共通 `menuItem` および公開トップの並び替え・タグ追加オプションの focus-visible が accent inset outline を持ち、白パネル上で現在位置が知覚できること。
- **手順:**
  1. ホームでオーバーフローメニュー等（`Menu` を使う箇所）を開き、矢印キーで項目を移動する。
  2. 公開トップの並び替えメニュー / タグ追加メニューを開き、矢印キーで移動する。
  3. danger 項目（例: ノートの「削除」）にもフォーカスを当てる。
- **期待結果:** 各項目のフォーカス時に accent の inset outline が出て、現在位置が背景（surface / error-surface）上で明確に知覚できる。danger 項目も accent outline で示される（ADR-003）。
- **確認ポイント:** outline が項目の内側（負オフセット）に描かれ、パネル端で切れないこと。

## エッジケース・異常系

### 1. 矢印以外のキーを素通しする

- **目的:** segmented にフォーカスがある状態で Tab / Space / Enter を押したときの挙動を確認する。
- **手順:**
  1. segmented にフォーカスを当てる。
  2. Tab を押す → segmented を抜ける。
  3. Space / Enter を押す → 現在のラジオが選択される（ネイティブ button 活性化）。
- **期待結果:** Tab はフォーカスを segmented から離脱させる（preventDefault されない）。Space/Enter は現在ボタンの選択を発火する。矢印以外のキーで表示が壊れない。

### 2. URL に display 指定なし + localStorage に永続値（ホーム）

- **目的:** #650 の永続化挙動が radiogroup 化後も維持されることを確認する。
- **手順:**
  1. ホームで calendar を選択し、`?display=` を消した URL（`/`）で再読み込みする。
  2. segmented の選択状態を確認する。
- **期待結果:** localStorage に永続した calendar が effective mode として反映され、calendar の radio が `aria-checked="true"` になる。

## 既存機能への影響確認

- **表示モードの永続化・URL ナビゲーション（#650 / #219）:** radiogroup 化は表示層のみの変更で、`select` ハンドラ・`writeDisplayPreference`・navigate ロジックは不変。確認項目 3・5・エッジ2 で回帰がないことを確認する。
- **公開トップの SortPopover / TagAddPopover（useRovingMenu）:** 表示モード segmented と同じ行にあるが別系統。確認項目5・6 で挙動不変を確認する。
- **`Menu` を使う全箇所（オーバーフロー / アバター / ディレクトリメニュー）:** menuItem への outline 追加が focus-visible 時のみの視覚変化に留まり、通常時の見た目・動作が不変であることを確認項目6で確認する。
