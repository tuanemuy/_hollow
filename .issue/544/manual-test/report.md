# ブラウザ検証レポート — Issue #544

**Issue**: #544 領域5「公開・共有で読まれる体験」(P30/P31/P32/P33) のモック実装追従
**実行日時**: 2026-06-07
**テストソース**: `.issue/544/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**ブラウザ**: agent-browser 0.27.0

## 結果サマリー

5 件中 4 件 PASS、1 件 FAIL（FAIL は #544 スコープ外の既存BEバグ起因 → #560 起票）。

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | P33 失効/削除の「トップへ戻る」CTA | PASS |
| TC-002 | P33 ロックアウト警告の `.alert` 案D | FAIL（#560） |
| TC-003 | P32 検索結果スニペット 2行 clamp | PASS |
| TC-004 | P32 hero-sub 説明文 | PASS |
| Edge-1 | P33 パスワード不一致インラインエラー（回帰） | PASS |

## 各 TC の確認事実

### TC-001 — PASS
失効(revoked)リンク `/share/test-share-revoked-0002` のフォーム送信後、STATE3「リンクは無効です」+
full-width primary の「トップへ戻る」CTA（href=`/`）が表示。クリックでトップへ遷移。パスワードフォームは非表示。
（revoked は初回 GET ではゲートを描画し、送信で `share_link_revoked` を受けて STATE3 に切替 — `useActionState`
初期 error=null の設計どおりの挙動。表示内容は期待どおり。）

### TC-002 — FAIL（#560、#544 スコープ外）
ロックアウト UI 実装（`role="status"` の案D 白地+警告ヘアライン枠+shadow+AlertTriangle アイコン、本文
「試行回数の上限に達しました。…」、「あと N 分」固定値なし）はコード上正しい。ただし誤パスワードを
6〜7回送ってもロックアウトに到達せず（`failed_attempts` が DB 上 0 のまま）、案D アラートを実機で観測できなかった。
原因は `resolveShareLink.ts` が失敗カウンタ更新を pending batch に積んだ直後 throw し、遅延バッチ UoW
（`unitOfWork.ts:206`）が throw 時に flush をスキップする既存バグ → #560 起票。UI 自体は単体テストで検証済み。

### TC-003 — PASS
`/search?q=テスト` で公開ノート2件ヒット。スニペット `<p>`（`SEARCH_HIT_SNIPPET`）の class に
`[display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]` が当たり、
`getComputedStyle().webkitLineClamp = "2"` を確認。視覚的にも2行以内であふれなし。
（付随: シードした snippet に含まれる `<mark>` は HTML エスケープされプレーン表示。`<mark>` ハイライトは
プランどおりスコープ外＝snippet がプレーン文字列のため。clamp 検証には無関係。）

### TC-004 — PASS
`/search`（未検索）の hero h1「公開ノートを検索」直下に説明文「このインスタンス全体の公開ノートから
横断検索できます」が表示。空状態は「まだ検索していません」+「上の検索バーにキーワードを入力してください。」。
旧文言「同じインスタンスの公開ノートを横断検索できます」は DOM 全体に存在せず、二重掲出なし。

### Edge-1 — PASS
パスワード付きリンクに誤パスワードを送信 → `role="alert"` のインラインエラー「パスワードが正しくありません。」。
案D の枠付きボックスではなくインライン文言。フォーム残存。正パスワード `test1234` で公開ノートへ遷移することも確認。

## 成果物

- 結果: `.issue/544/manual-test/results/`（TC-001〜TC-004, Edge-1, summary.md）
- スクリーンショット: `.issue/544/manual-test/screenshots/`
- シード: `.issue/544/manual-test/seed-data.md` / `seed.sql`
- 起票 Issue: `.issue/544/manual-test/issues.md`（#560）
