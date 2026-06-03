# テスト実行サマリー — Issue #418

**実行日時:** 2026-06-03
**テストソース:** .issue/418/testing.md
**サーバー:** http://localhost:5175 （vite dev）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | AUTH_FOOTER_LINK（/login フッター「アカウントを作成」） | 正常系 | PASS | className `text-accent hover:underline hover:[text-underline-offset:3px]`。hover で 3px offset 下線 |
| TC-002 | FIELD_LINK（/login「パスワードを忘れた方」） | 正常系 | PASS | `text-sm ${textLink}` 合成。13px・accent・hover で下線 |
| TC-003 | CALLOUT_ACTION（確認メール再送ボタン） | 正常系 | SKIP | 未確認メールアカウントのログインが必要で検証環境（シード無し）では callout 未到達。`textLink` 合成のトークン集合一致を静的確認済み |
| TC-004 | PUBLIC_TEXT_LINK_SIGNUP（public ヘッダ「サインアップ」） | エッジ | PASS | `/about` ヘッダで確認。surface-hover pill 据え置き（accent 下線化せず）、無影響 |

**合計:** 4 件（PASS: 3 / SKIP: 1 / FAIL: 0）

加えて `pnpm build` 成功（生成 CSS 同一性の裏取り、testing.md 確認項目5）。

## 総合判断: 視覚回帰なし

統一対象 `textLink`（accent + hover 下線 + 3px offset）は TC-001/002 で実機 computed style とスクショ両面から従来挙動維持を確認。据え置き対象 `PUBLIC_TEXT_LINK_SIGNUP` は別 primitive（surface-hover pill）のまま無影響。リファクタ目的（視覚回帰ゼロ）達成。

## 所見

- **accent はモノクロ**: `--color-accent` は `oklch(37.1% 0 0)`（chroma 0 のニュートラル）。「青系」は想定表現で実デザインは青ではない。accent トークン適用 + hover 挙動を基準に合格判定。
- **TC-003 SKIP の代替検証**: `CALLOUT_ACTION` = `inline-flex items-center gap-1 ${textLink} font-medium text-sm self-start disabled:opacity-60`。装飾部 `textLink` は TC-001/002 でライブ検証済み primitive と同一。build も通過。FAIL ではなく環境制約による未到達。
