import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://curripa.github.io/',
  integrations: [tailwind()],
  server: { host: true },
});
