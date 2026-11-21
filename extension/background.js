import { buildEpub } from "./lib/epub.js";
import { addBook, setFields, CalibreError } from "./lib/calibre.js";
import { getSettings, parseTags } from "./lib/settings.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15000;
const KEEP_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/svg+xml": "svg" };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-to-calibre",
    title: "Enviar página a Calibre",
    contexts: ["page", "selection", "link", "image"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-calibre" && tab?.id) sendTab(tab.id).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) sendTab(tab.id).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "send") return;
  sendTab(msg.tabId, { title: msg.title, tags: msg.tags })
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true; // async response
});

function progress(text) {
  chrome.runtime.sendMessage({ type: "progress", text }).catch(() => {});
}

async function badge(tabId, text, color) {
  await chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
  await chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  if (text !== "…") setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }).catch(() => {}), 6000);
}

/**
 * Extracts the article in `tabId`, builds an EPUB and uploads it to Calibre.
 * @param {number} tabId
 * @param {{title?: string, tags?: string}} [overrides]
 */
async function sendTab(tabId, overrides = {}) {
  await badge(tabId, "…", "#888");
  try {
    const settings = await getSettings();
    const tags = parseTags(overrides.tags ?? settings.tags);

    progress("Extrayendo artículo…");
    const [{ result: article } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["vendor/Readability.js", "content/extract.js"],
    });
    if (!article?.bodyXhtml) throw new Error("No pude extraer contenido de esta página.");
    if (overrides.title?.trim()) article.title = overrides.title.trim();

    progress(`Descargando ${article.images.length} imágenes…`);
    const fetched = await mapLimit(article.images, 6, fetchImage);

    const images = [];
    let bodyXhtml = article.bodyXhtml;
    fetched.forEach((img, i) => {
      const token = `__IMG_${i}__`;
      if (img) {
        const href = `images/img${i}.${img.ext}`;
        images.push({ href, mediaType: img.mediaType, data: img.data, source: article.images[i] });
        bodyXhtml = bodyXhtml.split(token).join(href);
      } else {
        bodyXhtml = bodyXhtml.replace(new RegExp(`<img[^>]*src="${token}"[^>]*/?>`, "g"), "");
      }
    });

    let coverHref = images.find((img) => img.source === article.cover)?.href;
    if (!coverHref && article.cover) {
      const c = await fetchImage(article.cover);
      if (c) {
        coverHref = `images/cover.${c.ext}`;
        images.push({ href: coverHref, mediaType: c.mediaType, data: c.data });
      }
    }
    coverHref ??= images[0]?.href;

    progress("Generando EPUB…");
    const epub = await buildEpub({ ...article, bodyXhtml, tags, images, coverHref });

    progress("Enviando a Calibre…");
    const filename = safeFilename(article.title) + ".epub";
    const added = await addBook(settings, filename, epub);
    if (!added.book_id) {
      throw new CalibreError(
        `Calibre no lo agregó: ya existe un libro titulado "${added.title}". Activá "Permitir duplicados" en las opciones o cambiá el título.`
      );
    }

    // Tags already go in the EPUB as dc:subject; set them explicitly too.
    if (tags.length) {
      try {
        await setFields(settings, added.book_id, { tags });
      } catch (e) {
        console.warn("set-fields failed", e);
      }
    }

    await badge(tabId, "✓", "#2e7d32");
    const msg = `Agregado a Calibre: "${added.title}" (id ${added.book_id})`;
    progress(msg);
    return { bookId: added.book_id, title: added.title, message: msg };
  } catch (e) {
    console.error(e);
    await badge(tabId, "!", "#c62828");
    progress(e.message);
    throw e;
  }
}

async function fetchImage(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > MAX_IMAGE_BYTES) return null;

    let type = (blob.type || res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) type = sniffType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
    if (!type) return null;

    if (KEEP_TYPES[type]) {
      return { ext: KEEP_TYPES[type], mediaType: type, data: new Uint8Array(await blob.arrayBuffer()) };
    }
    // webp/avif/etc → JPEG for e-reader compatibility.
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, bmp.width, bmp.height);
    ctx.drawImage(bmp, 0, 0);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return { ext: "jpg", mediaType: "image/jpeg", data: new Uint8Array(await jpeg.arrayBuffer()) };
  } catch {
    return null;
  }
}

function sniffType(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "";
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function safeFilename(title) {
  return (
    title
      .replace(/[\/\\:*?"<>|\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "article"
  );
}
