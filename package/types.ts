
export interface ModuleInfo{
    name: string,
    version: string,
    main?: string,
    folder?: string,
    packageJson?: PackageJsonInfo,
    dependencies?: ModuleInfo[]
}

export interface PackageJsonInfo{
    name?: string,
    version?: string, 
    dependencies?: any,
    main?: string
}

export interface ModName{
    name: string
    version?: string 
}

