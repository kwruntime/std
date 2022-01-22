//import NormalRegistry from './registry.ts'
import fs from 'fs'
import Path from 'path'
import Os from 'os'
import crypto from 'crypto'
import Semver from 'https://esm.sh/semver@7.3.5'
import Child from 'child_process'
import * as async from '../util/async.ts'
import {Exception} from "../util/exception.ts"

import {ModuleInfo,ModName} from './types.ts'
export * from './types.ts'

//import {kawix} from 'gh+/kwruntime/core@59e5f11/src/kwruntime.ts'
import https from 'https'
import Zlib from 'zlib'

export class Registry{
    static cache = {}
    static checked = {}
    static binCache:{[key:string]: any} = {}

    _packagesfolder: string 


    pnpm = "https://unpkg.com/pnpm@${version}"
    pnpmVersion = "latest"

    constructor(){}

    async $createFolder(){
        var home = Path.join(Os.homedir(), ".kawi")
        var packages = Path.join(home, "pnpm-packages")
        if(!fs.existsSync(packages)){
            await fs.promises.mkdir(packages)
        }
        return packages
    }

    async $defaultFolder(){
        var home = Path.join(Os.homedir(), ".kawi")
        var packages = Path.join(home, "packages")
        if(!fs.existsSync(packages)){
            await fs.promises.mkdir(packages)
        }
        return packages
    }


    async $modulePath(modules: ModName[], uid?: string, force = false){
        if(!uid)
            uid = modules.map((a)=> a.name + "@" + (a.version||"latest")).join(",") 


        let packages = await this.$createFolder()
        this._packagesfolder  = packages
        var md5 = crypto.createHash("md5").update(uid).digest('hex') // + "-" + module.replace(/[\@\?]/g,'')
        var pack = Path.join(packages, md5)
        if (!fs.existsSync(pack)) {
            await fs.promises.mkdir(pack)
        }
        var jsonPack = Path.join(pack, "package.json")
        if(force || (!fs.existsSync(jsonPack))){
            let content  = {
                name : 'test-0',
                dependencies: {}
            }
            for(let i=0;i<modules.length;i++){
                let mod = modules[i]
                content.dependencies[mod.name] = mod.version || "latest"
            }
            //content.dependencies[module] = version 
            await fs.promises.writeFile(jsonPack, JSON.stringify(content, null, '\t'))
        }
        return pack 
    }


    async getModuleInfoFromFolder(folder: string): Promise<ModuleInfo>{
        var pjson = Path.join(folder, "package.json")
        if(!fs.existsSync(pjson)){
            return null
        }
        
        var moduleinfo: ModuleInfo = {
            folder: '',
            main: '',
            name: '',
            version: '',
            packageJson: {},
            dependencies: []
        }
        moduleinfo.folder = folder
        moduleinfo.packageJson = require(pjson)
        moduleinfo.name = moduleinfo.packageJson.name 
        if (moduleinfo.packageJson.dependencies) {
            for (var id in moduleinfo.packageJson.dependencies) {
                moduleinfo.dependencies.push({
                    name: id,
                    version: moduleinfo.packageJson.dependencies[id]
                })
            }
        }
        moduleinfo.version = moduleinfo.packageJson.version
        if (moduleinfo.packageJson.main) {
            moduleinfo.main = Path.join(moduleinfo.folder, moduleinfo.packageJson.main)
        } else {
            moduleinfo.main = Path.join(moduleinfo.folder, "index.js")
        }
        return moduleinfo
    }

    async getCacheFromFolder(folder: string, added?: ModuleInfo[]): Promise<ModuleInfo[]>{
        if(!added)
            added = []


        var files = await fs.promises.readdir(folder)
        for (let i = 0; i < files.length; i++) {
            let file = files[i]
            let ufile = Path.join(folder, file)
            if (!file.startsWith(".")) {
                let stat = await fs.promises.stat(ufile)
                if (stat.isDirectory()) {
                    if (file.startsWith("@")) {
                        await this.getCacheFromFolder(ufile, added)
                    } else {

                        let moduleinfo = await this.getModuleInfoFromFolder(ufile)
                        if (moduleinfo) {
                            if (!Registry.cache[moduleinfo.name]) {
                                Registry.cache[moduleinfo.name] = []
                            }
                            let search = Registry.cache[moduleinfo.name].filter(function (a) {
                                return a.version == moduleinfo.version
                            })
                            if (search.length == 0){
                                Registry.cache[moduleinfo.name].push(moduleinfo)
                                added.push(moduleinfo)
                            }
                        }

                        let nodemods = Path.join(ufile, "node_modules")
                        if(fs.existsSync(nodemods)){
                            await this.getCacheFromFolder(ufile, added)
                        }

                    }
                }
            }
        }
        return added   
    }

    async require(mod: ModName | ModName[] | string, versionOrUid?: string): Promise<any>{
        let info = await this.resolve(mod, versionOrUid)
        if(info instanceof Array){
            info = info[0]
        }
        if(info) return require(info.main)
        throw Exception.create("Failed getting module: " + String(mod) + " -- " + String(versionOrUid))
    }


    async resolve(mod: ModName | ModName[] | string, versionOrUid?: string): Promise<any>{


        let uid = ''
        let modname = (mod as ModName).name || (mod as string)
        let version = (mod as ModName).version || versionOrUid
        if(modname.indexOf("|")>=0){
            if(modname.indexOf(">") >= 0){
                let parts = modname.split(">")
                modname = parts[0]
                uid = parts[1]            
            }
        }
        mod = modname.split("|").map((a)=> {
            let i = a.lastIndexOf("@")
            return {
                name: a.substring(0, i),
                version: a.substring(i+1)
            }
        })
        if(!uid) uid = versionOrUid
        if(mod.length > 1){
            return await this.resolveMany(mod as ModName[], uid)
        }
        else{
            return await this.resolveSingle(mod[0])
        }

        
    }

    async $pnpmBin(){

        let data = Registry.binCache[this.pnpmVersion]
        if(data) return data.main 

        let url = this.pnpm.replace("${version}", this.pnpmVersion)
        let hash = crypto.createHash("md5").update(url).digest("hex") + ".data.json"
        let folder = await this.$createFolder()
        let file = Path.join(folder, hash)
        let code = Path.join(folder, hash + ".js")
        
        if(fs.existsSync(file)){
            let content = await fs.promises.readFile(file, 'utf8')
            try{
                data = JSON.parse(content)
            }catch(e){}
        }

        let needcheck = false
        if(data){
            // check if version is fully cacheable
            let isgood = /\d/.test(this.pnpmVersion[0]) && 
                ( (["*>=.x^"].filter((a) => this.pnpmVersion.indexOf(a) >= 0).length == 0) )
            
            if(!isgood){
                if(Date.now() - data.time > (24*3*3600000)){
                    // revisar cada 3 días?? 
                    needcheck = true
                }
            }
        }


        if(!data || needcheck){

            let uid = parseInt(String(Date.now()/24*3*3600000)).toString() + ".json"
			let pack = await import("https://unpkg.com/pnpm/package.json?date=" + uid)
            let version = data && data.version
            if(pack.version != version){

                console.info("> Installing/updating pnpm version:", this.pnpmVersion)

                let def = new async.Deferred<Buffer>()
                let decompressor = Zlib.createGunzip()
                decompressor.once("error", def.reject)
                let sw = fs.createWriteStream(code)
                sw.once("error", def.reject)
                sw.once("finish", def.resolve)

                let get = function(url: string){
                    https.get(url, {
                        "headers": {
                            "Accept-Encoding": "gzip"
                        }
                    }, (res)=> {
                        if(res.statusCode >= 400){
                            return def.reject(Exception.create("Failed getting pnpm executable").putCode("DOWNLOAD_FAILED"))
                        }
                        if(res.headers.location){
                            return get(new URL(res.headers.location, url).href) 
                        }

                        res.pipe(decompressor).pipe(sw)
                    }).once("error", def.reject)
                }
                //get("https://unpkg.com/pnpm@" + pack.version)
                get(this.pnpm.replace("${version}", pack.version))

                await def.promise

                data = {
                    version: pack.version,
                    time: Date.now(),
                    main: code
                }
                await fs.promises.writeFile(file, JSON.stringify(data))
            }
            
        }

        Registry.binCache[this.pnpmVersion] = data 
        return data.main
    }

    async $old_pnpmBin(){

        /*
        let item = await kawix.importInfo("http://esm.sh/pnpm@6.24.4")
        return item.filename
        */

        let url = this.pnpm.replace("${version}", this.pnpmVersion)
        let hash = crypto.createHash("md5").update(url).digest("hex") + ".js"
        let folder = await this.$createFolder()
        let bin = Path.join(folder, hash)
        let binOk = Path.join(folder, hash + ".ok")
        if(!fs.existsSync(binOk)){
            let def = new async.Deferred<Buffer>()
            let decompressor = Zlib.createGunzip()
            decompressor.once("error", def.reject)
            let sw = fs.createWriteStream(bin)
            sw.once("error", def.reject)
            sw.once("finish", def.resolve)

            let get = function(url: string){
                https.get(url, {
                    "headers": {
                        "Accept-Encoding": "gzip"
                    }
                }, (res)=> {
                    if(res.statusCode >= 400){
                        return def.reject(Exception.create("Failed getting pnpm executable").putCode("DOWNLOAD_FAILED"))
                    }
                    if(res.headers.location){
                        return get(new URL(res.headers.location, url).href) 
                    }

                    res.pipe(decompressor).pipe(sw)
                }).once("error", def.reject)
            }
            get("https://unpkg.com/pnpm@6.24.4")

            await def.promise
            await fs.promises.writeFile(binOk, Date.now().toString())
        }

        return bin
    }

    async $pnpmExecute(folder: string){
        let bin = await this.$pnpmBin()
        var p = Child.spawn(process.execPath, [bin, "i"], {
            env: Object.assign({}, process.env, {
                PATH: Path.dirname(process.execPath) + Path.delimiter + Path.join(Path.dirname(process.execPath), "..", "utils") + Path.delimiter + process.env.PATH,
                NODE_REQUIRE: "1",
                ELECTRON_RUN_AS_NODE: "1",
                PNPM_EXECUTE: "1"
            }),
            cwd: folder
        })

        var def = new async.Deferred<void>()
        var err = []
        var received = function(data){
            process.stdout.write(data)
            var str = data.toString()
            if(str.indexOf("ERR_PNPM") >= 0){
                err.push(str)
            }
        }
        p.stdout.on("data", received)
        p.stderr.on("data", received)
        p.on("error", def.reject)
        p.on("exit", def.resolve)
        await def.promise 

        if(err.length){
            throw Exception.create("Failed to install packages: "  + err.join(" ")).putCode("INSTALL_FAILED")
        }
    }


    async secureRequire(mod: ModuleInfo){

        let folder = Path.join(mod.folder,"..","..")
        try{
            return require(mod.main)
        }catch(e){
            // something bad at installing
            if(e.message.indexOf("Could not locate the bindings") >= 0){
                await this.$pnpmExecute(folder)
                return require(mod.main)
            }
            else{
                throw e
            }
        }

    }

    async resolveMany(modules: ModName[], uid?: string, force = false): Promise<ModuleInfo[]>{
        let text = modules.map((a)=> a.name + "@" + a.version).join(",")
        if(!uid)
            uid = text

        let ruid = uid + "." + text
        if(Registry.cache[ruid])
            return Registry.cache[ruid]

        var out = await this.$modulePath(modules, uid, force)
        var verif = Path.join(out, "__kwcore_verification")
        if(fs.existsSync(verif)){
            let content = await fs.promises.readFile(verif,'utf8')
            if(content.indexOf(text+".") < 0){
                await fs.promises.unlink(verif)
                return await this.resolveMany(modules,uid, true)
            }

            let mods = []
            for(let i=0;i<modules.length;i++){
                let modInfo = await this.getModuleInfoFromFolder(Path.join(out, "node_modules", modules[i].name))
                mods.push(modInfo)
            }   
            return mods
        }
        await this.$pnpmExecute(out)
        try{
            // get all cache 
            let modfolder = Path.join(out, "node_modules")
            if(!fs.existsSync(modfolder))
                throw Exception.create("PNPM install nothing").putCode("INSTALL_FAILED")
            //await this.getCacheFromFolder(mods)

        }catch(e){
            throw Exception.create("Failed to install packages: " + e.message).putCode("INSTALL_FAILED")
        }
        await fs.promises.writeFile(verif, text + "." + Date.now())
        
        let mods = []
        for(let i=0;i<modules.length;i++){
            let modInfo = await this.getModuleInfoFromFolder(Path.join(out, "node_modules", modules[i].name))
            mods.push(modInfo)
        }   

        Registry.cache[ruid] = mods 
        return mods 
    }

    async resolveSingle(module: ModName) : Promise<ModuleInfo>{
        
        let cache = []
        let cachea = Registry.cache[module.name]
        if(cachea){
            cache.push(...cachea)
        }
        if(cache.length){
            cache.sort(function(a,b){
                return a.version > b.version ? -1 : (a.version < b.version ? 1 :0)
            })
            for(let i=0;i<cache.length;i++){
                let mod = cache[i]
                if(mod.version == module.version)
                    return mod                 
                if(Semver.satisfies(mod.version, module.version))
                    return mod 
            }
        }
        // execute pnpm
        var out = await this.$modulePath([module])
        var verif = Path.join(out, "__kwcore_verification")
        if(fs.existsSync(verif)){
            if(!Registry.checked[Path.join(out, "node_modules")]){
                await this.getCacheFromFolder(Path.join(out, "node_modules"))
            }
            return await this.getModuleInfoFromFolder(Path.join(out, "node_modules", module.name))
        }

        
        await this.$pnpmExecute(out)
        try{
            // get all cache 
            var mods = Path.join(out, "node_modules")
            if(!fs.existsSync(mods))
                throw Exception.create("PNPM install nothing").putCode("INSTALL_FAILED")
            await this.getCacheFromFolder(mods)
        }catch(e){
            throw Exception.create("Failed to install packages: " + e.message).putCode("INSTALL_FAILED")
        }
        await fs.promises.writeFile(verif, Date.now().toString())
        return await this.getModuleInfoFromFolder(Path.join(out, "node_modules", module.name))
    }
}


export default Registry