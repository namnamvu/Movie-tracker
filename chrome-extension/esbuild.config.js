import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatchMode = process.env.WATCH === 'true';
console.log('🔧 WATCH MODE:', isWatchMode);

const buildOptions = {
  entryPoints: {
    'content.bundle': 'src/content/content-script.js',
    'popup.bundle': 'src/popup/popup.js',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
};

const assetsToCopy = [
  { from: 'src/popup/popup.html', to: 'dist/popup.html' },
  { from: 'src/manifest.json', to: 'dist/manifest.json' },
  { from: 'src/background/service-worker.js', to: 'dist/background/service-worker.js' },
];

function copyAssets() {
  for (const { from, to } of assetsToCopy) {
    const src = resolve(__dirname, from);
    const dest = resolve(__dirname, to);
    if (!existsSync(src)) {
      console.warn(`⚠️ Missing asset: ${from}`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`📁 Copied ${from} → ${to}`);
  }
}

async function build() {
  if (isWatchMode) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching for changes...');
    copyAssets();
    process.stdin.resume();
  } else {
    await esbuild.build(buildOptions);
    console.log('✅ Build complete');
    copyAssets();
  }
}

build().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
