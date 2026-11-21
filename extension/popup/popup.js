import { getSettings } from "../lib/settings.js";

const $ = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const settings = await getSettings();
$("title").value = tab?.title ?? "";
$("tags").value = settings.tags;

const setStatus = (text, kind = "") => {
  $("status").textContent = text;
  $("status").className = `status ${kind}`;
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "progress") setStatus(msg.text);
});

$("send").addEventListener("click", async () => {
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) {
    setStatus("Esta página no se puede enviar.", "err");
    return;
  }
  $("send").disabled = true;
  setStatus("Procesando…");
  const res = await chrome.runtime.sendMessage({
    type: "send",
    tabId: tab.id,
    title: $("title").value,
    tags: $("tags").value,
  });
  $("send").disabled = false;
  setStatus(res.ok ? res.message : res.error, res.ok ? "ok" : "err");
});

$("options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
