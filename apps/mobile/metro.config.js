// Metro config for the Expo app inside a pnpm + Turborepo monorepo.
// Lets Metro resolve hoisted deps at the workspace root and transform the
// TypeScript source of internal packages (@regularity/core, @regularity/schemas).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

const fs = require('fs');

// 1. Watch the whole monorepo so changes to packages/* trigger reloads.
const watchFolders = [workspaceRoot];

// If Expo was invoked from outside the workspace (e.g. via npx cache), watch it so Metro doesn't fail SHA-1 computation
try {
  const expoPkg = require.resolve('expo/package.json');
  const expoDir = path.dirname(expoPkg);
  if (!expoDir.startsWith(workspaceRoot)) {
    watchFolders.push(path.resolve(expoDir, '..'));
  }
} catch {}

const npxCacheDir = path.join(process.env.HOME || '', '.npm/_npx');
if (fs.existsSync(npxCacheDir)) {
  watchFolders.push(npxCacheDir);
}

config.watchFolders = watchFolders;

// 2. Resolve modules from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
