# C# 7.3 / .NET Framework 4.8 互換性ガイドライン

このプロジェクトは **C# 7.3** および **.NET Framework 4.8** を使用しています。
以下の新しい構文や機能は使用できません。このドキュメントでは、使用禁止の機能と代替方法を示します。

---

## 目次
1. [C# 8.0 の新機能（使用禁止）](#c-80-の新機能使用禁止)
2. [C# 9.0 の新機能（使用禁止）](#c-90-の新機能使用禁止)
3. [C# 10.0 以降の新機能（使用禁止）](#c-100-以降の新機能使用禁止)
4. [XAML の新機能（使用禁止）](#xaml-の新機能使用禁止)
5. [推奨される書き方](#推奨される書き方)

---

## C# 8.0 の新機能（使用禁止）

### ❌ 1. Switch Expressions（Switch式）

**NG例（C# 8.0）:**
```csharp
public string GetStatusLabel(string status) => status switch
{
    "not-started" => "未着手",
    "in-progress" => "進行中",
    "done" => "完了",
    _ => "不明"
};
```

**OK例（C# 7.3）:**
```csharp
public string GetStatusLabel(string status)
{
    switch (status)
    {
        case "not-started":
            return "未着手";
        case "in-progress":
            return "進行中";
        case "done":
            return "完了";
        default:
            return "不明";
    }
}
```

---

### ❌ 2. Null-coalescing Assignment（Null合体代入演算子）

**NG例（C# 8.0）:**
```csharp
public void Initialize()
{
    _cache ??= new Dictionary<string, object>();
    _logger ??= new Logger();
}
```

**OK例（C# 7.3）:**
```csharp
public void Initialize()
{
    if (_cache == null)
    {
        _cache = new Dictionary<string, object>();
    }

    if (_logger == null)
    {
        _logger = new Logger();
    }
}
```

または三項演算子を使用:
```csharp
_cache = _cache ?? new Dictionary<string, object>();
_logger = _logger ?? new Logger();
```

---

### ❌ 3. Using Declarations（Using宣言）

**NG例（C# 8.0）:**
```csharp
public void WriteToFile(string path, string content)
{
    using var writer = new StreamWriter(path);
    writer.WriteLine(content);
    // スコープ終了時に自動的にDisposeされる
}
```

**OK例（C# 7.3）:**
```csharp
public void WriteToFile(string path, string content)
{
    using (var writer = new StreamWriter(path))
    {
        writer.WriteLine(content);
    } // ここでDisposeされる
}
```

---

### ❌ 4. Nullable Reference Types（Null許容参照型）

**NG例（C# 8.0）:**
```csharp
#nullable enable
public class User
{
    public string Name { get; set; }      // 非Null
    public string? Email { get; set; }    // Null許容
}
```

**OK例（C# 7.3）:**
```csharp
public class User
{
    public string Name { get; set; }      // 通常の参照型
    public string Email { get; set; }     // 通常の参照型

    // Null安全性はコード内で明示的にチェック
    public bool IsEmailValid()
    {
        return !string.IsNullOrEmpty(Email);
    }
}
```

---

### ❌ 5. Range と Index 演算子

**NG例（C# 8.0）:**
```csharp
string[] names = { "Alice", "Bob", "Charlie", "David" };
var lastTwo = names[^2..];      // 最後の2つ
var first = names[0];
var last = names[^1];           // 最後の要素
```

**OK例（C# 7.3）:**
```csharp
string[] names = { "Alice", "Bob", "Charlie", "David" };
var lastTwo = names.Skip(names.Length - 2).ToArray();
var first = names[0];
var last = names[names.Length - 1];
```

---

### ❌ 6. Default Interface Methods（デフォルトインターフェイスメソッド）

**NG例（C# 8.0）:**
```csharp
public interface ILogger
{
    void Log(string message);

    // デフォルト実装
    void LogError(string message) => Log($"ERROR: {message}");
}
```

**OK例（C# 7.3）:**
```csharp
public interface ILogger
{
    void Log(string message);
    void LogError(string message);
}

// 抽象基底クラスを使用
public abstract class LoggerBase : ILogger
{
    public abstract void Log(string message);

    public virtual void LogError(string message)
    {
        Log($"ERROR: {message}");
    }
}
```

---

### ❌ 7. Pattern Matching の拡張

**NG例（C# 8.0）:**
```csharp
public string GetDescription(object obj) => obj switch
{
    int i when i > 0 => "Positive number",
    string s when s.Length > 0 => "Non-empty string",
    null => "Null value",
    _ => "Other"
};
```

**OK例（C# 7.3）:**
```csharp
public string GetDescription(object obj)
{
    if (obj is int i && i > 0)
    {
        return "Positive number";
    }
    else if (obj is string s && s.Length > 0)
    {
        return "Non-empty string";
    }
    else if (obj == null)
    {
        return "Null value";
    }
    else
    {
        return "Other";
    }
}
```

---

## C# 9.0 の新機能（使用禁止）

### ❌ 1. Target-typed New Expressions（ターゲット型指定new式）

**NG例（C# 9.0）:**
```csharp
List<string> names = new();
Dictionary<string, int> ages = new();
Point p = new(10, 20);
```

**OK例（C# 7.3）:**
```csharp
List<string> names = new List<string>();
Dictionary<string, int> ages = new Dictionary<string, int>();
Point p = new Point(10, 20);
```

---

### ❌ 2. Init-only Setters（init専用セッター）

**NG例（C# 9.0）:**
```csharp
public class Person
{
    public string Name { get; init; }
    public int Age { get; init; }
}

var person = new Person { Name = "Alice", Age = 30 };
// person.Name = "Bob"; // コンパイルエラー
```

**OK例（C# 7.3）:**
```csharp
public class Person
{
    public string Name { get; private set; }
    public int Age { get; private set; }

    public Person(string name, int age)
    {
        Name = name;
        Age = age;
    }
}

var person = new Person("Alice", 30);
```

---

### ❌ 3. Records（レコード型）

**NG例（C# 9.0）:**
```csharp
public record Person(string Name, int Age);

var person1 = new Person("Alice", 30);
var person2 = person1 with { Age = 31 };
```

**OK例（C# 7.3）:**
```csharp
public class Person
{
    public string Name { get; }
    public int Age { get; }

    public Person(string name, int age)
    {
        Name = name;
        Age = age;
    }

    public Person WithAge(int age)
    {
        return new Person(Name, age);
    }

    public override bool Equals(object obj)
    {
        if (obj is Person other)
        {
            return Name == other.Name && Age == other.Age;
        }
        return false;
    }

    public override int GetHashCode()
    {
        return (Name, Age).GetHashCode();
    }
}
```

---

### ❌ 4. Top-level Statements（トップレベルステートメント）

**NG例（C# 9.0）:**
```csharp
// Program.cs
using System;

Console.WriteLine("Hello World!");
```

**OK例（C# 7.3）:**
```csharp
using System;

namespace MyApplication
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.WriteLine("Hello World!");
        }
    }
}
```

---

## C# 10.0 以降の新機能（使用禁止）

### ❌ 1. Global Using Directives（グローバルusing）

**NG例（C# 10.0）:**
```csharp
// GlobalUsings.cs
global using System;
global using System.Collections.Generic;
global using System.Linq;
```

**OK例（C# 7.3）:**
```csharp
// 各ファイルで必要なusingを明示的に記述
using System;
using System.Collections.Generic;
using System.Linq;
```

---

### ❌ 2. File-scoped Namespace（ファイルスコープ名前空間）

**NG例（C# 10.0）:**
```csharp
namespace MyApp.Services;

public class MyService
{
    // ...
}
```

**OK例（C# 7.3）:**
```csharp
namespace MyApp.Services
{
    public class MyService
    {
        // ...
    }
}
```

---

### ❌ 3. Record Structs（レコード構造体）

**NG例（C# 10.0）:**
```csharp
public record struct Point(int X, int Y);
```

**OK例（C# 7.3）:**
```csharp
public struct Point
{
    public int X { get; }
    public int Y { get; }

    public Point(int x, int y)
    {
        X = x;
        Y = y;
    }
}
```

---

### ❌ 4. Required Members（必須メンバー）

**NG例（C# 11.0）:**
```csharp
public class Person
{
    public required string Name { get; init; }
    public required int Age { get; init; }
}
```

**OK例（C# 7.3）:**
```csharp
public class Person
{
    public string Name { get; }
    public int Age { get; }

    public Person(string name, int age)
    {
        if (name == null)
            throw new ArgumentNullException(nameof(name));

        Name = name;
        Age = age;
    }
}
```

---

### ❌ 5. Raw String Literals（生文字列リテラル）

**NG例（C# 11.0）:**
```csharp
string json = """
{
    "name": "Alice",
    "age": 30
}
""";
```

**OK例（C# 7.3）:**
```csharp
string json = "{\n" +
              "    \"name\": \"Alice\",\n" +
              "    \"age\": 30\n" +
              "}";

// または @文字列を使用
string json = @"{
    ""name"": ""Alice"",
    ""age"": 30
}";
```

---

## XAML の新機能（使用禁止）

### ❌ 1. x:Bind（コンパイル時バインディング）

**NG例（.NET Core 3.0+）:**
```xml
<TextBlock Text="{x:Bind ViewModel.UserName}" />
```

**OK例（.NET Framework 4.8）:**
```xml
<TextBlock Text="{Binding UserName}" />
```

---

### ❌ 2. Nullable Reference Types in XAML

**NG例（.NET 5.0+）:**
```xml
<TextBlock Text="{Binding UserName!}" />
```

**OK例（.NET Framework 4.8）:**
```xml
<TextBlock Text="{Binding UserName}" />
```

---

## 推奨される書き方

### ✅ 1. 明示的な型宣言を使用

```csharp
// OK
List<string> names = new List<string>();
Dictionary<string, int> ages = new Dictionary<string, int>();

// NG
var names = new List<string>();  // これは許容されますが、明示的な方が推奨
```

---

### ✅ 2. 従来のswitch文を使用

```csharp
// OK
switch (value)
{
    case "A":
        return 1;
    case "B":
        return 2;
    default:
        return 0;
}
```

---

### ✅ 3. null チェックは明示的に

```csharp
// OK
if (obj == null)
{
    obj = new Object();
}

// または
obj = obj ?? new Object();
```

---

### ✅ 4. using ステートメントは波括弧付きで

```csharp
// OK
using (var stream = File.OpenRead(path))
{
    // 処理
}
```

---

### ✅ 5. 完全な名前空間宣言

```csharp
// OK
namespace MyApp.Services
{
    public class MyService
    {
        // ...
    }
}
```

---

## チェックリスト

コードレビュー時に以下の点を確認してください：

- [ ] Switch式を使用していないか
- [ ] `??=` 演算子を使用していないか
- [ ] `using var` を使用していないか
- [ ] Target-typed new (`new()`) を使用していないか
- [ ] `init` セッターを使用していないか
- [ ] `record` 型を使用していないか
- [ ] Global using を使用していないか
- [ ] File-scoped namespace を使用していないか
- [ ] Range/Index 演算子 (`^`, `..`) を使用していないか
- [ ] Raw string literals (`"""`) を使用していないか
- [ ] Nullable reference types (`string?`) を使用していないか
- [ ] `required` キーワードを使用していないか

---

## 参考資料

- [C# 7.3 の新機能](https://docs.microsoft.com/ja-jp/dotnet/csharp/whats-new/csharp-7-3)
- [.NET Framework 4.8 リリースノート](https://docs.microsoft.com/ja-jp/dotnet/framework/whats-new/)
- [C# バージョンと .NET 実装の対応表](https://docs.microsoft.com/ja-jp/dotnet/csharp/language-reference/configure-language-version)

---

## バージョン情報

- **対象 C# バージョン**: 7.3
- **対象 .NET バージョン**: .NET Framework 4.8
- **最終更新日**: 2025-01-06
- **作成者**: TsutaAI Development Team

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-01-06 | 初版作成 |

