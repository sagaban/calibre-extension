export const DEFAULTS = {
  serverUrl: "http://localhost:8080",
  libraryId: "",
  tags: "articles",
  username: "",
  password: "",
  allowDuplicates: false,
};

export async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
}

export function parseTags(s) {
  return String(s || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
