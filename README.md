# Skål Menu

The Omarchy launcher menu ([omarchy.menu](https://github.com/omacom/omarchy) clone) with a a few creature features built in.

- Math: `2+2`, `(3+4)*2`, `2^10`, `2pi`, `sqrt(144)`, `0xff + 1`, `0b1010`, implicit multiplication like `2(3+4)`
- Functions: sqrt, cbrt, abs, round, floor, ceil, exp, ln, log, log2, log10, sin, cos, tan, asin, acos, atan
- Constants: pi, e, tau
- Conversions: `<value> <unit> to <unit>` (or `in`), across length, mass, temperature, speed, volume, time, and data (`5 km to mi`, `72f to c`, `100 kg in lb`, `100mph to kmh`, `1 cup to ml`, `3 hours to min`, `1024 mb to gb`)
- Flatpak apps in results, with icons, even though the session misses their export dirs (#1881, #8650)
- A "Search the web" row under every query (#7012)
- Glyphs by name: `shrug`, `em dash`, `arrow right`, `euro` — Enter copies
- Faster touchpad scrolling (#7361)

Queries that are not math or conversions (`1password`, `firefox`) return normal search results, untouched.

## Install

```bash
omarchy plugin add https://github.com/outcrop-labs/skal-menu.git --enable --yes
```

Cloning from the built-in menu also works on an existing setup: `omarchy plugin clone omarchy.menu`, then rename/repoint as you like. The stock `omarchy menu` commands and the SUPER+SPACE binding keep working: omarchy resolves the built-in id to the enabled clone.

**One gotcha on current omarchy builds:** `omarchy plugin enable` for menu-kind plugins reports success but does not persist to `shell.json`, so after the next shell restart the clone silently falls back to the stock menu. If apps and calculator vanish after a reboot, add one line to `~/.config/omarchy/shell.json` and restart the shell:

```json
"plugins": [ { "id": "skal.menu" } ]
```

(Merge it into the existing `plugins` array if you have one.) This should become unnecessary once the persistence bug is fixed upstream.

Third-party menus also receive a scoped shell whose app library is null (omacom/omarchy#12014); this menu ships its own desktop-file scanner and `gtk-launch`/`flatpak run` launching so app search works regardless.

## Configuration

The "Search the web" row (#7012) defaults to DuckDuckGo, opened with `xdg-open` (your default browser). Both can be overridden by creating `~/.config/skal-menu/config.json`:

```json
{
  "webSearchUrl": "https://www.google.com/search?q={query}",
  "webSearchOpener": "webapp"
}
```

- `webSearchUrl`: a URL template containing a literal `{query}` placeholder, replaced with the URL-encoded search text. Defaults to `https://duckduckgo.com/?q={query}`. Works with any search engine's URL, not just DuckDuckGo/Google.
- `webSearchOpener`: `"browser"` (default, via `xdg-open`) or `"webapp"` (via `omarchy-launch-webapp`, for opening the result in a dedicated web-app window instead of the browser)

The file is optional and hot-reloaded — missing, empty, or invalid falls back to the defaults above, no restart needed.

## Removal

```bash
omarchy plugin remove skal.menu
```

## Credit

The menu itself is Omarchy's own `omarchy.menu` (MIT), cloned and extended. The calculator, conversions, web fallback, glyph search, and app-scanning additions are MIT from Outcrop Labs.
