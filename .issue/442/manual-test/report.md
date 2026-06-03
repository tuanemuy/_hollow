# ブラウザ検証レポート — Issue #442

**実行日:** 2026-06-03
**テストソース:** `.issue/442/testing.md`
**サーバー:** http://localhost:4321（`pnpm dev --port 4321`）
**認証:** dev D1（miniflare）の `sessions` に admin（`admin@example.com`, role=admin）の既知トークンを直挿し、`eval document.cookie` で `__Host-session` を注入（`.issue` memory の手順）

## サマリー

| TC | テスト名 | 結果 | 検証方法 |
|----|---------|------|---------|
| TC-1 | landing「アカウント作成」CTA（HEADER_CTA→pillBtn+pillBtnPrimary） | PASS | ライブ computed style |
| TC-2 | DesignTokensForm「＋トークンを追加」surface（BTN_CLASS→pillBtn） | PASS | ライブ computed style |
| TC-3 | DesignTokensForm「すべてリセット」ghost destructive h-9 | PASS | ライブ（rest + disabled） |
| TC-4 | DesignTokensForm 行内 small ghost「既定に戻す」（+pillBtnSm） | PASS | ライブ（rest + hover） |
| TC-5 | PromptsForm 2 ボタン ghost destructive（1 variant 集約） | PASS | ライブ computed style |
| Edge-1 | ghost destructive の disabled 表示 | PASS | ライブ（opacity 0.55） |
| Edge-2 | small モバイル min-h 打ち消し（ADR-004） | PASS（生成CSS） | byte-offset 実証 |
| Edge-3 | active:scale / 押下グレー回帰なし（ADR-001/002） | PASS（生成CSS） | byte-offset 実証 |

**合計: 8 件（PASS: 8 / FAIL: 0）**。起票 Issue なし。

## 主要な実測値

### TC-1 landing CTA（accent pill h-9）
- height=36px(h-9) / paddingLeft=16px(px-4) / borderRadius=980px(rounded-pill)
- background=oklch(0.371 0 0)=`--color-accent`（Apple Calm の暗いアクセント）/ color=white
- `data-primary=""` 適用、base の surface に化けず accent が後勝ち ✓

### TC-2 surface（素 pillBtn）
- height=36px / px=16px / radius=980px / bg=rgb(245,245,247)=#f5f5f7=`--color-surface` / color=ink / data 属性なし ✓

### TC-3 ghost destructive h-9「すべてリセット」
- rest: bg=transparent / color=rgb(110,110,115)=#6e6e73=`--color-ink-secondary` / `data-ghost-danger=""`
- disabled（上書きなし）: opacity=0.55 ✓

### TC-4 行内 small ghost「既定に戻す」
- **height=28px(h-7) / px=12px(px-3) / fontSize=12px(text-xs)** — 縮小 variant `data-[sm]:` が後勝ち（h-9 に膨らまない）✓
- `data-ghost-danger="" data-sm=""` 両適用
- **hover 検証（disabled を DOM 直解除して実測）**: rest transparent/ink-secondary → **hover bg=rgb(251,235,235)=#fbebeb=`--color-error-surface` / color=rgb(196,62,62)=error** ✓（ghost-danger の hover 後勝ちをライブ実証）

### TC-5 PromptsForm 2 ボタン
- 「この項目をリセット」「すべてのプロンプトをリセット」とも h=36px / bg=transparent / color=ink-secondary / `data-ghost-danger=""` — **完全に同一表示**（文字列同一だった 2 ローカル定義が 1 variant に集約された結果）✓

## 生成 CSS による cascade 実証（実装時 fresh build `dist/client/assets/index-Bhw7Bimk.css`）

- ghost-danger: base `.bg-surface`@24127 < `bg-transparent`@54554；base `active:…:bg-surface-hover`@49677 < `active:…:bg-error-surface`@55109（**押下グレー回帰なし ADR-001**）
- small: base `.h-9`@15289 < `[data-sm]:h-7`@57531；`.px-4`@27018 < `[data-sm]:px-3`@57590；`.text-sm`@30282 < `[data-sm]:text-xs`@57648；`max-sm:min-h-[44px]`@61500 < `[data-sm]:max-sm:min-h-0`@62882（**モバイル膨らみ打ち消し ADR-004**）

全 data-variant が base を決定的に後勝ち。selector 強化は不要。

## 制約・備考

- agent-browser 0.27.0 の `viewport` エミュレーションが本環境で効かず、モバイル幅でのライブ高さ確認は不可。ADR-004（small の `max-sm:min-h-0` 打ち消し）は生成 CSS の byte-offset 後勝ちで実証。
- 押下中（`:active`）保持のライブ確認は agent-browser では困難。ADR-001（押下グレー回帰なし）は生成 CSS の `active:…:bg-error-surface` が base `active:…:bg-surface-hover` より後である実測で実証。hover の error-surface 化はライブ実証済み。
- admin の server-function POST（保存・リセット mutation）は agent-browser で 403 になる制約があるため、本検証は見た目（className→computed style）に限定。mutation の機能担保は integration テストの領分（本 Issue は純 className 変更で挙動は不変）。
