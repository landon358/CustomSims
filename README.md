# Custom Sims LLC — Website

Static site. Golf simulator design & installation, Michigan.

## Pages
| File | Page |
| --- | --- |
| index.html | Home |
| residential.html | Residential |
| commercial.html | Commercial |
| institutional.html | Institutional |
| putting-greens.html | Putting Greens |
| projects.html | Projects |
| about.html | About |
| process-faq.html | Process & FAQ |
| contact.html | Contact |

## Deploying to GitHub Pages
1. Create a repo and push the contents of this folder to the repository **root** (not inside a subfolder).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. The site publishes at `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so GitHub Pages serves every file as-is.

## Local preview
Open `index.html` directly, or run a local server:
```
python3 -m http.server
```

## Structure
- `support.js` — required runtime; keep it beside the HTML files.
- `assets/` — photography, logo cutouts, and hero video (`hero_bg.webm` + `hero_bg.mp4`, poster `hero_fallback.jpg`).

## Notes
- Hero video autoplays muted, plays once, and holds on its final frame.
- Price ranges on `process-faq.html` are estimates pending final confirmation.
- Nav collapses to logo + phone + CTA below 1080px; a hamburger menu is not yet implemented.
