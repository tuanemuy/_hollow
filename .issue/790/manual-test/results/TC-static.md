# 静的DOM検証（TC-1 / TC-2 / TC-5 / Edge-1）

実行環境: http://localhost:3002 / セッション `verify-tc-static`
認証: `__Host-session=dev-admin-session-token` cookie 注入で Dev Admin としてログイン成功（サイドバー表示確認済み）。
未処理 ingestion 件数の実値: **19 件**

備考: 初回 cookie 設定が `--session` 指定漏れで default セッションに入り未認証だったため、`--session verify-tc-static` を明示して再設定したところ認証成功した。

---

## TC-1: サイドバー upload 項目への件数表示（AC-1）

**結果: PASS**

| 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| `/` でサイドバー管理セクションの「アップロード」ナビ項目を特定 | 件数が右寄せ・小サイズで表示 | `<a href="/upload">` に `<span>アップロード</span><span class="ml-auto text-xs text-ink-tertiary">19</span>` | PASS |
| 件数の値 | 非ゼロ（約19） | 19 | PASS |
| 既存ライブラリ note 件数と同じ見た目 | `ml-auto text-xs text-ink-tertiary` | 「すべてのノート」も `<span class="ml-auto text-xs text-ink-tertiary">35</span>` で完全一致 | PASS |

count span は `ml-auto`（右寄せ）・`text-xs`（小サイズ）・`text-ink-tertiary` のインライン count。ライブラリ note 件数と class 完全一致。

---

## TC-2: ヘッダーCTAが純粋な「アップロード開始」ボタン（AC-2）

**結果: PASS**

| 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| ヘッダー右上 upload CTA の中身を確認 | 件数チップ（バッジ）が一切なし | `<a href="/#upload" aria-label="アップロード">` 内は upload アイコン + `<span>アップロード</span>` のみ。数字なし | PASS |
| CTA クリック | #upload ダイアログが開く | URL が `/#upload` に遷移、`[role=dialog]`（aria-label「アップロード」）が表示 | PASS |
| 件数の二重表示有無 | サイドバーのみ | ヘッダー banner テキストは「ノート検索 / アップロード / 新規作成」で数字なし。件数はサイドバーのみ | PASS |
| ダイアログを閉じる | Escape で閉じる | Escape 押下で dialog 消失、hash が空に戻る | PASS |

---

## TC-5: アクセシブルなテキスト表現（AC-4）

**結果: PASS**

| 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| サイドバー「アップロード」`<a>` の aria-label | `アップロード（未処理 19 件）` | `aria-label="アップロード（未処理 19 件）"` | PASS |
| `/upload` を開いてアクティブ状態を確認 | aria-current=page / data-active が aria-label と共存 | `aria-current="page"`, `data-active=""`, `aria-label="アップロード（未処理 19 件）"` がすべて同一要素に共存 | PASS |

aria-label 実値: **`アップロード（未処理 19 件）`**（期待フォーマット `アップロード（未処理 N 件）` に一致）。

---

## Edge-1: settings ページでの挙動

**結果: PASS**

| 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| `/settings`（→ `/settings/profile`）へ移動 | settings 用サイドバーに upload 件数が出ない | `a[href="/upload"]` 不在。サイドバー nav は `/`・`/settings/profile`・`/settings/security`・`/settings/prompts`・`/settings/account-delete` のみ | PASS |
| `/` に戻る | 「アップロード」項目に件数が再表示 | `a[href="/upload"]` 復活、aria-label「アップロード（未処理 19 件）」、count span「19」 | PASS |

settings ではサイドバーごと差し替わり upload 件数は非表示。通常画面に戻ると再表示される（仕様どおり）。

---

## サマリ

| TC | 結果 |
| --- | --- |
| TC-1 | PASS |
| TC-2 | PASS |
| TC-5 | PASS |
| Edge-1 | PASS |

- 未処理件数の実値: **19**
- aria-label 実値: **`アップロード（未処理 19 件）`**
- count span class: `ml-auto text-xs text-ink-tertiary`（ライブラリ note 件数と完全一致）
