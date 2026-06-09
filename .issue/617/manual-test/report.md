# ブラウザ検証レポート — Issue #617: 公開検索画面（P32）のデザインモック整合

**実行日**: 2026-06-10
**テストソース**: .issue/617/testing.md
**サーバー**: http://localhost:3001（pnpm dev / Cloudflare workerd）
**ブラウザ**: agent-browser 0.27.1
**シードデータ**: ローカル D1 に既存。公開 search_documents 9件（一部 tech/common/reading/travel/cooking タグ付き）。keyword「テスト」で 9件ヒット。

---

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | ヒーロー検索バーの視覚（surface背景・枠線なし・高さ・focus） | 正常系 | PASS |
| TC-2 | ヒーローのレイアウト（中央寄せ・余白） | 正常系 | PASS |
| TC-3 | 検索結果カードの要素順・タグ表現 | 正常系 | PASS |
| TC-4 | ソート表示（chevron 無しラベル） | 正常系 | PASS |
| TC-5 | モバイル表示（単カラム・送信ボタン収まり） | 正常系 | PASS |
| TC-機能 | 検索送信（既存挙動維持） | 回帰 | PASS |

**合計**: 6 件（PASS: 6 / FAIL: 0）

---

## 詳細

### TC-1: ヒーロー検索バーの視覚 — PASS
- 背景 surface（淡グレー）・枠線なし・高さ大きめ（56px）・accent の「検索」ボタンが右側に視認できる（`tc3-results-desktop.png`）。
- フォーカス時に背景が surface-hover に変わり focus リング（shadow-focus）が表示される（`tc1-focus-desktop.png`）。
- 旧実装の白背景＋枠線ではない。送信ボタンは input 縦中央に収まり、はみ出しなし（ADR-004 維持）。

### TC-2: ヒーローのレイアウト — PASS
- 見出し「公開ノートを検索」・サブテキスト・検索バーがすべて中央寄せ（`tc1-empty-desktop.png` / `tc3-results-desktop.png`）。最大幅内に中央配置。

### TC-3: 検索結果カードの要素順・タグ表現 — PASS
- カード内は「タイトル → スニペット → メタ行」の順（`tc3-results-desktop.png`）。
- メタ行は「著者（avatar + @seeduser）→ ドット `·` → タグ（accent 色）」。ドットは著者とタグ群の間に1個。タグは `#common #tech` のスペース連結 accent 表示（ドット区切りでない）。
- タグの無いノートはドット＋タグ span を出さず著者のみ表示。
- 更新日時は非表示（別Issue 対応のため意図的）。

### TC-4: ソート表示 — PASS
- 「関連度順」が chevron 無しの読み取り専用ラベルとして表示（`tc3-results-desktop.png`）。押下できそうな見た目になっていない。

### TC-5: モバイル表示 — PASS
- 幅 390px で検索バー高さ 48px、ヒーロー中央寄せ、結果カード単カラム縦積み、送信ボタンが input 内に収まる（`tc5-results-mobile.png` / `tc5-empty-mobile.png`）。ADR-004 の回帰なし。

### TC-機能: 検索送信 — PASS
- 空状態でキーワード「テスト」を入力 → 「検索」ボタン押下 → `/search?q=テスト&limit=20` に遷移し結果表示（`tc-func-submit.png`）。送信ボタンの既存挙動を維持。

---

## スコープ外の発見（Phase 4 で別Issue 起票）

### 既存挙動: スニペットに `<mark>` リテラルが表示される（本PRの回帰ではない）

検索結果のスニペットに `<mark>テスト</mark>` というタグ文字列がそのままテキスト表示されている（例:「読書感想。`<mark>`テスト`</mark>`キーワードを含む。」）。

**調査結果（別Issueの前提を更新する重要情報）**:
- DB の `search_documents.body_plain` は**クリーン**（`<mark>` を含まない）。
- スニペットの `<mark>` は **FTS5 の `snippet()` 関数が生成している**（`app/core/adapters/d1/searchIndex.ts:209` — `snippet(..., '<mark>', '</mark>', '…', ...)`）。
- つまり**キーワードハイライトは既にバックエンドで実装済み**で、`SearchHitDTO.snippet` には `<mark>` が含まれている。フロントが `{hit.snippet}` でプレーン表示しているため、タグがリテラルで見えている。
- Issue #617 の補足「snippet はプレーン string で `<mark>` を持たない、projection 側のマーク付与が必要」は**実態と異なる**。ハイライトは projection 拡張ではなく、**フロントの安全な HTML レンダリング（サニタイズ付き dangerouslySetInnerHTML）** の問題。
- **更新日時**も同様に `search_documents.updated_at` / `date_for_calendar` が**既にインデックスに存在**する。新規インデックス列の追加は不要で、`SearchHitDTO` / `toSearchHitDTO` / SQL select への projection 配線とフロントの右列レンダリングのみで実現できる。

この発見は、元PR（本Issue）の回帰ではなく**既存の未対応事項**であり、ユーザー方針どおり別Issueに分離する。ただし「リテラル `<mark>` が現在ユーザーに見えている」点は実害のある表示崩れなので、別Issue の優先度・前提として明記する。

---

## クリーンアップ
- agent-browser 全セッション close 済み。
- dev サーバー（PID/3001）停止済み。一時ファイル削除済み。
- ポート3000 の別 dev サーバー（別セッション由来）は触れていない。
