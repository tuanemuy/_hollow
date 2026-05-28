# テスト実行サマリー — Issue #299

**実行日時:** 2026-05-29
**テストソース:** `.issue/299/testing.md`
**サーバー:** http://localhost:8787 (wrangler dev / 本番ビルド)
**実行範囲:** コア 3 ケース（17 ケース中、ユーザー判断で代表的なケースに絞った）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | AppShell 持続化リグレッション（リーフ間遷移） | 正常系 | PASS | - |
| TC-002 | AppShell 非影響 mutation（note 編集）で Sidebar 不変 | 正常系 | PASS | - |
| TC-003 | AppShell 影響 mutation（ディレクトリ作成）で Sidebar 更新 | 正常系 | PASS | - |

**合計:** 3 件（PASS: 3 / FAIL: 0 / SKIP: 0）

## 検証手法

各テストで `aside` / `header` / `[role=tree]` DOM ノードに `data-tc-marker` 属性を JS で付与し、操作後に marker が残っているかを `eval` で確認。再マウントされれば marker は失われる。加えて TC-002/TC-003 では tree の `outerHTML` を byte 単位で比較し、内容差を判定。

## 主要な検証結果

### TC-001（AppShell 持続化）
- `/` → `/tags` → `back` のすべての時点で 3 つの marker（aside/header/tree）が残存
- tree children = 4 を維持
- Issue #293 で確立した不変条件が破られていないことを確認

### TC-002（note 編集 = 非影響 mutation）
- tree `outerHTML` が byte-for-byte 一致（7412 bytes → 7412 bytes）
- 保存後のネットワークログに `_app` route loader の再フェッチなし
- `routerInvalidate(router)` ヘルパで `_app` が invalidate 対象から除外されていることの直接的証拠

### TC-003（ディレクトリ作成 = 影響 mutation）
- 3 つの marker はすべて残存 → AppShell wrapper は再マウントなし
- tree children: 4 → 5、outerHTML: 7412 → 8553 bytes、`verify-dir-299` を含む
- snapshot で `treeitem "verify-dir-299"` を確認
- 生 `router.invalidate()` で `_app` も含めて再フェッチされ、React が wrapper を保持したまま children を差し替えた

## 結論

Issue #299 の `routerInvalidate(router)` フィルタ化が
- 非影響 mutation で `_app` invalidate を抑制
- 影響 mutation で `_app` 含め invalidate

の二系統挙動を正しく実現しており、Issue #293 の AppShell 持続化を破壊していないことを実機で確認した。

## カバレッジに関する注意

testing.md の全 17 ケース（確認項目 1〜3 と エッジケース 1〜3）のうち、本検証では代表的な 3 ケースに絞った。残り 14 ケースは以下で代替的に担保:
- 機械的置換（44 箇所）の網羅性: 完全性チェック `rg "await router\.invalidate\(\);"` で 13 件のみ残存を確認
- 型・lint・テスト: `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test` 全 pass（unit 2690 + integration 440）
- 既存 mock の整合性: `UploadDialog.test.tsx` で `router.invalidate` mock がラッパー経由でもヒットすることを確認

## 副作用（クリーンアップ要否）

ローカル DB にテスト操作の痕跡が残る:
- note タイトル変更（`Foo配下の検証用ノート 1 (TC-002 edit second)`）
- ディレクトリ `verify-dir-299` の作成

後続テストに影響する場合は wrangler の D1 をクリアすること。

## 起票した Issue

なし（全 PASS のため）
