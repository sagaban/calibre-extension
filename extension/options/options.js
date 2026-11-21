import { DEFAULTS, getSettings } from "../lib/settings.js";
import { libraryInfo } from "../lib/calibre.js";

const $ = (id) => document.getElementById(id);
const FIELDS = Object.keys(DEFAULTS);

function read() {
  const s = {};
  for (const k of FIELDS) s[k] = $(k).type === "checkbox" ? $(k).checked : $(k).value.trim();
  s.serverUrl ||= DEFAULTS.serverUrl;
  return s;
}

function ensureOption(value, label = value) {
  if (!value || [...$("libraryId").options].some((o) => o.value === value)) return;
  $("libraryId").add(new Option(label, value));
}

const setStatus = (text, kind = "") => {
  $("status").textContent = text;
  $("status").className = `status ${kind}`;
};

const s = await getSettings();
ensureOption(s.libraryId);
for (const k of FIELDS) {
  if ($(k).type === "checkbox") $(k).checked = s[k];
  else $(k).value = s[k];
}

$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set(read());
  setStatus("Guardado.", "ok");
});

$("test").addEventListener("click", async () => {
  setStatus("Conectando…");
  try {
    const info = await libraryInfo(read());
    for (const [id, name] of Object.entries(info.library_map ?? {})) ensureOption(id, name);
    const names = Object.values(info.library_map ?? {}).join(", ");
    setStatus(`Conectado. Bibliotecas: ${names}. Predeterminada: ${info.default_library}`, "ok");
  } catch (e) {
    setStatus(e.message, "err");
  }
});
