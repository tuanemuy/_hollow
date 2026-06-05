# Issue #478 ブラウザ検証サマリー

- テストソース: `.issue/478/testing.md`
- サーバー: http://localhost:3100（worktree dev, port 3100）
- ログイン: cookie 注入（`__Host-session` = `dev-admin-session-token`, admin）
- シード: notes 5 / tags 3（work=3, idea=2, memo=1, Sprint Planning は work+idea のクロスタグ）

## 重要な前提（検証の射程）

本 Issue は「楽観UIの保持期間」のバグ — タグクリック直後（loader round-trip 中の数百ms）にハイライトが付くか、という**タイミング**の問題。`wait --load networkidle` 後のブラウザ観察では修正前後どちらも最終状態は同じハイライト付きになるため、**ブラウザ検証は回帰スモークの位置づけ**。即時反映そのものの証明は決定論的な component テスト（`FilterBar.test.tsx`）が担う。

| TC | 操作 | 期待 | 実際 | 判定 |
|----|------|------|------|------|
| TC-01 | `#work` チップをクリック | リストが work の3件に絞られ、チップが active 化、URL に `tagNames=["work"]` | URL `/?tagNames=["work"]`、リスト = Standup / Sprint Planning / Weekly Report の3件、`#work` チップ `aria-pressed=true` / `data-active=true` / 背景 `rgb(29,29,31)`（bg-ink） | PASS |
| TC-02 | `#work` を再クリック（トグル解除） | フィルタ解除、全5件表示、チップ非アクティブ | URL `/`、ノート5件、`#work` `aria-pressed=false` / `data-active=null` | PASS |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## 自動テスト（本命の証明）

`pnpm test:unit -- FilterBar` — 2 tests PASS:
- タグクリックで navigation pending 中に選択状態が即時反映される（`aria-pressed=true` / `data-active=true`）
- navigation reject 時に baseline へ rollback する（`aria-pressed=false`）

全体: 182 files / 3116 tests PASS。

## スクリーンショット

- `screenshots/tc-01-work-filtered.png` — work 絞り込み後（チップ active）
