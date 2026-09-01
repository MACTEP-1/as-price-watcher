// Metro, by default, only watches files inside this folder. lib/watches.ts
// and types/ deliberately live one level up, in the Next.js project, so
// that both apps share one definition instead of two copies drifting apart
// (see lib/watches.ts's own header comment). Metro needs to be told to
// watch the workspace root too, or those imports fail to resolve in a
// production bundle even though they work in the dev server by accident.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
