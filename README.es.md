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

<p align="center">Español · <a href="README.md">English</a></p>

> Colectivo creativo DIY. De las ruinas al olvido.

**Curripa** es el portal web de un colectivo creativo DIY. Un sitio estático de una sola página con estética de fanzine que hace las veces de escaparate para toda la discografía publicada en Bandcamp.

## Características

- **Página única tipo fanzine**: splash con el logo, tagline y el listado de grupos; el scroll recorre cada proyecto en orden cronológico.
- **Sección por grupo**: logo, años de actividad, historia (expandible) y rejilla de su discografía.
- **Reproductor integrado**: cada álbum abre una vista con el listado de canciones y un reproductor de audio (anterior/play/siguiente, volumen y tiempo) usando los streams públicos de Bandcamp.
- **Lightbox**: las portadas se amplían al hacer clic.
- **Bilingüe (es/en)**: el idioma se detecta desde el navegador (español por defecto).
- **Tema claro/oscuro** con persistencia en `localStorage`.
- **Estática y ligera**: se genera como HTML estático en el build; sin backend.

## Stack

- [Astro](https://astro.build) (generación de sitio estático)
- [Tailwind CSS](https://tailwindcss.com)
- Tipografías: *Bebas Neue* (títulos) y *JetBrains Mono* (texto)
- Despliegue en **GitHub Pages** mediante GitHub Actions

## Estructura del proyecto

```
.
├── .github/workflows/deploy.yml   # CI/CD: genera datos + build + despliegue
├── astro.config.mjs               # Configuración de Astro (site de Pages)
├── tailwind.config.cjs
├── package.json
├── scripts/
│   └── fetch-bandcamp.mjs         # Scraper de Bandcamp → JSON de discografía
├── public/
│   └── recursos/SVG/              # Logos (versión clara y oscura por grupo)
└── src/
    ├── components/                # Splash, BandSection, Discography, AlbumCard,
    │   │                          # AlbumDetail, BandcampEmbed, ScrollReveal
    ├── data/
    │   ├── bands/                 # Metadatos de cada grupo (uno por JSON)
    │   └── generated/discography/ # Discografía generada desde Bandcamp (no editar)
    ├── i18n/                      # Diccionario es/en e inicialización
    ├── layouts/BaseLayout.astro
    ├── pages/index.astro          # Página única
    ├── scripts/player.js          # Reproductor de audio
    ├── styles/global.css
    └── types.ts                   # Tipos Band, Album, Track
```

## Puesta en marcha

Requisitos: **Node.js 20+**.

```bash
npm install
npm run dev        # desarrollo en http://localhost:4321
npm run build      # genera el sitio en dist/
npm run preview    # sirve el build localmente
```

### Discografía

La discografía no se mantiene a mano: se obtiene rascando las páginas públicas de Bandcamp de cada grupo. Los datos de los grupos (nombre, estilo, historia, URL de Bandcamp) están en `src/data/bands/*.json`; a partir de ellos el script genera la discografía en `src/data/generated/discography/`.

```bash
npm run fetch:bandcamp   # actualiza la discografía desde Bandcamp
```

Los archivos generados (`src/data/generated/`) se recalculan en cada despliegue y no deberían editarse a mano.

### Añadir un grupo

1. Crear `src/data/bands/<id>.json` con la estructura de los archivos existentes (`id`, `name`, `yearsActive`, `description`, `history`, `historyEn`, `bandcampUrl`, `logoSvg`, `logoSvgNegro`).
2. Añadir los logos en `public/recursos/SVG/` (versión clara y oscura).
3. Ejecutar `npm run fetch:bandcamp` para generar su discografía.

## Internacionalización

La web se genera en español y se adapta al inglés según el idioma del navegador. Las cadenas están en `src/i18n/dict.js`:

- `data-i18n` → reemplaza el contenido de texto.
- `data-i18n-aria` → reemplaza el atributo `aria-label`.
- La historia bilingüe de cada grupo usa `data-lang="es"` / `data-lang="en"` y se alterna mediante la clase `lang-es` / `lang-en` en `<html>`.

## Despliegue

El flujo `.github/workflows/deploy.yml` se encarga de todo en cada push (y diariamente a las 06:00 UTC para refrescar la discografía):

1. Instala dependencias.
2. Ejecuta `npm run fetch:bandcamp` (obtiene la discografía actualizada).
3. Compila el sitio.
4. Publica `dist/` en **GitHub Pages**.

Para activarlo en un repositorio:

1. Sube el proyecto a GitHub.
2. En *Settings → Pages*, selecciona **GitHub Actions** como fuente de despliegue.
3. El flujo desplegará el sitio en `https://<usuario>.github.io/`.

La URL del sitio se configura en `astro.config.mjs` (`site`).
