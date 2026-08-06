<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/recursos/SVG/LogoCurripa.svg" />
    <img src="public/recursos/SVG/LogoCurripa-negro.svg" alt="Logo Curripa" height="120" />
  </picture>
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/recursos/SVG/Curripa.svg" />
    <img src="public/recursos/SVG/Curripa-negro.svg" alt="Curripa" height="60" />
  </picture>
</p>

<p align="center"><a href="README.es.md">Español</a> · English</p>

> DIY creative collective. From ruins to oblivion.

**Curripa** is the web portal of a DIY creative collective. A static, single-page site with a fanzine aesthetic that acts as a showcase for the whole discography published on Bandcamp.

## Features

- **Single-page, fanzine-style**: splash screen with the logo, tagline and the band list; scrolling walks through each project in chronological order.
- **Per-band section**: logo, active years, history (expandable) and a grid of its discography.
- **Built-in player**: each album opens a view with the track list and an audio player (previous/play/next, volume and time) using Bandcamp public streams.
- **Lightbox**: cover artwork enlarges on click.
- **Bilingual (es/en)**: the language is detected from the browser (English by default).
- **Light/dark theme** persisted in `localStorage`.
- **Static and lightweight**: rendered as static HTML at build time; no backend.

## Stack

- [Astro](https://astro.build) (static site generation)
- [Tailwind CSS](https://tailwindcss.com)
- Fonts: *Bebas Neue* (headings) and *JetBrains Mono* (body)
- Deployed to **GitHub Pages** via GitHub Actions

## Project structure

```
.
├── .github/workflows/deploy.yml   # CI/CD: fetch data + build + deploy
├── astro.config.mjs               # Astro config (Pages site URL)
├── tailwind.config.cjs
├── package.json
├── scripts/
│   └── fetch-bandcamp.mjs         # Bandcamp scraper → discography JSON
├── public/
│   └── recursos/SVG/              # Logos (light and dark variant per band)
└── src/
    ├── components/                # Splash, BandSection, Discography, AlbumCard,
    │   │                          # AlbumDetail, BandcampEmbed, ScrollReveal
    ├── data/
    │   ├── bands/                 # Per-band metadata (one JSON each)
    │   └── generated/discography/ # Discography generated from Bandcamp (do not edit)
    ├── i18n/                      # es/en dictionary and initialization
    ├── layouts/BaseLayout.astro
    ├── pages/index.astro          # Single page
    ├── scripts/player.js          # Audio player
    ├── styles/global.css
    └── types.ts                   # Band, Album, Track types
```

## Getting started

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev        # dev server at http://localhost:4321
npm run build      # builds the site into dist/
npm run preview    # serves the build locally
```

### Discography

The discography is not maintained by hand: it is scraped from each band's public Bandcamp pages. Band metadata (name, genre, history, Bandcamp URL) lives in `src/data/bands/*.json`; the script generates the discography into `src/data/generated/discography/`.

```bash
npm run fetch:bandcamp   # refreshes the discography from Bandcamp
```

Generated files (`src/data/generated/`) are recalculated on every deploy and should not be edited by hand.

### Adding a band

1. Create `src/data/bands/<id>.json` following the structure of the existing files (`id`, `name`, `yearsActive`, `description`, `history`, `historyEn`, `bandcampUrl`, `logoSvg`, `logoSvgNegro`).
2. Add the logos to `public/recursos/SVG/` (light and dark variant).
3. Run `npm run fetch:bandcamp` to generate its discography.

## Internationalization

The site is rendered in Spanish and switches to English based on the browser language. Strings live in `src/i18n/dict.js`:

- `data-i18n` → replaces text content.
- `data-i18n-aria` → replaces the `aria-label` attribute.
- Each band's bilingual history uses `data-lang="es"` / `data-lang="en"` and is toggled through the `lang-es` / `lang-en` class on `<html>`.

## Deployment

The `.github/workflows/deploy.yml` workflow handles everything on every push (and daily at 06:00 UTC to refresh the discography):

1. Installs dependencies.
2. Runs `npm run fetch:bandcamp` (fetches the updated discography).
3. Builds the site.
4. Publishes `dist/` to **GitHub Pages**.

To enable it in a repository:

1. Push the project to GitHub.
2. In *Settings → Pages*, select **GitHub Actions** as the deployment source.
3. The workflow will deploy the site to `https://<user>.github.io/`.

The site URL is configured in `astro.config.mjs` (`site`).
