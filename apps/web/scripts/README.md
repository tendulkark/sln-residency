# Icon source

`icon-source.svg` / `icon-maskable-source.svg` are the master vectors for
the PWA install icons in `public/icons/` (favicons, apple-touch-icon,
192/512 regular + maskable). They're generic and brand-neutral by design —
see the note in `vite.config.js` on why the installable-app identity is
never a specific tenant's name/logo.

To regenerate the PNGs (e.g. if the default brand color changes), run this
once with any Node that can `npm install sharp`:

```js
const sharp = require("sharp");
const jobs = [
  ["icon-source.svg", 192, "../public/icons/icon-192.png"],
  ["icon-source.svg", 512, "../public/icons/icon-512.png"],
  ["icon-source.svg", 180, "../public/icons/apple-touch-icon.png"],
  ["icon-source.svg", 32, "../public/icons/favicon-32.png"],
  ["icon-source.svg", 16, "../public/icons/favicon-16.png"],
  ["icon-maskable-source.svg", 512, "../public/icons/icon-maskable-512.png"],
  ["icon-maskable-source.svg", 192, "../public/icons/icon-maskable-192.png"],
];
for (const [src, size, out] of jobs) {
  sharp(src, { density: 384 }).resize(size, size).png().toFile(out);
}
```
