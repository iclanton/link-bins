import binify, { Command } from '@pnpm/package-bins'
import { readImporterManifestOnly } from '@pnpm/read-importer-manifest'
import { fromDir as readPackageJsonFromDir } from '@pnpm/read-package-json'
import { DependencyManifest } from '@pnpm/types'
import cmdShim = require('@zkochan/cmd-shim')
import isSubdir = require('is-subdir')
import isWindows = require('is-windows')
import makeDir = require('make-dir')
import Module = require('module')
import fs = require('mz/fs')
import normalizePath = require('normalize-path')
import path = require('path')
import R = require('ramda')
import getPkgDirs from './getPkgDirs'

const IS_WINDOWS = isWindows()
const EXECUTABLE_SHEBANG_SUPPORTED = !IS_WINDOWS
const POWER_SHELL_IS_SUPPORTED = IS_WINDOWS

export default async (
  modules: string,
  binPath: string,
  opts: {
    allowExoticManifests?: boolean,
    warn: (msg: string) => void,
  },
) => {
  const pkgDirs = await getPkgDirs(modules)
  const pkgBinOpts = {
    allowExoticManifests: false,
    ...opts,
  }
  const allCmds = R.unnest(
    (await Promise.all(
      pkgDirs
        .filter((dir) => !isSubdir(dir, binPath)) // Don't link own bins
        .map(normalizePath)
        .map((target: string) => getPackageBins(target, pkgBinOpts)),
    ))
    .filter((cmds: Command[]) => cmds.length),
  )

  return linkBins(allCmds, binPath, opts)
}

export async function linkBinsOfPackages (
  pkgs: Array<{
    manifest: DependencyManifest,
    location: string,
  }>,
  binsTarget: string,
  opts: {
    warn: (msg: string) => void,
  },
) {
  if (!pkgs.length) return

  const allCmds = R.unnest(
    (await Promise.all(
      pkgs
        .map((pkg) => getPackageBinsFromPackageJson(pkg.manifest, pkg.location)),
    ))
    .filter((cmds: Command[]) => cmds.length),
  )

  return linkBins(allCmds, binsTarget, opts)
}

async function linkBins (
  allCmds: Array<Command & {
    ownName: boolean,
    pkgName: string,
  }>,
  binPath: string,
  opts: {
    warn: (msg: string) => void,
  },
) {
  if (!allCmds.length) return

  await makeDir(binPath)

  const [cmdsWithOwnName, cmdsWithOtherNames] = R.partition((cmd) => cmd.ownName, allCmds)

  await Promise.all(cmdsWithOwnName.map((cmd: Command) => linkBin(cmd, binPath)))

  const usedNames = R.fromPairs(cmdsWithOwnName.map((cmd) => [cmd.name, cmd.name] as R.KeyValuePair<string, string>))
  await Promise.all(cmdsWithOtherNames.map((cmd: Command & {pkgName: string}) => {
    if (usedNames[cmd.name]) {
      opts.warn(`Cannot link bin "${cmd.name}" of "${cmd.pkgName}" to "${binPath}". A package called "${usedNames[cmd.name]}" already has its bin linked.`)
      return
    }
    usedNames[cmd.name] = cmd.pkgName
    return linkBin(cmd, binPath)
  }))
}

async function getPackageBins (
  target: string,
  opts: {
    allowExoticManifests: boolean,
  },
) {
  const pkg = opts.allowExoticManifests ? await safeReadImporterManifestOnly(target) : await safeReadPkg(target)

  if (!pkg) {
    // There's a directory in node_modules without package.json: ${target}.
    // This used to be a warning but it didn't really cause any issues.
    return []
  }

  return getPackageBinsFromPackageJson(pkg, target)
}

async function getPackageBinsFromPackageJson (pkgJson: DependencyManifest, pkgPath: string) {
  const cmds = await binify(pkgJson, pkgPath)
  return cmds.map((cmd) => ({...cmd, ownName: cmd.name === pkgJson.name, pkgName: pkgJson.name}))
}

async function linkBin (cmd: Command, binPath: string) {
  const externalBinPath = path.join(binPath, cmd.name)

  if (EXECUTABLE_SHEBANG_SUPPORTED) {
    await fs.chmod(cmd.path, 0o755)
  }
  const nodePath = await getBinNodePaths(cmd.path)
  return cmdShim(cmd.path, externalBinPath, {
    createPwshFile: POWER_SHELL_IS_SUPPORTED,
    nodePath,
  })
}

async function getBinNodePaths (target: string): Promise<string[]> {
  const targetRealPath = await fs.realpath(target)

  return R.union(
    Module._nodeModulePaths(targetRealPath),
    Module._nodeModulePaths(target),
  )
}

async function safeReadPkg (pkgPath: string): Promise<DependencyManifest | null> {
  try {
    return await readPackageJsonFromDir(pkgPath) as DependencyManifest
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}

async function safeReadImporterManifestOnly (importerDir: string) {
  try {
    return await readImporterManifestOnly(importerDir) as DependencyManifest
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND') {
      return null
    }
    throw err
  }
}
