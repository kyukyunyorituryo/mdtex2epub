
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { createEpub } from "./create-epub.js";

const ROOT = process.cwd();

// 第1引数：book.json があるフォルダー
const bookDir = path.resolve(
  ROOT,
  process.argv[2] ?? "input"
);

const config = JSON.parse(
  await fs.readFile(path.join(bookDir, "book.json"), "utf8")
);

// 入力フォルダーは book.json を基準に解決
const inputDir = path.resolve(
  bookDir,
  config.inputDir ?? "."
);

// 出力先は book.json を基準に解決
const outputFile = process.argv[3]
  ? path.resolve(ROOT, process.argv[3])
  : path.resolve(
      bookDir,
      config.outputDir ?? "output",
      config.outputFile ?? "book.epub"
    );

await fs.mkdir(path.dirname(outputFile), {
  recursive: true
});

// 表紙画像も book.json を基準に解決
const coverPath = config.cover
  ? path.resolve(bookDir, config.cover)
  : null;

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
});

md.use(texmath, {
  engine: katex,
  delimiters: ["dollars", "brackets"],
  katexOptions: {
    output: "mathml",
    throwOnError: false,
    strict: "ignore",
  },
});
/*
const testHtml = md.render(
  "インライン数式 $E=mc^2$\n\n$$\\frac{1}{2}$$"
);

console.log(testHtml);
console.log("MathMLあり:", testHtml.includes("<math"));

const markdownText = String.raw`
$$
\begin{cases}
v_{\text{a}}=\sqrt{2}V_{\text{s}}\sin \theta \\
v_{\text{b}}=\sqrt{2}V_{\text{s}}\sin (\theta -\frac{2\pi}{3})\\
v_{\text{c}}=\sqrt{2}V_{\text{s}}\sin (\theta -\frac{4\pi}{3})
\end{cases}
$$

`;
console.log(md.render(markdownText));
*/
// Markdown 内の相対画像パスを file: URL に変換する。
// epub-gen がローカル画像を取り込めるようにする。
const defaultImageRender =
  md.renderer.rules.image ??
  ((tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");

  if (
    src &&
    !/^(?:https?:|data:|file:|#)/i.test(src)
  ) {
    const sourceFile = env.sourceFile;
    const imagePath = path.resolve(
      path.dirname(sourceFile),
      decodeURIComponent(src.split("#")[0].split("?")[0])
    );

    token.attrSet("src", pathToFileURL(imagePath).href);
  }
  const html = defaultImageRender(tokens, idx, options, env, self);
  return html.replace(/>$/, ' />');

};
md.renderer.rules.hr = (tokens, idx, options, env, self) => {
  return '<hr />'; // もし別のタグ名にしたい場合は '<separator />' などに変更可能
};

function getTitle(markdown, filename) {
  const match = markdown.match(/^#\s+(.+)$/m);

  return match
    ? match[1].trim()
    : path.basename(filename, ".md");
}

function renderChapter(markdown, filename) {
  return md.render(markdown, {
    sourceFile: filename,
  });
}
const tocPath = path.join(inputDir, "TOC.md");

let filenames;

try {
  const tocMarkdown = await fs.readFile(tocPath, "utf8");

  filenames = [
    ...tocMarkdown.matchAll(
      /^\s*[-*+]\s+\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]*)?\)\s*$/gm
    ),
  ].map((match) => decodeURIComponent(match[1]));

  // TOC.md 自身は章として処理しない
  if (filenames.length === 0) {
    throw new Error("TOC.md に Markdown ファイルへのリンクがありません");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;

  // TOC.md がない場合は従来どおりファイル名順
  filenames = (await fs.readdir(inputDir))
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".md") &&
        name.toLowerCase() !== "toc.md"
    )
    .sort((a, b) => a.localeCompare(b, "en"));
}
if (filenames.length === 0) {
  throw new Error(`Markdown ファイルがありません: ${inputDir}`);
}

const chapters = [];

for (const filename of filenames) {
  const fullPath = path.join(inputDir, filename);
  const markdown = await fs.readFile(fullPath, "utf8");

  chapters.push({
    title: getTitle(markdown, filename),
    data: renderChapter(markdown, fullPath),
    filename: fullPath,
  });

  console.log(`読み込み: ${filename}`);
}
console.log("章数:", chapters.length);

for (const [i, chapter] of chapters.entries()) {
  console.log(`章${i + 1}:`, chapter.title);
  console.log("HTML文字数:", chapter.data?.length ?? 0);
  //console.log("HTML先頭:", chapter.data?.slice(0, 200));
}

try {
  await createEpub({
    title: config.title,
    author: config.author,
    chapters,
    outputPath: outputFile,
    coverPath
  });

  console.log("EPUB生成完了:", outputFile);
} catch (error) {
  console.error("EPUB生成エラー:", error);
  process.exitCode = 1;
}