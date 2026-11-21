// Builds an EPUB 3 (with EPUB 2 NCX fallback) from an extracted article.
import { createZip } from "./zip.js";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CSS = `body { font-family: serif; line-height: 1.5; margin: 0 4%; }
h1.article-title { font-size: 1.6em; line-height: 1.2; margin-bottom: 0.2em; }
p.article-meta { color: #555; font-size: 0.85em; margin-top: 0; }
p.article-meta a { color: inherit; }
img { max-width: 100%; height: auto; }
figure { margin: 1em 0; }
figcaption { font-size: 0.85em; color: #555; }
pre, code { font-family: monospace; white-space: pre-wrap; word-wrap: break-word; }
blockquote { margin-left: 1em; padding-left: 0.8em; border-left: 3px solid #ccc; }
table { border-collapse: collapse; }
td, th { border: 1px solid #ccc; padding: 0.2em 0.4em; }
`;

/**
 * @param {object} a
 * @param {string} a.title
 * @param {string} [a.author]
 * @param {string} [a.lang]
 * @param {string} a.url
 * @param {string} [a.siteName]
 * @param {string} [a.published]  ISO date
 * @param {string} [a.excerpt]
 * @param {string[]} a.tags
 * @param {string} a.bodyXhtml     serialized XHTML fragment
 * @param {{href: string, mediaType: string, data: Uint8Array}[]} a.images
 * @param {string} [a.coverHref]   href of one of `images` to use as cover
 * @returns {Promise<Uint8Array>}
 */
export async function buildEpub(a) {
  const uuid = crypto.randomUUID();
  const lang = (a.lang || "en").split(/[_\s]/)[0];
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const author = a.author || a.siteName || hostOf(a.url);

  const metaLine = [
    a.author ? esc(a.author) : null,
    a.siteName ? esc(a.siteName) : null,
    a.published ? esc(a.published.slice(0, 10)) : null,
    `<a href="${esc(a.url)}">${esc(hostOf(a.url))}</a>`,
  ]
    .filter(Boolean)
    .join(" · ");

  const article = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head>
<meta charset="utf-8" />
<title>${esc(a.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
<h1 class="article-title">${esc(a.title)}</h1>
<p class="article-meta">${metaLine}</p>
${a.bodyXhtml}
</body>
</html>
`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8" /><title>${esc(a.title)}</title></head>
<body>
<nav epub:type="toc" id="toc"><ol><li><a href="article.xhtml">${esc(a.title)}</a></li></ol></nav>
</body>
</html>
`;

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:${uuid}" /></head>
<docTitle><text>${esc(a.title)}</text></docTitle>
<navMap><navPoint id="p1" playOrder="1"><navLabel><text>${esc(a.title)}</text></navLabel><content src="article.xhtml" /></navPoint></navMap>
</ncx>
`;

  const imageItems = a.images
    .map((img, i) => {
      const cover = img.href === a.coverHref ? ' properties="cover-image"' : "";
      return `<item id="img${i}" href="${esc(img.href)}" media-type="${esc(img.mediaType)}"${cover} />`;
    })
    .join("\n    ");
  const coverIdx = a.images.findIndex((img) => img.href === a.coverHref);

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${esc(a.title)}</dc:title>
    <dc:creator>${esc(author)}</dc:creator>
    <dc:language>${esc(lang)}</dc:language>
    <dc:source>${esc(a.url)}</dc:source>
    ${a.siteName ? `<dc:publisher>${esc(a.siteName)}</dc:publisher>` : ""}
    ${a.published ? `<dc:date>${esc(a.published)}</dc:date>` : ""}
    ${a.excerpt ? `<dc:description>${esc(a.excerpt)}</dc:description>` : ""}
    ${a.tags.map((t) => `<dc:subject>${esc(t)}</dc:subject>`).join("\n    ")}
    <meta property="dcterms:modified">${modified}</meta>
    ${coverIdx >= 0 ? `<meta name="cover" content="img${coverIdx}" />` : ""}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="css" href="style.css" media-type="text/css" />
    <item id="article" href="article.xhtml" media-type="application/xhtml+xml" />
    ${imageItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="article" />
  </spine>
</package>
`;

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>
`;

  return createZip([
    { name: "mimetype", data: "application/epub+zip", store: true },
    { name: "META-INF/container.xml", data: container },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/toc.ncx", data: ncx },
    { name: "OEBPS/style.css", data: CSS },
    { name: "OEBPS/article.xhtml", data: article },
    ...a.images.map((img) => ({ name: `OEBPS/${img.href}`, data: img.data, store: true })),
  ]);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
