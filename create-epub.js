
import JSZip from "jszip";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// KaTeXのMathMLに名前空間がなければ追加する。
// 日本語本文の文字は数値文字参照に変換しない。
function prepareMathML(html) {
  return html
    // インライン数式
    .replace(/<\/?eq>/g, (tag) =>
      tag.startsWith("</") ? "</span>" : '<span class="equation-inline">'
    )
    // ブロック数式
    .replace(/<\/?eqn>/g, (tag) =>
      tag.startsWith("</") ? "</span>" : '<span class="equation-display">'
    )
    // ブロック数式を囲むsectionを除去
    .replace(/<\/?section\b[^>]*>/gi, "")
    .replace(/(<(?:mtable|mtd)\b[^>]*?)\s+width="[^"]*"/g, "$1")
    // MathMLの名前空間を補う
    .replace(
      /<math\b(?![^>]*\bxmlns\s*=)([^>]*)>/g,
      '<math xmlns="http://www.w3.org/1998/Math/MathML"$1>'
    );
}
function makeCoverXhtml(imageHref) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}"
      xmlns:epub="http://www.idpf.org/2007/ops"
      lang="ja" xml:lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>表紙</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      text-align: center;
    }
    img {
      display: block;
      width: 100%;
      height: 100vh;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div epub:type="cover">
    <img src="${escapeXml(imageHref)}" alt="表紙"/>
  </div>
</body>
</html>`;
}
const imageMimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function addImages(zip, html, sourceFile, imageMap) {
  if (!sourceFile) {
    if (/<img\b/i.test(html)) {
      throw new Error("画像を含む章に filename が指定されていません");
    }
    return html;
  }

  const sourceDir = path.dirname(path.resolve(sourceFile));

  // img タグを順番に処理
  const imgRegex = /<img\b[^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];

  for (const match of matches) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);

    if (!srcMatch) continue;

    const originalSrc = srcMatch[2];

    // Web画像、data URI、ページ内参照はそのまま残す
    if (/^(?:https?:|data:|#)/i.test(originalSrc)) {
      continue;
    }

    // クエリとフラグメントを分離
    const suffixIndex = originalSrc.search(/[?#]/);
    const rawPath =
      suffixIndex < 0 ? originalSrc : originalSrc.slice(0, suffixIndex);
    const suffix =
      suffixIndex < 0 ? "" : originalSrc.slice(suffixIndex);

    let fullPath;

    if (/^file:/i.test(rawPath)) {
      fullPath = fileURLToPath(rawPath);
    } else {
      let decodedPath;

      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        decodedPath = rawPath;
      }

      fullPath = path.resolve(sourceDir, decodedPath);
    }

    fullPath = path.resolve(fullPath);

    // 同じ画像は EPUB 内で再利用
    let image = imageMap.get(fullPath);

    if (!image) {
      const ext = path.extname(fullPath).toLowerCase();
      const mediaType = imageMimeTypes[ext];

      if (!mediaType) {
        throw new Error(`未対応の画像形式です: ${fullPath}`);
      }

      const number = imageMap.size + 1;
      const filename = `image${String(number).padStart(4, "0")}${ext}`;
      const href = `images/${filename}`;

      const data = await readFile(fullPath);

      zip.file(`EPUB/${href}`, data);

      image = {
        relativePath: originalSrc,
        fullPath,
        href,
        mediaType,
      };

      imageMap.set(fullPath, image);
    }

    // XHTML からは EPUB 内の相対パスを参照
    const newSrc = `../${image.href}${suffix}`;
    const escapedSrc = newSrc
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");

    const newImgTag = imgTag
      .replace(srcMatch[0], `src="${escapedSrc}"`)
      .replace(/\s*\/?>$/, " />");

    html = html.replace(imgTag, newImgTag);
  }

  return html;
}

function makeXhtml(title, html) {
  const body = prepareMathML(html);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}"
      xmlns:epub="http://www.idpf.org/2007/ops"
      lang="ja" xml:lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/book.css"/>
</head>
<body>
${body}
</body>
</html>`;
}

function makeNav(chapters) {
  const items = chapters.map((chapter, i) => {
    const href = `text/chapter${String(i + 1).padStart(3, "0")}.xhtml`;
    return `<li><a href="${href}">${escapeXml(chapter.title)}</a></li>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}"
      xmlns:epub="http://www.idpf.org/2007/ops"
      lang="ja" xml:lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>目次</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目次</h1>
    <ol>
      ${items}
    </ol>
  </nav>
</body>
</html>`;
}

function makeOpf({ title, author, identifier, chapters, imageItems }) {
  const manifest = [
    `<item id="nav" href="nav.xhtml"
      media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="styles/book.css" media-type="text/css"/>`,
    ...(imageItems.some(image => image.isCover) ? [
  `<item id="cover-page" href="cover.xhtml"
    media-type="application/xhtml+xml"/>`,
] : []),
...chapters.map((chapter, i) => {
  const n = String(i + 1).padStart(3, "0");
  const hasMathML = /<math\b/i.test(chapter.data);

  return `<item id="chapter${n}" href="text/chapter${n}.xhtml"
    media-type="application/xhtml+xml"${hasMathML ? ' properties="mathml"' : ""}/>`;
}),
...imageItems.map((image, i) => `
  <item id="image${i + 1}"
    href="${escapeXml(image.href)}"
    media-type="${escapeXml(image.mediaType)}"${image.isCover ? ' properties="cover-image"' : ""}/>
`),
  ].join("\n");

const hasCover = imageItems.some(image => image.isCover);

const spine = [
  ...(hasCover ? ['<itemref idref="cover-page"/>'] : []),
  ...chapters.map((_, i) => {
    const n = String(i + 1).padStart(3, "0");
    return `<itemref idref="chapter${n}"/>`;
  }),
].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         version="3.0" unique-identifier="book-id" xml:lang="ja"
         prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>ja</dc:language>
    <meta property="dcterms:modified">${new Date()
      .toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;
}

export async function createEpub({
  chapters,
  outputPath,
  title = "技術書",
  author = "著者",
  identifier = `urn:uuid:${randomUUID()}`,
  coverPath
}) {
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error("chapters に1章以上指定してください。");
  }

  const zip = new JSZip();

  // EPUB仕様：mimetypeを先頭に置き、圧縮しない。
  zip.file("mimetype", "application/epub+zip", {
    compression: "STORE",
  });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0"
 xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  zip.file(
    "EPUB/styles/book.css",
    `
body {
  font-family: serif;
  line-height: 1.75;
  margin: 4%;
  overflow-wrap: break-word;
}

h1, h2, h3, h4 {
  line-height: 1.4;
  page-break-after: avoid;
  break-after: avoid;
}

h1 {
  font-size: 1.6em;
  margin-top: 0;
}

h2 {
  font-size: 1.3em;
  margin-top: 1.8em;
}

p {
  margin: 0.7em 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.9em;
}

th, td {
  border: 1px solid #888;
  padding: 0.35em;
  text-align: center;   /* 左右の中央寄せ */
  vertical-align: middle; /* 上下の中央寄せ */
}

th {
  font-weight: bold;
}

img, svg {
  max-width: 100%;
  height: auto;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.katex-display {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}

blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 3px solid #888;
}
`,
  );

  const imageMap = new Map();
if (coverPath) {
  coverPath = path.resolve(coverPath);

  const ext = path.extname(coverPath).toLowerCase();
  const mediaType = imageMimeTypes[ext];

  if (!mediaType) {
    throw new Error(`未対応の表紙画像形式です: ${coverPath}`);
  }

  const href = `images/cover${ext}`;
  const data = await readFile(coverPath);

  zip.file(`EPUB/${href}`, data);

  imageMap.set(coverPath, {
    fullPath: coverPath,
    href,
    mediaType,
    isCover: true,
  });

  zip.file(
    "EPUB/cover.xhtml",
    makeCoverXhtml(href)
  );
}
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const n = String(i + 1).padStart(3, "0");

    const html = await addImages(
      zip,
      chapter.data,
      chapter.filename,
      imageMap
    );

    zip.file(
      `EPUB/text/chapter${n}.xhtml`,
      makeXhtml(chapter.title, html)
    );
  }

  const imageItems = [...imageMap.values()];

  zip.file("EPUB/nav.xhtml", makeNav(chapters));

  zip.file(
    "EPUB/package.opf",
    makeOpf({
      title,
      author,
      identifier,
      chapters,
      imageItems,
    })
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await writeFile(outputPath, buffer);
  console.log(`EPUBを生成しました: ${path.resolve(outputPath)}`);
}
