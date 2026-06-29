# Browser Verify Report — Issue #803

**実行日時**: 2026-06-28
**テストソース**: .issue/803/testing.md
**サーバー**: http://localhost:3001
**修正ラウンド**: 0回（初回全 PASS）

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 6 |
| PASS | 6 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

---

## シードデータ

- migration: `pnpm db:migrate`（適用済み）
- login user: `node scripts/seed-dev-login.mjs` → `dev-login@example.com` / `DevPassw0rd!2024`（role member, active）
- フィクスチャ: user `01950000-0000-7000-8000-000000000010` に先頭 "t" のタグ5件（tag-alpha/beta/gamma/delta/epsilon）＋全タグ添付ノート1件
- 検証前提: 候補は「未コミットの既存タグ」のみ表示のため、検証は `/notes/new` でタグ欄に "t" を入力して実施

---

## テスト結果一覧

| TC | テスト名 | AC | 種別 | 最終結果 | 初回結果 | 備考 |
|----|---------|----|------|---------|---------|------|
| TC-1 | 画面下部での縦クランプ | AC-1 | 正常系 | PASS | PASS | はみ出し時 translateY(-88px) で panelBottom=432=innerH-8 に収まる |
| TC-2 | 動的高さ再クランプ | AC-3 | 正常系 | PASS | PASS | 候補 5→1 で shift none に縮退、1→5 で -88 復帰、古い shift 残留なし |
| TC-3 | 外側クリッククローズ | AC-2 | 正常系 | PASS | PASS | 外側クリックで aria-expanded=false、候補クリックでは #tag-alpha 追加 |
| TC-4 | キーボード/コミット非回帰 | AC-4 | 正常系 | PASS | PASS | ↓+Enter / 新規Enter / Escape(draft保持) / 空Backspace / blurコミット 全て従来通り |
| TC-5 | 候補ゼロ・新規作成のみ | 補助 | 異常系 | PASS | PASS | 小パネル bottom=363≤432 で収まり外側クリックで閉じる |
| TC-6 | 画面上部では shift なし | 補助 | 正常系 | PASS | PASS | transform=none、input 直下(gap 12px)に開く |

---

## 起票した Issue

なし（FAIL ゼロ）。

---

## 備考（テスト手順の補足 — 実装の問題ではない）

- タグ入力欄は sticky ヘッダ直下に固定され input top≈274px が下限のため、testing.md の「scroll down 800」では下部に寄らない。はみ出し再現は **viewport 高さを縮める方式（1280x440）** で実施した。
- クランプの再計算契機は「パネル open / typing による候補変化」。viewport を後から縮めるだけでは再計算されないため、小 viewport でパネルを開き直して検証した（実装仕様どおり）。
- TC-4 の IME 変換確定 Enter のみ agent-browser で composition イベントを忠実に再現できず自動検証から除外（要手動 IME 確認）。他の AC-4 項目は全て PASS。
- セッション中、`fill` で一度ブラウザが about:blank に落ちる agent-browser 側事象があり再ログインした（結論に影響なし。以降 `keyboard type` 主体に切替えて安定）。

---

## 環境情報

- **OS**: Darwin
- **agent-browser**: 0.28.0
- **サーバーコマンド**: `PORT=3001 pnpm dev --port 3001`
- **ポート**: 3001
