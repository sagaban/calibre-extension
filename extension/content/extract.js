// Injected into the page after vendor/Readability.js. The value of the last
// expression is returned to chrome.scripting.executeScript.
(() => {
  const meta = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
      const v = el?.getAttribute("content")?.trim();
      if (v) return v;
    }
    return "";
  };

  // Record the image the browser actually picked (resolves srcset/<picture>),
  // so it survives cloning + Readability.
  const STAMP = "data-calibre-src";
  for (const img of document.images) {
    const cur = img.currentSrc || img.src;
    if (cur && !cur.startsWith("data:")) img.setAttribute(STAMP, cur);
  }
  const clone = document.cloneNode(true);
  for (const img of document.querySelectorAll(`img[${STAMP}]`)) img.removeAttribute(STAMP);

  // Readability drops elements whose class matches "header" etc. as page
  // chrome; that kills real section headings (e.g. Substack's
  // "header-anchor-post"). Headings don't need their classes.
  clone.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => h.removeAttribute("class"));

  const parsed = new Readability(clone, { keepClasses: false }).parse();

  // Fallback: whole body if Readability can't find an article.
  const html = parsed?.content || document.body.innerHTML;
  const doc = document.implementation.createHTMLDocument("");
  const base = doc.createElement("base");
  base.href = document.baseURI;
  doc.head.append(base);
  doc.body.innerHTML = html;
  const root = doc.body;

  // Embedded videos/iframes can't play in an e-reader: keep a link instead.
  root.querySelectorAll("iframe[src], video[src]").forEach((el) => {
    const src = el.getAttribute("src").replace(/^\/\//, "https://");
    const yt = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/);
    const href = yt ? `https://www.youtube.com/watch?v=${yt[1]}` : src;
    const p = doc.createElement("p");
    const a = doc.createElement("a");
    a.href = href;
    a.textContent = `▶ Video: ${href}`;
    p.append(a);
    el.replaceWith(p);
  });

  root.querySelectorAll("script, style, noscript, iframe, object, embed, form, input, button, select, textarea, svg, video, audio, canvas, link, meta").forEach((el) => el.remove());

  // <picture>: keep only the <img>.
  root.querySelectorAll("picture").forEach((pic) => {
    const img = pic.querySelector("img");
    if (img) pic.replaceWith(img);
    else pic.remove();
  });

  const abs = (u) => {
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return null;
    }
  };

  // srcset parser per the HTML spec: URLs may contain commas (e.g. Substack's
  // "w_1456,c_limit,f_auto/..."), so candidates split on whitespace + descriptor.
  const parseSrcset = (s) => {
    const out = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      let start = i;
      while (i < s.length && !/\s/.test(s[i])) i++;
      let url = s.slice(start, i);
      let desc = "";
      if (url.endsWith(",")) {
        url = url.replace(/,+$/, "");
      } else {
        start = i;
        while (i < s.length && s[i] !== ",") i++;
        desc = s.slice(start, i).trim();
        i++;
      }
      if (url) out.push({ u: url, w: parseFloat(desc) || 1 });
    }
    return out;
  };

  const pickSrc = (img) => {
    const stamped = img.getAttribute(STAMP);
    if (stamped) return stamped;
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    if (lazy) return lazy;
    const src = img.getAttribute("src");
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    if (srcset) {
      const best = parseSrcset(srcset).sort((x, y) => y.w - x.w)[0];
      if (best && (!src || src.startsWith("data:") || best.w > 1)) return best.u;
    }
    return src;
  };

  const images = [];
  const seen = new Map();
  root.querySelectorAll("img").forEach((img) => {
    const url = abs(pickSrc(img) || "");
    if (!url || !/^(https?|data):/.test(url)) {
      img.remove();
      return;
    }
    let id = seen.get(url);
    if (id === undefined) {
      id = images.length;
      seen.set(url, id);
      images.push(url);
    }
    for (const attr of [...img.attributes]) {
      if (!["alt", "title", "width", "height"].includes(attr.name)) img.removeAttribute(attr.name);
    }
    img.setAttribute("src", `__IMG_${id}__`);
    if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
  });

  // Make links absolute; drop attributes that aren't valid XML names or are handlers.
  const validName = /^[A-Za-z_][\w.-]*$/;
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (!validName.test(attr.name) || attr.name.startsWith("on") || attr.name === "style") {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A" && el.getAttribute("href")) {
      const href = el.getAttribute("href");
      if (!href.startsWith("#")) {
        const u = abs(href);
        if (u) el.setAttribute("href", u);
        else el.removeAttribute("href");
      }
    }
  });

  // Headings → table of contents entries (need unique, XML-valid ids).
  const usedIds = new Set();
  const headings = [];
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h, i) => {
    const text = h.textContent.replace(/\s+/g, " ").trim();
    if (!text) return;
    let id = h.getAttribute("id");
    if (!id || !/^[A-Za-z_][\w.-]*$/.test(id) || usedIds.has(id)) id = `toc-${i}`;
    usedIds.add(id);
    h.setAttribute("id", id);
    headings.push({ level: Number(h.tagName[1]), id, text });
  });

  const serializer = new XMLSerializer();
  const bodyXhtml = [...root.childNodes].map((n) => serializer.serializeToString(n)).join("");

  const cover = meta("og:image", "twitter:image", "og:image:url");

  return {
    url: location.href,
    title: (parsed?.title || meta("og:title") || document.title || location.hostname).trim(),
    author: (parsed?.byline || meta("author", "article:author") || "").trim(),
    siteName: (parsed?.siteName || meta("og:site_name") || "").trim(),
    lang: (parsed?.lang || document.documentElement.lang || "").trim(),
    published: (parsed?.publishedTime || meta("article:published_time", "datePublished") || "").trim(),
    excerpt: (parsed?.excerpt || meta("description", "og:description") || "").trim(),
    bodyXhtml,
    headings,
    images,
    cover: cover ? abs(cover) : null,
  };
})();
