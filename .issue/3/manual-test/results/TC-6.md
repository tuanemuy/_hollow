# TC-6: 非 admin ユーザーのアクセス拒否

**結果:** PASS

## 手順

1. existing@example.com (role=member) でログイン
2. `/admin/jobs` に直接アクセス

## 結果

admin レイアウトの「アクセスできません」エラー画面が表示された。

```
- banner
  - link "Hollow"
  - StaticText "管理者モード"
- main
  - heading "アクセスできません" [level=1]
  - paragraph
    - StaticText "エラーが発生しました"
  - link "ホームへ戻る"
```

既存の `/admin/users` 等と同じ `errorComponent` 経路で扱われていることを確認。

## スクリーンショット

- `screenshots/tc-6/step-01-forbidden.png`
