# Send to Calibre

A Brave/Chrome extension that turns the current web page into a clean EPUB (using Readability, like Firefox's Reader View) and adds it to your Calibre library, tagged `articles` by default.

No build step, no dependencies: load the `extension/` folder as is.

> The extension's UI is currently in Spanish.

## 1. Set up Calibre (once)

The extension talks to Calibre's **Content Server**.

1. Calibre → **Preferences → Sharing over the net**.
2. **Main** tab: pick a port (default `8080`), check **Run server automatically when calibre starts**, and click **Start server**.
3. **Advanced** tab: enable **Allow un-authenticated local connections to make changes** (`local_write`). Without it, Calibre rejects uploads with a 403.
   - Alternative: enable **Require username and password to access the Content server**, set the authentication mode to **basic** (not *digest*), make sure the user isn't read-only, and enter the credentials in the extension's options. Username/password are ignored if the server doesn't require authentication.
4. Restart the server after changing these settings.

> Port 9090 is Calibre's "Wireless device connection", not the Content Server.

## 2. Install in Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select the `extension/` folder.
4. Pin the icon. In **Options**, click **Probar conexión** (test connection) and pick the library.

## Usage

- **Toolbar icon** → optionally edit the title and tags → **Enviar** (send).
- **Right-click → Enviar página a Calibre** (uses the default tags).
- **Alt+Shift+C** (change it at `brave://extensions/shortcuts`).

The icon badge shows ✓ or ! when done.

## What it produces

- EPUB 3 (with an NCX for older readers), with a header containing the title, author, site, date and a link to the original.
- **Table of contents** built from the article's headings, nested by level.
- **Images are embedded** in the EPUB (`OEBPS/images/`), so it reads offline. WebP/AVIF are converted to JPEG for e-reader compatibility. Images that fail to download (over 10 MB, over 15 s, or blocked) are dropped rather than left as remote links.
- Embedded videos are replaced with a "▶ Video" link.
- Cover from `og:image`, falling back to the first image.
- Metadata: title, author, publisher (site name), date, description, language, `dc:source` = URL, and tags (as `dc:subject`; also set via `/cdb/set-fields` after upload).
- If a book with the same title already exists, Calibre won't add it unless **Permitir duplicados** (allow duplicates) is enabled in Options.

## Layout

```
extension/
  manifest.json
  background.js        # orchestrates: extract → images → EPUB → upload
  content/extract.js   # runs in the page: Readability + cleanup to XHTML, headings
  lib/epub.js          # builds the EPUB (OPF, nav, NCX, TOC)
  lib/zip.js           # minimal ZIP writer (CompressionStream)
  lib/calibre.js       # Content Server client (/cdb/add-book, /cdb/set-fields)
  lib/settings.js
  popup/, options/, ui.css, icons/
  vendor/Readability.js  # @mozilla/readability 0.6.0
```

## License

[MIT](LICENSE). `extension/vendor/Readability.js` is by Mozilla and keeps its Apache 2.0 license (see the file header).
