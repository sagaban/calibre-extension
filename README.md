# Send to Calibre

Extensión para Brave/Chrome que convierte la página actual en un EPUB limpio (con Readability, como el modo lectura de Firefox) y lo agrega a tu biblioteca de Calibre con la etiqueta `articles`.

Sin build ni dependencias: la carpeta `extension/` se carga tal cual.

## 1. Preparar Calibre (una sola vez)

La extensión habla con el **Content Server** de Calibre.

1. Calibre → **Preferencias → Compartir por la red**.
2. Pestaña **Principal**: puerto `8080` (o el que quieras), marcá **Ejecutar el servidor automáticamente al iniciar calibre** y apretá **Iniciar servidor**.
3. Pestaña **Avanzado**: activá **Permitir que conexiones locales sin autenticar hagan cambios** (`local_write`). Sin esto, Calibre rechaza la subida con 403.
   - Alternativa: activar **Requerir usuario y contraseña** con autenticación **basic** (no *digest*) y cargar el usuario y la contraseña en las opciones de la extensión.

> El puerto 9090 es el de "Conexión con dispositivo inalámbrico", no el Content Server.

## 2. Instalar en Brave

1. Abrí `brave://extensions`.
2. Activá **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → elegí la carpeta `extension/`.
4. Fijá el ícono en la barra. En **Opciones** apretá **Probar conexión** y elegí la biblioteca.

## Uso

- **Ícono** → podés editar el título y las etiquetas → **Enviar**.
- **Clic derecho → Enviar página a Calibre** (usa las etiquetas por defecto).
- **Alt+Shift+C** (se cambia en `brave://extensions/shortcuts`).

El ícono muestra ✓ o ! al terminar.

## Qué genera

- EPUB 3 (con NCX para lectores viejos): título, autor, sitio, fecha y link al original.
- Las imágenes se descargan y se incrustan. WebP y AVIF se pasan a JPEG para que los lea un Kindle o Kobo.
- La portada sale de `og:image` o, si no hay, de la primera imagen.
- Metadatos: título, autor, editorial (el sitio), fecha, descripción, idioma, `dc:source` = URL y las etiquetas. Además, después de subirlo, las etiquetas se fijan con `/cdb/set-fields`.
- Si ya hay un libro con el mismo título, Calibre no lo agrega, salvo que actives **Permitir duplicados**.

## Estructura

```
extension/
  manifest.json
  background.js        # orquesta: extraer → imágenes → EPUB → subir
  content/extract.js   # corre en la página: Readability + limpieza a XHTML
  lib/epub.js          # arma el EPUB
  lib/zip.js           # ZIP mínimo (CompressionStream)
  lib/calibre.js       # cliente del Content Server (/cdb/add-book, /cdb/set-fields)
  lib/settings.js
  popup/, options/, ui.css, icons/
  vendor/Readability.js  # @mozilla/readability 0.6.0
```

## Licencia

[MIT](LICENSE). `extension/vendor/Readability.js` es de Mozilla y conserva su licencia Apache 2.0 (ver el encabezado del archivo).
