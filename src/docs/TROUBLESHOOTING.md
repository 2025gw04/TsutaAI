# TsutaAI トラブルシューティングガイド

このドキュメントは、TsutaAIプロジェクトの開発中に発生した問題とその解決策を体系的にまとめたものです。
同じ間違いを繰り返さないための参考資料として活用してください。

---

## 目次

1. [Web管理画面 (Svelte) のトラブルシューティング](#web管理画面-svelte-のトラブルシューティング)
   - [モーダルウィンドウの実装](#モーダルウィンドウの実装)
   - [CSSスタイリングのガイドライン](#cssスタイリングのガイドライン)
   - [その他のよくあるトラブル](#その他のよくあるトラブル)
2. [デスクトップアプリ (C#/WPF) のトラブルシューティング](#デスクトップアプリ-cwpf-のトラブルシューティング)
   - [コンパイルエラー](#コンパイルエラー)
   - [XAMLとコードビハインドの問題](#xamlとコードビハインドの問題)
3. [バックエンドAPI (Node.js) のトラブルシューティング](#バックエンドapi-nodejs-のトラブルシューティング)
   - [モジュールパスエラー](#モジュールパスエラー)
4. [一般的なベストプラクティス](#一般的なベストプラクティス)
5. [修正履歴](#修正履歴)

---

## Web管理画面 (Svelte) のトラブルシューティング

### モーダルウィンドウの実装

#### 問題1: 中央配置が効かない (CSS競合の回避)

**⚠️ 現象:**
モーダルを作成し `display: flex; justify-content: center; align-items: center;` を指定しても、画面中央に配置されず左上に表示されてしまう。`z-index` を上げても解決しない。

**🛑 原因:**
BootstrapなどのCSSフレームワークがグローバルな `.modal` クラスを持っており、それが独自のスタイル（`position`, `display` など）を `!important` や高い優先度で適用しているため。自前のスタイルが上書きされています。

**✅ 解決策:**
`.modal` という一般的すぎるクラス名を避け、`.modal-window` や `.modal-content` などの固有のクラス名を使用します。

**❌ 悪いコード例 (Bootstrapと競合):**
```svelte
<div class="overlay">
  <!-- .modal クラスがBootstrapのスタイルと競合する -->
  <div class="modal">
    ...
  </div>
</div>
```

**✅ 良いコード例 (推奨):**
```svelte
<div class="overlay">
  <!-- 独自のクラス名を使用して競合を回避 -->
  <div class="modal-window">
    ...
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5); /* 半透明の黒背景 */
    backdrop-filter: blur(4px);    /* 背景のぼかし効果 */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .modal-window {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    /* ...その他のスタイル */
  }
</style>
```

**教訓:**
- **一般的なクラス名（`.modal`, `.btn`, `.card`）は避ける**
- **接頭辞をつけるか、BEM記法を使用する**

---

#### 問題2: モーダルの表示制御 (条件付きレンダリング)

**⚠️ 現象:**
子コンポーネント内で `{#if show}` を使用して表示/非表示を切り替えると、アニメーションが効かなかったり、DOMの生成タイミングによるレイアウト崩れが発生する。

**✅ 解決策:**
モーダルコンポーネント自体は常にレンダリング可能な状態にしておき（`if` ブロックで囲まない）、親コンポーネント側で表示/非表示を制御するパターンが最も安定します。

**推奨パターン:**

```svelte
<!-- 親コンポーネント (Parent.svelte) -->
<script>
  let showModal = false;
</script>

<button on:click={() => showModal = true}>開く</button>

{#if showModal}
  <CustomModal on:close={() => showModal = false} />
{/if}
```

```svelte
<!-- 子コンポーネント (CustomModal.svelte) -->
<!-- 内部に {#if show} は不要。マウントされたら表示される前提で組む -->
<div class="overlay" on:click={dispatchClose}>
  <div class="modal-window" on:click|stopPropagation>
    ...
  </div>
</div>
```

**教訓:**
- **親コンポーネントで表示/非表示を制御する**
- **子コンポーネント内では条件分岐を避ける**

---

### CSSスタイリングのガイドライン

#### クラス命名規則

外部ライブラリ（Bootstrap等）との競合を避けるため、以下のクラス名の使用には注意が必要です。

**避けるべきクラス名:**
- `.modal`
- `.btn` (Bootstrapのボタンスタイルが適用される)
- `.card`
- `.container`
- `.row`, `.col`

**推奨:**
- 接頭辞をつける (例: `.app-card`, `.wbs-container`)
- BEM記法や、コンポーネント固有の具体的な名前を使用する (例: `.task-detail-card`, `.project-list-container`)

#### Scoped CSS vs Global CSS

Svelteの `<style>` はデフォルトでコンポーネントスコープですが、`:global()` を使用する際は以下の点に注意してください。

- **`:global()` の乱用禁止**: 他のコンポーネントに予期せぬ影響を与える可能性があります。
- **モーダルでの活用**: モーダルのオーバーレイなど、DOM構造的に `body` 直下に配置されるような要素（ポータル使用時など）には `:global()` が必要な場合がありますが、基本的には使用せず、適切なDOM構造とクラス命名で解決することを推奨します。

**教訓:**
- **`:global()` は最小限に使用する**
- **適切なクラス命名とDOM構造で解決する**

---

### その他のよくあるトラブル

#### APIデータが反映されない

**現象:**
Svelte 5のRune (`$state`, `$effect`) やStoreの更新検知がうまく動かない。

**原因:**
オブジェクトの参照が変わっていない可能性があります。

**解決策:**
```javascript
// ❌ 悪い例（参照が変わらない）
tasks.push(newTask);

// ✅ 良い例（新しい配列参照を作成）
tasks = [...tasks, newTask];
```

**教訓:**
- **Svelteのリアクティビティは参照の変更を検知する**
- **配列やオブジェクトを更新する際は新しい参照を作成する**

---

#### 日付がずれる

**現象:**
日付の表示や保存時に1日ずれる。

**原因:**
JavaScriptの `Date` オブジェクトはタイムゾーンの影響を受けます。

**解決策:**
日付のみ（`YYYY-MM-DD`）を扱う場合は、UTC変換によるズレを防ぐため、文字列として扱うか、専用のユーティリティ関数（`src/lib/utils/date.ts`）を使用してください。

**教訓:**
- **日付のみを扱う場合は文字列として扱う**
- **専用のユーティリティ関数を使用する**

---

## デスクトップアプリ (C#/WPF) のトラブルシューティング

### コンパイルエラー

#### 問題1: Logger.Errorメソッドの2パラメータオーバーロードが存在しない

**エラー内容:**
```
CS1501: No overload for method 'Error' takes 2 arguments
```

**発生場所:** `ErrorHandler.cs` (複数箇所)

**原因:**
- `Logger.Error(message, exception)` の形式で呼び出しているが、Loggerクラスには1パラメータのErrorメソッドしか定義されていなかった

**解決策:**
- `Logger.cs` に2パラメータを受け取るErrorメソッドのオーバーロードを追加
```csharp
public static void Error(string message, Exception exception)
{
    if (exception != null)
    {
        Write(LogLevel.Error, $"{message} | Exception: {exception.GetType().Name} - {exception.Message}");
        if (!string.IsNullOrEmpty(exception.StackTrace))
        {
            Write(LogLevel.Error, $"StackTrace: {exception.StackTrace}");
        }
    }
    else
    {
        Write(LogLevel.Error, message);
    }
}
```

**教訓:**
- **エラーログメソッドは、メッセージのみと例外付きの2つのオーバーロードを常に用意すること**
- コード全体で一貫したロギングパターンを使用する前に、Loggerクラスが必要なメソッドを提供していることを確認すること

---

#### 問題2: System.Text.JsonとNewtonsoft.Jsonの混在

**エラー内容:**
```
CS0234: The type or namespace name 'Json' does not exist in the namespace 'System.Text'
CS0103: The name '_jsonOptions' does not exist in the current context
```

**発生場所:** `ApiService.cs` (複数箇所)

**原因:**
- プロジェクトはNewtonsoft.Jsonを使用しているのに、一部のコードでSystem.Text.Json.JsonSerializerを使用していた
- `_jsonOptions`という存在しないフィールドを参照していた

**解決策:**
- すべてのSystem.Text.Json呼び出しをNewtonsoft.Jsonに変更
```csharp
// 修正前
var json = System.Text.Json.JsonSerializer.Serialize(request);
var result = System.Text.Json.JsonSerializer.Deserialize<ApiResponse<T>>(json, _jsonOptions);

// 修正後
var json = JsonConvert.SerializeObject(request);
var result = JsonConvert.DeserializeObject<ApiResponse<T>>(json);
```
- `result.success` → `result.Success`、`result.data` → `result.Data` (大文字プロパティに修正)

**教訓:**
- **プロジェクト全体で統一したJSONライブラリを使用すること**
- **Newtonsoft.Jsonを使用する場合:**
  - シリアライズ: `JsonConvert.SerializeObject()`
  - デシリアライズ: `JsonConvert.DeserializeObject<T>()`
  - モデルクラスには `[JsonProperty("field_name")]` を使用
- **System.Text.Jsonを使用する場合:**
  - シリアライズ: `JsonSerializer.Serialize()`
  - デシリアライズ: `JsonSerializer.Deserialize<T>()`
  - モデルクラスには `[JsonPropertyName("field_name")]` を使用
- **混在させないこと！**

---

#### 問題3: TaskItemモデルのプロパティ名の大文字・小文字の不一致

**エラー内容:**
```
CS1061: 'TaskItem' does not contain a definition for 'id'
CS1061: 'TaskItem' does not contain a definition for 'status'
```

**発生場所:** `HelpRequestWindow.xaml.cs`

**原因:**
- `TaskItem`モデルのプロパティは `Id`（大文字）だが、コードでは `id`（小文字）を使用していた
- `Status`（大文字）を `status`（小文字）で参照していた

**解決策:**
```csharp
// 修正前
selectedTask.id
t.status != "completed"

// 修正後
selectedTask.Id
t.Status != "completed"
```

**教訓:**
- **C#のプロパティ名はPascalCase（先頭大文字）を使用する**
- **JSONフィールド名とC#プロパティ名は異なる場合がある:**
  - JSONでは `"id": 123`（小文字）
  - C#では `public int Id { get; set; }`（大文字）
  - マッピングは `[JsonProperty("id")]` で行う
- **IDEの自動補完機能を活用して、プロパティ名のタイプミスを防ぐ**

---

#### 問題4: IList<T>とList<T>の型不一致

**エラー内容:**
```
CS0266: Cannot implicitly convert type 'System.Collections.Generic.IList<TaskItem>' to 'System.Collections.Generic.List<TaskItem>'
```

**発生場所:** `HelpRequestWindow.xaml.cs` Line 35

**原因:**
- `GetUserTasksAsync()` は `IList<TaskItem>` を返すが、変数 `_tasks` は `List<TaskItem>` として宣言されていた
- IListからListへの暗黙的な変換はできない

**解決策:**
```csharp
// 修正前
_tasks = await _apiService.GetUserTasksAsync(_userId);

// 修正後
var tasksList = await _apiService.GetUserTasksAsync(_userId);
_tasks = tasksList.ToList();
```

**教訓:**
- **インターフェース型と具象型を明確に区別すること**
- **APIメソッドの戻り値はインターフェース（IList<T>、IEnumerable<T>）を使用する方が柔軟**
- **具象型が必要な場合は `.ToList()` や `.ToArray()` で明示的に変換する**

---

#### 問題5: Microsoft.VisualBasic.Devicesが利用できない

**エラー内容:**
```
CS0234: The type or namespace name 'Devices' does not exist in the namespace 'Microsoft.VisualBasic'
```

**発生場所:** `SystemPerformanceMonitor.cs` Line 150

**原因:**
- `Microsoft.VisualBasic.Devices.ComputerInfo` は .NET Framework専用の機能
- .NET Coreや.NET 5+では利用できない可能性がある
- または、プロジェクトにMicrosoft.VisualBasicへの参照が不足している

**解決策:**
```csharp
// 修正前
private long GetTotalPhysicalMemoryMB()
{
    try
    {
        var computerInfo = new Microsoft.VisualBasic.Devices.ComputerInfo();
        return (long)(computerInfo.TotalPhysicalMemory / (1024 * 1024));
    }
    catch
    {
        return 8192;
    }
}

// 修正後
private long GetTotalPhysicalMemoryMB()
{
    // デフォルト値（16GB）を返す
    // 注: より正確な値を取得するには、WMI（System.Management）を使用するか、
    // プロジェクトにMicrosoft.VisualBasic参照を追加してComputerInfoを使用します
    return 16384;
}
```

**より良い代替案:**

1. **System.Management (WMI) を使用:**
```csharp
using System.Management;

private long GetTotalPhysicalMemoryMB()
{
    try
    {
        var searcher = new ManagementObjectSearcher("SELECT TotalPhysicalMemory FROM Win32_ComputerSystem");
        foreach (var obj in searcher.Get())
        {
            var totalMemory = (ulong)obj["TotalPhysicalMemory"];
            return (long)(totalMemory / (1024 * 1024));
        }
    }
    catch
    {
        return 16384;
    }
    return 16384;
}
```

2. **P/Invoke (Windows API) を使用:**
```csharp
[DllImport("kernel32.dll")]
[return: MarshalAs(UnmanagedType.Bool)]
private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

[StructLayout(LayoutKind.Sequential)]
private struct MEMORYSTATUSEX
{
    public uint dwLength;
    public uint dwMemoryLoad;
    public ulong ullTotalPhys;
    // ... その他のフィールド
}
```

**教訓:**
- **プラットフォーム固有の機能を使用する場合は、代替手段を用意すること**
- **Microsoft.VisualBasicは.NET Frameworkに特化している - .NET Core/.NET 5+では使用しない**
- **システム情報取得には以下の方法を検討:**
  - WMI (System.Management) - Windows専用だが柔軟
  - P/Invoke - 最も高速だが複雑
  - 外部ライブラリ（Hardware.Infoなど）
  - デフォルト値（最も簡単だが不正確）

---

### XAMLとコードビハインドの問題

#### 問題6: XAMLとコードビハインドの不整合（TaskDetailWindow）

**エラー内容:**
```
CS0103: The name 'StatusLabel' does not exist in the current context
CS0103: The name 'CommentInputBox' does not exist in the current context
(その他、複数の要素名エラー)
```

**発生場所:** `TaskDetailWindow.xaml.cs`

**原因分析:**
- XAMLファイルには該当する要素が正しく定義されている
- ビルド時に自動生成される `.g.cs` ファイルが正しく生成されていない可能性
- XAMLInProcLanguageClient（XAMLエディタ）からのエラー

**解決策:**
- コード自体は正しいため、プロジェクトのクリーンビルドで解決する可能性が高い
- Visual Studioで以下を実行:
  1. `ビルド` → `ソリューションのクリーン`
  2. `ビルド` → `ソリューションのリビルド`

**教訓:**
- **XAMLの `x:Name` とコードビハインドの参照が一致していることを確認**
- **ビルドエラーが発生した場合、まずクリーンビルドを試す**
- **XAMLエディタのエラーは、実際のコンパイラエラーとは異なる場合がある**

---

#### 問題7: XAMLデザイナーエラー（XamlInProcLanguageClient）

**エラー内容:**
```
CS0103: The name 'ActivityListBox' does not exist in the current context
CS0103: The name 'StatusLabel' does not exist in the current context
（その他、TaskDetailWindow.xaml.csで複数の要素名エラー）
Tool: XamlInProcLanguageClient
```

**発生場所:** `TaskDetailWindow.xaml.cs` (複数箇所)

**原因:**
- XAMLファイルのビルド時に自動生成される `.g.cs`（generated code）ファイルが正しく生成されていない
- ビルドキャッシュ（obj/binフォルダ）に古い成果物が残っている
- Visual StudioのXAMLデザイナー/エディタのインテリセンスが正しく動作していない

**特徴:**
- XAMLファイル自体には構文エラーはない
- すべての `x:Name` 属性は正しく設定されている
- コードビハインド（.xaml.cs）のコードも正しい
- エラーの発生元が「XamlInProcLanguageClient」（Visual StudioのXAMLエディタ）

**解決策（Windows Visual Studio環境で実行）:**

1. **クリーンビルド（最も簡単）:**
   ```
   ビルド → ソリューションのクリーン
   ビルド → ソリューションのリビルド
   ```

2. **手動でビルドフォルダを削除:**
   - Visual Studio を閉じる
   - `desktop-app/TsutaAI/bin` フォルダを削除
   - `desktop-app/TsutaAI/obj` フォルダを削除
   - Visual Studio で再度開いてリビルド

3. **Visual Studio を再起動:**
   - すべてのVisual Studioプロセスを完全に終了
   - Visual Studioを再起動してソリューションを開く

**教訓:**
- **XAMLInProcLanguageClientエラーは実際のコンパイルエラーではない場合がある**
- **XAMLファイルの自動生成コード（.g.cs）はobj/Debug(Release)フォルダに生成される**
- **ビルドキャッシュの問題はクリーンビルドで解決することが多い**
- **Linux環境ではWPFアプリケーションのビルドはできない（Windows専用）**
- **XAMLデザイナーエラーはVisual Studio再起動で解消されることがある**

---

## バックエンドAPI (Node.js) のトラブルシューティング

### モジュールパスエラー

#### 問題8: backend-api モジュールパスエラー (Cannot find module)

**エラー内容:**
```
Error: Cannot find module '../config/database'
Require stack:
- F:\HANDA\repos\TsutaAI\backend-api\src\services\progressPredictionService.js
```

**発生場所:** `backend-api/src/services/progressPredictionService.js`

**原因:**
- `progressPredictionService.js`が`../config/database`を要求している
- しかし、実際のデータベースモジュールは`src/services/database.js`に存在する
- 同じ`src/services/`フォルダ内のファイルなので、相対パスは`./database`であるべき

**解決策:**
```javascript
// 修正前
const db = require('../config/database');

// 修正後
const db = require('./database');
```

**教訓:**
- **Node.jsのrequireパスは正確に指定すること**
- **相対パス指定のルール:**
  - `./` = 同じディレクトリ内のファイル
  - `../` = 1つ上の親ディレクトリ
  - `../../` = 2つ上の親ディレクトリ
- **モジュールが見つからないエラーは、まずファイル構造とrequireパスを確認**
- **エラーメッセージの"Require stack"を見れば、どのファイルからrequireされているか分かる**
- **プロジェクト構造を把握し、正しい相対パスを使用する**

**ファイル構造の確認方法:**
```
backend-api/
├── src/
│   ├── services/
│   │   ├── database.js          ← 実際のデータベースモジュール
│   │   ├── progressPredictionService.js  ← このファイルから
│   │   └── activityLogService.js
│   └── config/
│       └── env.js
```

同じ`services/`フォルダ内なので`./database`が正しいパス。

---

## 一般的なベストプラクティス

### コーディング規約

#### C# (Desktop App)
1. **プロパティ名はPascalCase、フィールド名はcamelCase（_prefixあり）**
2. **JSONプロパティには適切なアトリビュートを使用（JsonProperty、JsonPropertyName）**
3. **統一されたJSONライブラリを使用（プロジェクト全体でNewtonsoft.JsonまたはSystem.Text.Json）**

#### JavaScript/TypeScript (Web Admin / Backend API)
1. **クラス名はPascalCase、変数・関数名はcamelCase**
2. **ファイル名はkebab-case**
3. **コメントは日本語で記述**

### エラーハンドリング
1. **ログメソッドには常に例外付きオーバーロードを提供**
2. **外部APIやプラットフォーム固有の機能にはフォールバック処理を用意**
3. **try-catchブロックで適切にエラーをキャッチし、ログに記録する**

### 型の使用
1. **インターフェース型と具象型を明確に区別**
2. **IList<T> → List<T> の変換には `.ToList()` を使用**
3. **プロパティアクセスは大文字・小文字を正確に**

### プロジェクト管理
1. **依存関係を明確に文書化**
2. **プラットフォーム固有の機能は代替手段を検討**
3. **ビルドエラーが発生したら、まずクリーンビルドを試す**
4. **モジュールパスは正確に指定し、プロジェクト構造を把握する**

---

## 修正履歴

| 日付 | 対象ファイル | 修正内容 | 担当 |
|------|------------|---------|------|
| 2025-01-17 | Logger.cs | Error(string, Exception)オーバーロード追加 | Claude |
| 2025-01-17 | ApiService.cs | System.Text.Json → Newtonsoft.Json変更 | Claude |
| 2025-01-17 | HelpRequestWindow.xaml.cs | TaskItemプロパティ名修正、型変換修正 | Claude |
| 2025-01-17 | SystemPerformanceMonitor.cs | Microsoft.VisualBasic.Devices削除、デフォルト値使用 | Claude |
| 2025-01-17 | TaskDetailWindow.xaml/xaml.cs | XAMLデザイナーエラーの解決手順文書化 | Claude |
| 2025-01-17 | progressPredictionService.js | モジュールパス修正 (../config/database → ./database) | Claude |
| 2025-01-17 | projectDashboardService.js | モジュールパス修正 (../config/db → ./database) | Claude |
| 2025-01-17 | helpRequestService.js | モジュールパス修正 (../config/db → ./database) | Claude |
| 2025-01-17 | sprintService.js | モジュールパス修正 (../config/db → ./database) | Claude |
| 2025-01-17 | hourly-progress-update.js | モジュールパス修正 (../config/database → ../services/database) | Claude |

---

**最終更新日:** 2025-12-30
