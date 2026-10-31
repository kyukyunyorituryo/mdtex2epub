# mdtex2epub

**Markdown and LaTeX to EPUB converter for Node.js**

`mdtex2epub` は、MarkdownとLaTeXで記述した原稿からEPUB電子書籍を生成するNode.js製のツールです。

数式、表、SVG、画像などを含む技術書や学習参考書のEPUB化を目的としています。

## Features

- MarkdownファイルからEPUBを生成
- LaTeX形式の数式に対応（KaTeX）
- Markdownの表に対応
- SVG画像などの画像ファイルに対応
- 表紙画像の設定
- EPUBの目次を生成
- 複数の書籍を個別の設定ファイルで管理
- 変換プログラムと原稿を別のフォルダーに配置可能
- JavaScriptによるEPUBファイルの生成（JSZip）

## Requirements

- Node.js
- npm

## Installation

リポジトリを取得します。

```bash
git clone https://github.com/kyukyunyorituryo/mdtex2epub.git
cd mdtex2epub
```

依存パッケージをインストールします。

```bash
npm install
```

※ 実際の公開リポジトリのURLに合わせてください。

## Directory structure

複数の書籍を管理できるように、変換プログラムと原稿を分離した構成にしています。

```text
md-tex-epub/
├── convert.mjs
├── create-epub.js
├── package.json
├── package-lock.json
│
└── output/
    ├── denryoku.epub
    └── riron.epub

epub-books/
├── denryoku/
│   ├── book.json
│   ├── TOC.md
│   ├── 01.md
│   ├── 02.md
│   └── cover.png
│
└── riron/
    ├── book.json
    ├── TOC.md
    ├── 01.md
    └── cover.png
```

原稿フォルダーは `md-tex-epub` の外側に置くこともできます。

各書籍のフォルダーに `book.json` を配置し、書籍ごとの設定や原稿を管理します。

## Configuration

各書籍のフォルダーにある `book.json` で設定します。

例：`epub-books/denryoku/book.json`

```json
{
  "title": "電験三種 過去問題と解き方",
  "author": "急急如律令",
  "inputDir": ".",
  "outputDir": "../../md-tex-epub/output",
  "outputFile": "denryoku.epub",
  "cover": "./cover.png"
}
```

| 設定項目 | 説明 |
|---|---|
| `title` | 書籍タイトル |
| `author` | 著者名 |
| `inputDir` | Markdown原稿のフォルダー |
| `outputDir` | EPUBの出力先 |
| `outputFile` | EPUBファイル名 |
| `cover` | 表紙画像のパス |

パスは `book.json` が配置されているフォルダーを基準に指定します。

`inputDir` と `cover` は省略可能です。省略した場合、入力フォルダーは書籍フォルダー、表紙はなしとして扱います。

## Usage

`md-tex-epub` のフォルダーで実行します。

### EPUBを生成する

```bash
node convert.mjs "../epub-books/denryoku"
```

指定した書籍フォルダーの `book.json` を読み込み、EPUBを生成します。

### 出力先を指定する

```bash
node convert.mjs "../epub-books/denryoku" "./output/denryoku.epub"
```

第2引数で出力先を指定できます。

### 別の書籍を変換する

```bash
node convert.mjs "../epub-books/riron"
```

書籍ごとにフォルダーを指定するだけで、別のEPUBを生成できます。

## Writing Markdown

原稿はMarkdown形式で作成します。

数式はLaTeX形式で記述できます。

インライン数式：

```markdown
電圧 $V$ と電流 $I$ の関係は次のとおりです。
```

ブロック数式：

```markdown
$$
P = VI
$$
```

表：

```markdown
| 項目 | 値 |
|---|---:|
| 電圧 | 100 V |
| 電流 | 10 A |
| 電力 | 1000 W |
```

画像：

```markdown
![回路図](images/circuit.svg)
```

画像ファイルは原稿から参照できる場所に配置します。

## License

ライセンスについては、公開時に設定してください。