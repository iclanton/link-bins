declare module 'arr-flatten' {
  const anything: any;
  export = anything;
}

declare module 'p-filter' {
  const anything: any;
  export = anything;
}

declare module 'normalize-path' {
  const anything: any;
  export = anything;
}

declare module 'mkdirp-promise' {
  const anything: any;
  export = anything;
}

declare module 'read-package-json' {
  const anything: any;
  export = anything;
}

declare module 'is-windows' {
  function isWindows(): boolean;
  export = isWindows;
}

declare module 'is-subdir' {
  function isSubdir(base: string, sub: string): boolean;
  export = isSubdir;
}

declare namespace NodeJS.Module {
  function _nodeModulePaths(from: string): string[]
}

declare module 'ncp' {
  const anything: any;
  export = anything;
}
