const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const packageJsonPath = path.join(__dirname, '../package.json');

// Read files
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get current version
const currentVersion = appJson.expo.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Increment patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

// Increment Android versionCode
const currentVersionCode = appJson.expo.android?.versionCode || 1;
const newVersionCode = currentVersionCode + 1;

// Increment iOS buildNumber
const currentBuildNumber = parseInt(appJson.expo.ios?.buildNumber || '1');
const newBuildNumber = String(currentBuildNumber + 1);

// Update versions
appJson.expo.version = newVersion;
appJson.expo.android.versionCode = newVersionCode;
appJson.expo.ios.buildNumber = newBuildNumber;
packageJson.version = newVersion;

// Write files
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✅ Version bumped: ${currentVersion} → ${newVersion}`);
console.log(`✅ Android versionCode: ${currentVersionCode} → ${newVersionCode}`);
console.log(`✅ iOS buildNumber: ${currentBuildNumber} → ${newBuildNumber}`);
