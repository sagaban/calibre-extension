// Calibre Content Server API client.

export class CalibreError extends Error {}

function base(settings) {
  return settings.serverUrl.replace(/\/+$/, "");
}

function headers(settings, extra = {}) {
  const h = { ...extra };
  if (settings.username) {
    h.Authorization = "Basic " + btoa(unescape(encodeURIComponent(`${settings.username}:${settings.password}`)));
  }
  return h;
}

function libSuffix(settings) {
  return settings.libraryId ? "/" + encodeURIComponent(settings.libraryId) : "";
}

async function request(settings, path, init = {}) {
  let res;
  try {
    res = await fetch(base(settings) + path, {
      ...init,
      headers: headers(settings, init.headers),
      credentials: "omit",
    });
  } catch {
    throw new CalibreError(
      `No pude conectar con Calibre en ${settings.serverUrl}. ¿Está corriendo el Content Server? (Preferencias → Compartir por la red → Iniciar servidor)`
    );
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    if (settings.username && /anonymous/i.test(body)) {
      throw new CalibreError(
        `Calibre ignoró el usuario/contraseña porque el servidor no tiene la autenticación activada. Activá "Requerir usuario y contraseña" (modo basic) en Compartir por la red y reiniciá el servidor, o borrá el usuario acá y activá "Permitir que conexiones locales sin autenticar hagan cambios" (Avanzado).`
      );
    }
    throw new CalibreError(
      `Calibre rechazó la escritura (${res.status}). Activá "Permitir que conexiones locales sin autenticar hagan cambios" en Compartir por la red → Avanzado, o configurá usuario/contraseña con autenticación Basic. ${body.slice(0, 200)}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CalibreError(`Calibre respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export function libraryInfo(settings) {
  return request(settings, "/ajax/library-info");
}

/** Uploads an EPUB. Returns {book_id?, title, authors, ...}. */
export function addBook(settings, filename, bytes) {
  const jobId = Date.now() % 1e9;
  const dup = settings.allowDuplicates ? "y" : "n";
  return request(settings, `/cdb/add-book/${jobId}/${dup}/${encodeURIComponent(filename)}${libSuffix(settings)}`, {
    method: "POST",
    body: bytes,
  });
}

export function setFields(settings, bookId, changes) {
  return request(settings, `/cdb/set-fields/${bookId}${libSuffix(settings)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes, loaded_book_ids: [bookId] }),
  });
}
