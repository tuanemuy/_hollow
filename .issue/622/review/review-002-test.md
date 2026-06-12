# PR #661 (Issue #622) レビュー — Test 観点（2回目・ゼロベース）

レビュー対象: `app/components/public/__tests__/PublicNoteDetail.test.tsx` 全体、計画 `.issue/622/plan.md` ステップ5 / AC-3・AC-4・AC-8 との整合、R1（review-001-test.md W-001〜W-003）の修正確認。
検証実行: `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx` → 3 件 PASS を手元で確認済み。

## R1 指摘の修正確認

- **W-001（タグ1件では per-tag search の回帰を検出できない）→ 修正済み。** 新規テストのフィクスチャが `tagNames = ["cloudflare", "workers"]` の複数件になり（171行）、各タグについて `toStrictEqual({ tags: [tag] })`（188-190行）で検証している。実装が `search={{ tags: tagNames }}`（全タグ配列を全リンクに付与）に退行した場合、`{ tags: ["cloudflare", "workers"] }` ≠ `{ tags: ["cloudflare"] }` で確実に FAIL する。`toStrictEqual` の採用により余分なキーの混入も検出できる。
- **W-002（非リンク証明の不完全）→ 修正済み。二重の防御になっている。** (1) `stripAnchors` で全 `<a>...</a>` を除去した後も各 `#tag` が `<span>` 内に生き残ることを検証（195-200行）— span が `<Link>` でラップされる回帰では span ごと除去され FAIL。(2) `data-search` 付きアンカー数 `=== tagNames.length`（183行）— bottom-meta タグが search 付きリンク化される回帰では件数超過で FAIL。R1 提案（件数アサーション）より強い形で閉じられている。
- **W-003（属性順・エスケープ依存の完全一致）→ 修正済み。** マークアップ全文一致を廃し、`extractAnchors` でアンカーを属性 Map + テキストに構造分解（49-57行）、エンティティもデコード（42-47行、`&amp;` を最後に処理する順序も正しい）してからアサートする方式に書き換えられた。モックの props 並び順や React のエスケープ表現に依存しない。コメント（39-41行）で node 環境ゆえの設計意図も明記されている。

## ミューテーション分析（机上）

(a) `Link` から `search` 削除 → `data-search` 消失で `toHaveLength` FAIL。(b) 遷移先を `/search` 等へ変更 → href 不一致で FAIL。(c) メタ行タグを span に戻す → アンカー 0 件で FAIL。(d) 末尾メタを `<a>` 化（search 有無どちらでも）→ 件数超過 or span 消失で FAIL。(e) per-tag を全タグ配列に → `toStrictEqual` FAIL。(f) `key`/タグ順の入れ替え → `find` ベースなので順序非依存（過剰検出しない）。AC-3/AC-4 の回帰経路は網羅されており、脆い側（無関係な変更での誤検出）も解消されている。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 共有可変フィクスチャ `tagNames`（37行）は各 `it` の先頭で必ず代入されており現状は順序非依存だが、`backlinks` / `relatedNotes` と併せて `beforeEach` でデフォルトへリセットする形にすると、将来テストを追加した際の設定漏れ（前テストの値の漏出）を構造的に防げる。現状 3 件では実害なし。
- **[N-002]** `extractAnchors` の `<a\b([^>]*)>` は属性値に `>` を含むアンカーを取りこぼすが、本コンポーネントの出力（href / class / data-search の JSON）に `>` は現れず、React も `>` を属性内でエスケープしないケースは無いため実用上問題ない。同様に span 検証の `new RegExp(`#${tag}`)` はタグ名に正規表現メタ文字が入ると壊れるが、フィクスチャ管理下なので許容範囲。汎用ヘルパーに昇格させる場合のみ要注意。
- **[N-003]** AC-1（bottom-meta レイアウト / `ml-auto`）・AC-2（hover/transition）・AC-5〜7（トークン値）のユニットテスト未追加は計画のテスト方針（ユニットは AC-3/AC-4、スタイルはブラウザ確認）どおり。`.issue/622/manual-test/results/` に TC-001〜008 全 PASS の証跡があり、タグ 0 件（TC-006）・390px 折返し（TC-007）・ID ベース URL / P30 デグレ確認（TC-008）までエッジが押さえられている。docs/test.md のフロントエンド検証方針とも整合。
- **[N-004]** `data-search` 属性によるモック出力は「search prop が渡ったこと」の検証に必要十分な抽象度で、実ルーターの JSON シリアライズを再現しない判断は計画ステップ5の明記どおり。`Object.keys(search).length > 0` ガードにより既存の breadcrumb / author-mini の `search={{}}`（`PublicNoteDetail.tsx:95,109`）に属性が付かず、既存テストを壊さない（実行で 3 件緑を確認）。

### サマリー

R1 の Warning 3 件はいずれも提案以上の品質で修正されており、新規の Blocker / Warning は無い。構造的アンカー抽出 + per-tag `toStrictEqual` + アンカー件数 + strip 後 span 残存の組み合わせで、AC-3/AC-4 の主要な回帰経路（リンク消失・遷移先変更・全タグ配列化・末尾メタのリンク化）をすべて捕捉でき、かつ属性順・エスケープといった無関係な変更では落ちない。AC-8（既存テスト緑）も実行確認済み。Test 観点では APPROVED。
