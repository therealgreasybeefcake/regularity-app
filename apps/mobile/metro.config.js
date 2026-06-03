// Metro config for the Expo app inside a pnpm + Turborepo monorepo.
// Lets Metro resolve hoisted deps at the workspace root and transform the
// TypeScript source of internal packages (@regularity/core, @regularity/schemas).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so changes to packages/* trigger reloads.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Avoid pulling duplicate copies of hoisted packages.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
