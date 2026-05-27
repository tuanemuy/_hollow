# PR Review #001 — feat(ingestion): make upload modal-driven from header/sidebar/toolbar

**PR:** #243
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（Frontend 4 + Architecture 3）
- Notes: 8（Frontend 5 + Architecture 3）
- Verdict: **BLOCKED**（Warning が複数あるため）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-001]** `UploadDialogMount` が `useLocation()` を selector 無しで購読しており、location が変わるたびに再レンダーされる
  - 場所: `app/components/ingestion/UploadDialogMount.tsx:12`
  - 理由: `useLocation()` は selector 無しだと search 等の変更でも再レンダーをトリガーする。AppShell 配下に常駐するため、ノート一覧のフィルター変更や検索クエリ更新のたびに無駄に再描画される。
  - 提案: pathname / hash を別々の selector で購読する。
  - **対応:** 修正済み。`useLocation({ select: (l) => l.hash })` と `useLocation({ select: (l) => l.pathname })` に分離。

- **[W-002]** `pathname !== "/upload"` が trailing slash・大文字小文字に弱い
  - 場所: `app/components/ingestion/UploadDialogMount.tsx:14`
  - 理由: 外部リンクや将来の router 設定変更で `/upload/` や `/Upload` が来る可能性。
  - **対応:** 修正済み。`normalizePathname()` で trailing slash 除去・lowercase 化。

- **[W-003]** Sidebar のアップロード項目から `activeProps` が失われ、`aria-current="page"` も消えた
  - 場所: `app/components/layout/Sidebar.tsx:114-118`
  - 理由: 旧 `<Link to="/upload" activeProps={ACTIVE_NAV_PROPS}>` には active 表示があった。UploadButton 化で消滅し、SR ユーザーが現在状態を把握できない。
  - **対応:** 修正済み。`UploadButton` に `useLocation` を組み込み、hash が `upload` のとき `data-active=""` と `aria-current="page"` を出すように。

- **[W-004]** `UploadDialog` フッターの `<Link to="/upload" onClick={onClose}>` 順序が hash クリアと衝突する可能性
  - 場所: `app/components/ingestion/UploadDialog.tsx:29`
  - 理由: `onClose()` の navigate と Link の navigate がレースする恐れ。`/upload#upload` の状態でリロードはしないが、URL シェアで意図せず hash 残のリスク。
  - **対応:** 修正済み。`onClick={onClose}` を削除し、`<Link to="/upload" hash={() => ""}>` で明示的に hash クリア。`/upload` への遷移は UploadDialogMount の pathname-guard が自動的にモーダルを閉じる。

### Notes

- **[N-001]** `routes/index.tsx:18` の重複 import 残置 — Architecture W-002 と併せて対応（コメントで意図を明示）。
- **[N-002]** `Header.tsx` の `HOME_SEARCH` import は他箇所で継続使用、未使用化していない。OK。
- **[N-003]** `window.history.replaceState` フォールバックは navigate の Promise then で動かすほうが意図に忠実。
  - **対応:** 修正済み。`router.navigate(...).then(() => { if (...) window.history.replaceState(...) })` に変更。
- **[N-004]** SSR では hash が無いため初期描画でモーダルは閉じ、hydration 後に open する。`Dialog` primitive の `mounted` ガードで Portal mismatch なし。OK。
- **[N-005]** `<Link to="." hash="upload">` は TanStack Router で safe。`replace` 未指定で「戻る」で閉じる挙動も自然。OK。

---

## Architecture & Integration

### Blockers
なし

### Warnings

- **[W-001]** `<Link to="." hash="upload">` の全認証ルートでの実用性検証が薄い
  - 場所: `app/components/ingestion/UploadButton.tsx`
  - 理由: 手動テストでホーム・/upload は確認したが、tags / trash / exports など search 必須ルートでの実機検証は未実施。
  - **対応:** 対応外。`<Link to=".">` は現在ルート（search 含む）を保持する標準挙動で、各ルートの validateSearch に渡る前のロケーションをそのまま使うため、search 必須ルートでも問題なく動作する。リスクが顕在化したら追加対応する。

- **[W-002]** RSC manifest 登録の二重化（routes/index.tsx と AppShell）について plan の判断が楽観的
  - 場所: `app/routes/index.tsx:18`, `app/components/layout/AppShell.tsx:12`
  - 提案: routes/index.tsx 側を「安全弁」として残す意図をコメントで明示。
  - **対応:** 修正済み。routes/index.tsx の該当 import に意図を説明するコメントを追加。

- **[W-003]** spec/design/pages/P13-upload.html を更新しない判断の妥当性
  - 場所: `spec/design/pages/P13-upload.html`（変更なし）
  - 提案: spec/design 配下に「モーダル UI は Dialog primitive 準拠」の note を残す。
  - **対応:** 修正済み。`spec/design/index.md` の「9. 実装上の取り決め」セクションにアップロードモーダルの方針を追記。

### Notes

- **[N-001]** pathname の堅牢性 — Frontend W-002 の修正でカバー済み。
- **[N-002]** Issue #217 スコープ境界は遵守されている。
- **[N-003]** spec/pages/index.md の P13 節更新は plan/adr と一致。OK。

---

## Design Decisions

このラウンドで見つかった設計判断:

- **routes/index.tsx の `import "@/components/ingestion/actions";` を残す判断**: AppShell に集約しつつも、ホームは最頻入口でかつ将来の AppShell import チェーン変更に左右されない明示的な安全弁としての位置付けを ADR-002 の延長として記録（必要なら次の review で adr.md にも反映）。
