import { defineConfig } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { routes } from './src/routes.ts';

export default defineConfig({
  build: { target: 'es2022', sourcemap: true },
  plugins: [{
    name: 'axionbench-static-routes',
    async closeBundle() {
      const html = await readFile('dist/index.html', 'utf8');
      for (const route of routes.filter(route => route.path !== '/')) {
        const directory = 'dist' + route.path;
        await mkdir(directory, { recursive: true });
        await writeFile(directory + '/index.html', html
          .replace('<title>Overview — AxionBench</title>', '<title>' + route.title + ' — AxionBench</title>')
          .replace('rel="canonical" href="https://axionbench.jadapps.app/"', 'rel="canonical" href="https://axionbench.jadapps.app' + route.path + '"')
          .replace('property="og:url" content="https://axionbench.jadapps.app/"', 'property="og:url" content="https://axionbench.jadapps.app' + route.path + '"'));
      }
    },
  }],
});
