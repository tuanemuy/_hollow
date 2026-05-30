# 手動テストレポート — Issue #354: P10 ノート一覧 モバイル対応 + 選択モード/絞り込み UX 刷新

- 実施日: 2026-05-30
- 環境: ローカル dev (http://localhost:3000) / agent-browser 0.27.0 / セッション `verify-354`
- テストソース: `.issue/354/testing.md`

## 結果サマリー

| TC | 確認項目 | 判定 |
|---|---|---|
| TC-02 | サイドバードロワー化（lg 境界） | PASS |
| TC-03 | ヘッダー/ツールバー CTA のアイコン化（sm 境界） | PASS |
| TC-04 | FilterBar モバイル最適化 + タグ折りたたみ | PASS |
| TC-05 | 明示的な選択モード（List/Tile/Calendar） | PASS |
| TC-06 | デザイン準拠チェックボックス | PASS |
| TC-07 | 絞り込みの即時反映（optimistic + pending） | PASS |

総合: 6/6 PASS。実装バグは検出されず。各 TC 詳細は `results/TC-XX.md` を参照。

## 認証セットアップ（詰まった点）

詳細は `seed-data.md`。

1. パスワード長: 指示の `Test1234!pw`（11文字）はサインアップの「12文字以上」検証で弾かれた。13文字の `Test1234!pwAB` に変更して成功。
2. directories の owner_id ユニーク制約: 新ユーザーはサインアップ時に空 root dir を自動生成済みで、旧ユーザー root dir をそのまま付け替えると UNIQUE 違反。新ユーザーの空 root dir（参照0件）を DELETE してから旧ユーザーの dir/note/tag を付け替えて解決。
3. tag.id フォーマット: 追加タグを `lower(hex(randomblob(16)))`（32桁hex）で生成すると `idGenerator.validate`（UUID v7）に弾かれ「Stored tag has malformed id」SystemError で一覧がエラー表示に。version nibble=7 / variant=[89ab] を強制した v7形状 UUID を SQL 生成し直して解決。

最終的に `tester354@example.com` でログインし「すべてのノート / 4 件のノート」とノート一覧・タグファセット（12件 +「もっと見る (+2)」）の表示を確認。

## 主要な確認結果

- TC-02: 幅375 ハンバーガー(44px)+ off-canvas aside(x=-280)、本文縦積みなし。タップでスライドイン(x=0)+backdrop(`fixed inset-0 z-[90] bg-black/0.2`)+`body overflow:hidden`スクロールロック。backdrop/Esc で閉じる。幅1280 ハンバーガー `lg:hidden`、aside `position:sticky`。
- TC-03: 幅375 各CTAは SVG+`max-sm:hidden`ラベルで 48×44px・aria-label保持。幅1280 ラベル表示。
- TC-04: 14タグ中12で打ち切り「もっと見る (+2)」→展開14+「閉じる」→折りたたみ12。active chip=`rgb(29,29,31)`=`--color-ink #1d1d1f`+白文字。各フィルタ375幅に収まり横スクロールなし。
- TC-05: OFF=checkbox非表示+タイトルリンクで `/notes/<id>` 遷移。ON=4 checkbox+dark sticky-bottom BulkActionBar(`section.sticky.bottom-4.z-40`)。2件選択「2 件選択中」。×(aria「選択モードを終了」)で mode OFF+ids clear。List/Tile/Calendar 全view動作。
- TC-06: 未選択=リング(border `rgba(60,60,67,0.18)`)、選択=accent `oklch(0.371 0 0)`(`--color-accent`)+白チェック。`button[role=checkbox]` でSpaceトグル可。幅375で 44×44px。
- TC-07: chipクリック直後 optimistic で active、結果リスト即 `data-pending`/`aria-busy`+opacity1→0.6、サーバ確定(約50-60ms)で解除更新。逐次/高速タップでタグ accumulate しURL全反映。pending中もコントロール操作可。

## 観察メモ（実装バグではない）

TC-07: `.click()` を同一 JS tick で3つ同期連射した場合のみ、URL nav コールバックが stale な `optimistic.tagNames` をクロージャキャプチャし最後の1タグのみ URL に残る挙動を観測。React 再レンダーを挟まない非現実的な同期連射に固有で、実ユーザーの逐次/別tickタップでは全タグ正しく accumulate（URL反映確認済み）。実装バグではないと判断。

## スコープ外

BulkActionBar の破壊的アクション（実際の移動/削除/エクスポート実行）は表示・有効化のみ確認。データ変更の実操作は未実施。

## 成果物

- 結果詳細: `results/TC-02.md` 〜 `TC-07.md`
- シード記録: `seed-data.md`
- スクリーンショット: `screenshots/`（11枚）
