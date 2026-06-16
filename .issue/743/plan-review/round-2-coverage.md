# Round 2 レビュー — 要件カバレッジ・スコープ整合性（Issue #743）

レビュー視点: Issue の要件カバレッジ・スコープ整合性
対象: `.issue/743/plan.md`（レビュー履歴含む）/ `.issue/743/adr.md`
前提: Round 1（`round-1-coverage.md`）の指摘反映後の再レビュー
日付: 2026-06-15

## 結論サマリー

Round 1 の指摘（P-001 / S-001〜S-004）はすべて適切に解消されている。とくに P-001（AC-5 と ADR-001 の矛盾）は、root crumb を採用したうえで文言を整える対応ではなく、**root crumb 自体を不採用にする**という根本的な判断変更で解消されており、Issue の対応方針（「× を廃止し `NoteBreadcrumb` パターンに揃える」）との整合性がむしろ高まった。

root crumb 不採用は Issue 方針と矛盾しない。Issue 方針3は root crumb を「ディレクトリのみの解除を残したい場合は…検討」という**条件付き・任意の案**として提示しており（"×廃止＋全ノート導線担保" は必須だが root crumb は必須ではない）、全ノート導線は既存 clear-all で担保されている。AC 表も更新後の設計（HeaderSection 内描画・root crumb 無し・末尾 aria-current）と矛盾しない。新たな要件漏れも認められない。

**要修正の問題点はゼロ。** 改善提案を1件のみ挙げる。

---

#### 問題点（要修正）

問題点ゼロ。

Round 1 の指摘はすべて解消済みで、root crumb 不採用への方針転換によって新たな要件漏れ・スコープ逸脱は生じていない。Issue の必須要件（×廃止 / 現在地非リンク化 / 表示位置を詳細と揃える / 全ノート導線担保 / フォールバックチップは×維持）はすべて AC-1〜AC-8 にカバーされており、AC 表と更新後の設計・ADR の間に矛盾は無い。

#### 改善提案（検討推奨）

- **[S-001]** AC-5 のフルリセット導線が「既存挙動の不変確認」として AC に残っているが、回帰テストで保護される具体的観点が AC-7 系に明示されていない。
  - 理由: AC-5 は root crumb 不採用に伴い「全ノートに戻る＝既存 clear-all で担保（不変）」へと性格が変わり、本 Issue では**新規実装を伴わない不変条件**になった。テスト方針（193 行付近）には「フルリセット『フィルタをすべてクリア』が directory も含めて消すことの回帰確認」が挙がっているが、AC-7a/b/c のどれにも「`directoryId` 設定時に clear-all が描画され、押下で directory を含む全フィルタが消える」回帰観点が明示的に紐づいていない。AC-5 が「不変」である以上、本変更（パンくず移設・×廃止）が誤って clear-all 経路に影響しないことを保証する受け皿が AC 表にあると、検証点が一意になる。Round 1 で AC-7 を a/b/c に分割した精度を AC-5 にも適用する形。なお `hasAnyHomeFilter` が `search.directoryId !== undefined` を含むこと（listSelectors.ts L543）、clear-all が `FilterBar` 内で directory を含めて消すこと（L414-428 / `clearAll`）は実コードで確認済みで、設計判断としては正しい。これは検証点の明示の問題であり、設計の誤りではない。
  - 提案: AC-7b（FilterBar 回帰）に「`directoryId` 設定時に clear-all ボタンが残り、押下で directory を含む全フィルタが消える（AC-5 の不変担保）」を一文追記する。テスト方針には既に記載があるため、AC 表との紐づけを足すだけで足りる。

#### 良い点

- Round 1 P-001 への対応が、文言の辻褄合わせではなく**設計判断そのものの見直し**になっている。root crumb を「揃える先 `NoteBreadcrumb` に root crumb が無い」「`HOME_SEARCH` への root crumb は他フィルタも落とし既存 clear-all と冗長」「フルリセットは既存 clear-all で担保」という3点で不採用とした論理は、Issue の中核方針（`NoteBreadcrumb` パターンへの統一）と最も整合する筋の良い判断。root crumb を一覧だけに足すと逆に詳細と非対称になる、という指摘も的確。
- AC 表が更新後の設計と一貫している。AC-5 から「directory のみ解除」「root crumb 存在」の文言が消え、「既存 clear-all で担保（不変）」へ書き換わったことで、Round 1 P-001 の「AC-5 と ADR-001 が逆挙動を指す」矛盾が根絶された。AC-1（末尾 aria-current 非リンク）/ AC-3（× 廃止）/ AC-4（HeaderSection 内・h1 直前・nav が mb-6）も実コード（`NoteBreadcrumb.tsx` / `HomePage.tsx`）と照合して正確。
- スコープ「含まれないもの」に「root crumb『すべてのノート』の追加」が明示的に追加され、不採用の根拠（揃える先に root crumb 無し / clear-all で担保）まで添えられている。方針転換がスコープ宣言にまで反映されており、実装者が誤って root crumb を足す余地が無い。
- Folder アイコン撤去も `NoteBreadcrumb`（先頭アイコン無し）との対称化として AC-1〜AC-4 / AC-7a に一貫して織り込まれている。`DirectoryBreadcrumb.tsx` の現状（L52-54 の `LEADING_ICON` + Folder）と `NoteBreadcrumb.tsx`（アイコン無し）の差分が正しく把握されている。
- 「heading 境界が tree 依存を含む」トレードオフ（tree 失敗時にツールバーも fallback に落ちるが `fallbackHeading` が h1 を保持）が ADR-003・リスク欄・AC-4 に一貫して記録されている。`HomePage.tsx` のツールバー境界が `fallbackHeading` を持つこと（L94-102）も実コードと一致。
- tree の dedup を「`treeQuery` を1箇所で生成し HeaderSection / FilterSection に同一参照配布」とする機構が、`HomePage` JSDoc の `notesQuery` パターン（L48-54）に忠実で、実装ステップ・リスク欄・ADR-003 で参照同一性の必要を繰り返し明記している。
- Round 1 の見送り（S-003 root crumb 独立 AC 化）が「root crumb 不採用により moot」と理由付きで記録され、レビュー履歴の追跡可能性が高い。

#### 検証メモ（事実確認）

- `hasAnyHomeFilter` は `search.directoryId !== undefined` を含む（`listSelectors.ts` L543）。AC-5 の「`directoryId` 設定時は clear-all が必ず表示」は正確（確認済み）。
- clear-all は `FilterBar.tsx` の `hasAnyFilter` gating（L414）で描画され、`clearAll`（L272-）が directory を含む全フィルタを消す。本変更は touch しない（確認済み）。
- `NoteBreadcrumb.tsx` は root crumb 無し / 末尾 `aria-current="page"` の `text-ink-secondary` 非リンク `<span>`（L62-64）/ `nav` 自身が `mb-6`（L40）/ 先頭アイコン無し。ADR-001 の「揃える先」記述は正確（確認済み）。
- `DirectoryBreadcrumb.tsx` 現状は末尾 `CLEAR_BUTTON`(×)（L78-85）+ 先頭 `Folder` アイコン（L52-54）+ 全セグメント `<Link>`。plan の撤去対象記述と一致（確認済み）。
- `HomePage.tsx` の `HeaderSection` は `Promise.all([loadSavedViewsByKind, loadOwnedNotes])`（L144-150）、`FilterSection` は `loadDirectoryTreeFlat({ actorUserId: userId })` をインラインリテラルで呼ぶ（L168）。plan の「HeaderSection に tree await 追加・FilterSection を共有参照へ」は実コードに対応（確認済み）。
- `FilterBar.tsx` L443-464 がパンくず or フォールバックチップを `mb-5` 行で分岐描画。設計 (c) の「パンくずブランチ削除・フォールバックのみ残す」は実在ロジックに対応（確認済み）。
</content>
</invoke>
