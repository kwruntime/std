import Path from 'path'
import fs from 'fs'
import * as async from '../../util/async.ts'
import { Writable } from 'stream'

import {Registry} from '../pnpm.ts'
import * as esbuild from 'npm://esbuild@0.14.0'
import {kawix, ModuleImportInfo} from 'gh+/kwruntime/core@1.1.15/src/kwruntime.ts'

function $$$createKModule(filename?: string){	

	let globalFilename = filename

	class Module{
		filename: string
		exports:any  = {}
		constructor(filename: string){
			this.filename = filename 
		}
	}

	class KModuleLoader{
		static $Files = {}
		static $cache = {}
		static $global = undefined
		$filename : string 
		constructor(filename: string){
			this.$filename = filename 
		}
		

		get global(){
			if(KModuleLoader.$global === undefined){
				try{
					KModuleLoader.$global = global
				}
				catch(e){
					KModuleLoader.$global = window
				}
			}
			return KModuleLoader.$global
		}

		addFiles(files:any){
			for(let id in files){
				KModuleLoader.$Files[id] = files[id]
			}
			return this
		}

		addVirtualFile(path: string, filedata: any){

			if(this.global.kawix){
				return this.global.kawix.addVirtualFile(path, filedata)
			}


			if(typeof filedata == "function"){
				filedata = filedata()
			}
			//console.info(filedata.content && filedata.content.toString())
			//this.$Files[Path.posix.join("/virtual", path), filedata)
		}

		require(){
			return this.$require(arguments)
		}
		$require(originalArgs, module?){
			let request = originalArgs[0]
			if(KModuleLoader.$cache[request]){
				return KModuleLoader.$cache[request].exports 
			}

			let func = KModuleLoader.$Files[request]
			if(typeof func == "function"){
				if(!module) module = new Module(request)
				let params = {
					global: this.global,
					Buffer: this.global.Buffer,
					module,
					exports: module.exports,
					KModule: new KModuleLoader(request), // this.global.kawix ? this.global.kawix.KModule : this,
					require: this.require.bind(this),
					asyncRequire: this.import.bind(this)
				}
				func(params)
				KModuleLoader.$cache[request] = module
				return KModuleLoader.$cache[request].exports
			}

			try{
				return require(request)
			}catch(e){
				// maybe is in browser...
			}

			if(this.global.kawix){
				return this.global.kawix.import.apply(this.global.kawix, originalArgs)
			}
			
			throw new Error("Module: " + request + " not found")
		}

		getData(name: string){
			if(this.global.kawix){
				let u= this.global.kawix.getData(this.$filename, name)
				if(u === undefined){
					u = this.global.kawix.getData(globalFilename, name)
				}
				return u
			}
		}

		import(request){
			
			try{
				let file = request 
				if(file.startsWith("file://")){
					file = file.substring(7)
				}
				if(KModuleLoader.$Files[file]){
					return this.$require([file])
				}
			}catch(e){
				
			}

			if(this.global.kawix){
				return this.global.kawix.import.apply(this.global.kawix, arguments)
			}
			throw new Error("Module: " + request + " not found")

		}

	}

	return new KModuleLoader(filename)
}



export interface BuilderOptions{
	target?: string 
	minify?: any
	esbuild?: any
	externalModules?: Array<string>
	npmEnv?: {[key:string]: string}
	npmExternalModules?: Array<string>
	excludeNpmModules?: boolean
}

export class Builder{

	#options: BuilderOptions
	#code: string[] = []
	constructor(options:BuilderOptions){
		this.#options = options
	}

	static get nodeTranslations(){
		return {
			"buffer": "https://esm.sh/buffer@6.0.3",
			"events": "https://esm.sh/events@3.3.0",
			"util": "https://esm.sh/util@0.12.4",
			"os": "https://esm.sh/os@0.1.2"
		}
	}

	

	async compile(file: string){

		let loaded ={}
		let nodeTranslations = Builder.nodeTranslations
		//this.#code.push("// ESBUILD PACKAGE")
		this.#code.push("var $$Files= {}, $$NPMRequires=null, $$NodeRequire = null, $$filename = null; try{ $$NodeRequire = require; }catch(e){}; try{ $$filename = __filename; }catch(e){}")


		let npmModules = new Set<string>(), nodeFiles = new Set<string>(), npmFile = '', preloadCode = []
		let addInfo = async (info: ModuleImportInfo) => {

			/*
			if(info.request == "https://gitlab.com/jamesxt94/tmux/-/raw/dcc942c7/src/v2/tmux.ts")
				console.info("This request:", info)
			
			
			

			if((this.#options.externalModules|| []).indexOf(info.request) >= 0){
				// cargar al inicio
				return 
			}
			
			*/

			let nstr = []
			if(loaded[info.request]) return 
			
			
			loaded[info.request] = true
			nstr.push("var $$modParams = arguments[0]")
			for(let i=0;i<info.vars.names.length;i++){
				let name = info.vars.names[i]
				if(name == "module"){
					nstr.push("var module = $$modParams['module']")
				}
				else if(name == "require"){
					nstr.push("var require = $$modParams['require']")
				}
				else if(name == "KModule"){
					nstr.push("var KModule = $$modParams['KModule']")
				}
				else if(name == "global"){
					nstr.push("var global = $$modParams['global']")
				}
				else if(name == "Buffer"){
					nstr.push("var Buffer = $$modParams['Buffer']")
				}
				else if(name == "exports"){
					nstr.push(`var exports = $$modParams['exports']`)
				}
				else if(name == "asyncRequire"){
					nstr.push(`var asyncRequire = $$modParams['asyncRequire']`)
				}
				else if(name == "preloadedModules"){
					nstr.push(`var preloadedModules = []`)
				}
				else if(name == "__dirname" || name == "__filename"){
					if(this.#options.target != "node"){
						nstr.push(`var ${name} = ${JSON.stringify(info.vars.values[i])}`)
					}
				}
				else{
					nstr.push(`var ${name} = ${JSON.stringify(info.vars.values[i])}`)
				}
			}
			nstr.push("if($$NodeRequire) require = $$NodeRequire;")
	
			for(let i=0;i< info.preloadedModules.length;i++){
				let mod = info.preloadedModules[i]
				if(mod.builtin){
					let modtext = info.requires[i]
					if(this.#options.target != "node"){
						let replace = nodeTranslations[modtext]
						if(replace){
							let replaceInfo = await kawix.importInfo(replace)
							await addInfo(replaceInfo)
							modtext = replace
						}
					}
					nstr.push(`preloadedModules[${i}] = KModule.re${"q"}uire(${JSON.stringify(modtext)})`)
				}
				else if(mod.request){
					if(mod.request.startsWith("npm://")){
						/*
						let ureq = "https://esm.sh/" + mod.request.substring(6)
						let replaceInfo = await global.kawix.importInfo(ureq)
						await addInfo(replaceInfo)
						*/
						let name = mod.request.substring(6)
						npmModules.add(name)
						nstr.push(`preloadedModules[${i}] = $$NPMRequires[${JSON.stringify(name)}]`)				
						
					}
					else if(/kwruntime\/core(\@[0-9\.A-Za-z]+)?\/src\/kwruntime(\.ts)?$/.test(mod.request)){
						// Internal module
						nstr.push(`preloadedModules[${i}] = {KModule:KModule, kawix: KModule.global.kawix || KModule}`)
					}
					else{
						nstr.push(`preloadedModules[${i}] = KModule.require(${JSON.stringify(mod.request)})`)
					}
				}
				else if(mod.mode == "node"){
					nstr.push(`preloadedModules[${i}] = $$NPMRequires[${JSON.stringify(mod.location.main)}]`)
					nodeFiles.add(mod.location.main)
				}
			}
			//var [${info.vars.names.join(",")}] = arguments[0]

			// get async requires 
			let asyncRequires = [], moreModules = []
			
			while(true){
				let match = info.result.code.match(/\s+asyncRequire\((\"[^\"]+\")\)/i)
				if(!match || !match[1]) break 

				let arequire = JSON.parse(match[1])
				let custom = true 
				if(arequire.startsWith("npm://")){
					let npm = this.#options.npmExternalModules
					if(npm && (npm.indexOf(arequire) >=0)){
						custom = false
					}
				}
				else if(info.request.startsWith("http:") || info.request.startsWith("https:")){
					arequire = new URL(arequire, info.request).href
				}
				else if(arequire.startsWith("gh+/") || arequire.startsWith("gl+/") || arequire.startsWith("github:/") || arequire.startsWith("gitlab:/")){
					custom = false
				}
				else{
					arequire = Path.resolve(Path.dirname(info.request), arequire)
				}
				
				if(custom){
					let impInfo = await kawix.importInfo(arequire)
					moreModules.push(impInfo)
				}

				info.result.code = info.result.code.substring(0, match.index) + " asyncRequire( " + JSON.stringify(arequire) + info.result.code.substring(match.index + 14 + match[1].length)
				asyncRequires.push(match[1])
				
				
			}

			let ncode = `$$Files[${JSON.stringify(info.request)}] = function(){
				
				${nstr.join("\n")}
				${info.result.code}
			};`;
			this.#code.push(ncode)
	
			
	
			for(let mod of info.preloadedModules){
				if(mod.filename){
					await addInfo(mod)
				}
			}

			if(moreModules?.length){
				for(let mod of moreModules){
					if(mod.filename){
						await addInfo(mod)
					}
				}
			}
		}


		

		if(this.#options.target != "node"){
			process.env.KW_USER_AGENT= "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
		}
		else{
			delete process.env.KW_USER_AGENT
		}
		let info = await kawix.importInfo(file)
		if(this.#options.target != "node"){
			let bufferInfo = await kawix.importInfo(Builder.nodeTranslations.buffer)
			await addInfo(bufferInfo)
		}
		await addInfo(info)

		if(npmModules.size > 0){
			let reg = new Registry()
			let mnames = []
			for(let name of npmModules){
				let uri = new URL("npm://" + name)
				let text = name 
				let modname = (uri.username ? (uri.username + "@" + uri.host + uri.pathname) :  uri.pathname.substring(2))
				let i = name.indexOf("@")
				name = modname.substring(0,i)
				let version = modname.substring(i + 1)
				mnames.push({
					search: uri.search,
					searchParams: uri.searchParams,
					modname,
					name,
					version,
					text
				})
			}
			let externalModules = []
			if(this.#options.excludeNpmModules){
				externalModules = mnames
				mnames = []
			}
			else if(this.#options.npmExternalModules){
				externalModules = mnames.filter((a)=> this.#options.npmExternalModules.indexOf(a.modname) >= 0)
				mnames = mnames.filter((a)=> this.#options.npmExternalModules.indexOf(a.modname) < 0)
			}
			
			if(externalModules.length){
				console.info(this.#options.npmEnv)
				let info = await kawix.importInfo(kawix.packageLoader)
				console.info("> Using loader:", kawix.packageLoader)
				await addInfo(info)

				let mcode = []
				mcode.push("exports.kawixPreload = async function(){")
				let code = `
				
				var loader = $$KModule.require(${JSON.stringify(info.request)})

				var reg = new loader.Registry()
				reg.env = ${JSON.stringify(this.#options.npmEnv || {})}
				var modReqs = ${JSON.stringify(externalModules)}
				var modInfos = []				
				if(modReqs.length == 1){
					var modr= modReqs[0]
					modInfos = [await reg.resolve(modr.name + "@" + modr.version)]
				}else{
					modInfos = await reg.resolveMany(modReqs)
				}

				var createGet = function(mod, modr){
					Object.defineProperty($$NPMRequires, modr.name + "@" + modr.version, {
						get: function(){
							return $$NodeRequire(mod.main)
						}
					})
				}
				for(let i=0;i<modInfos.length;i++){
					var mod = modInfos[i]
					var modr = modReqs[i]
					if(!$$NPMRequires){
						$$NPMRequires = {}
					}
					createGet(mod, modr)					
				}

				if(typeof exports.kawixPreload.loader == "function"){
					await exports.kawixPreload.loader()
				}
				`
				mcode.push(code)
				mcode.push("}")
				preloadCode = mcode
			}
			if(mnames.length){
				let mcode = []
				let modInfos = await reg.resolveMany(mnames)
				let mfolder = Path.dirname(Path.dirname(modInfos[0].folder))
				let mfile = Path.join(mfolder, "$main.ts")
				let mfile2 = Path.join(mfolder, "$compiled.ts")
				//mcode.push("class NPMModules{")
				for(let mod of mnames){
					/*
					mcode.push(`\tstatic get ["${mod.name}@${mod.version}"](){`)
					mcode.push(`\t\treturn re${"q"}uire("${mod.name}")`)
					mcode.push("}")
					*/

					mcode.push(`Object.defineProperty($$NPMRequires, "${mod.name}@${mod.version}", {
						get(){
							return re${"q"}uire("${mod.name}")
						}
					})`)
				}

				
				if(nodeFiles.size){
					for(let file of nodeFiles){
						mcode.push(`Object.defineProperty($$NPMRequires, ${JSON.stringify(file)}, {
							get(){
								return re${"q"}uire(${JSON.stringify(file)})
							}
						})`)
					}
				}

				//mcode.push("}; console.info('here-->'); $$modParams.exports.default = NPMModules")
				await fs.promises.writeFile(mfile,mcode.join("\n"))
				

				if(this.#options.target == "node"){
					await esbuild.build(Object.assign({
						entryPoints: [mfile],
						bundle: true,
						platform: 'node',
						target: "node" + process.version.substring(1).split(".")[0],
						logLevel: 'error',
						outfile: mfile2
					}, this.#options.esbuild || {}))
				}
				else{
					await esbuild.build(Object.assign({
						entryPoints: [mfile],
						bundle: true,
						target: this.#options.target,
						logLevel: 'error',
						outfile: mfile2
					}, this.#options.esbuild || {}))
				}

				let content = await fs.promises.readFile(mfile2, 'utf8')
				content = "\n//KWRUNTIME-DISABLE-TRANSPILATION\n" + content
				await fs.promises.writeFile(mfile2, content)

				let info = await kawix.importInfo(mfile2)
				await addInfo(info)
				npmFile = mfile2
			}

			
		}

		//console.info("NPM Modules:", [...npmModules])


		let str = this.#code
		str.push("function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }")
		str.push($$$createKModule.toString())
		str.push("var $$module = null")
		str.push("try{ $$module = module } catch(e){}")
		str.push(`var $$KModule =  $$$createKModule($$filename).addFiles($$Files)`)
		if(this.#options.target != "node"){
			str.push(`if(!$$KModule.global.Buffer) $$KModule.global.Buffer = $$KModule.re${"q"}uire('${nodeTranslations.buffer}').Buffer`)
		}
		if(npmFile){
			str.push(`$$NPMRequires = {}; $$KModule.re${"q"}uire("${npmFile}").default`)	
		}
		if(preloadCode.length){
			preloadCode[preloadCode.length - 1] = `$$KModule.$re${"q"}uire([${JSON.stringify(info.request)}], $$module)`
			preloadCode.push("}")
			str.push(preloadCode.join("\n"))
		}
		else{
			str.push(`$$KModule.$re${"q"}uire([${JSON.stringify(info.request)}], $$module)`)
		}
		

	}

	async writeTo(stream: string | Writable){
		if(typeof stream == "string"){
			stream = fs.createWriteStream(stream) 
		}
		let def = new async.Deferred<void>()
		stream.once("error", def.reject)
		
		stream.write(this.source.code)
		stream.end()
		stream.once("finish", def.resolve)
		await def.promise 
	}

	get source(){
		let result = null, asyncRequires = []
		if(this.#options.minify){
			let minify = null
			if(this.#options.minify === true){
				minify = {}
			}
			else{
				minify = this.#options.minify
			}

			result = esbuild.transformSync(this.#code.join("\n"), {
				minify: true,
			})

			
			result.code = "\n//KWRUNTIME-DISABLE-TRANSPILATION\n" + result.code
		}
		else{
			result = esbuild.transformSync(this.#code.join("\n"), {
			})
			result.code = "\n//KWRUNTIME-DISABLE-TRANSPILATION\n" + result.code

			
		}
		return result

		
		//return jsBeautify(this.#code.join("\n"))
	}
}


export class Program{

	static async main(){
		let params:any = {}
		for(let i=1;i<kawix.appArguments.length;i++){
			let arg = kawix.appArguments[i]
			let parts = arg.split("=")
			let name = parts[0].substring(2)

			let value = parts.slice(1).join("=") || ''
			params[name] = value
			params[name+"_Array"] = params[name+"_Array"] || []
			params[name+"_Array"].push(value)
		}

		let options = {
			target: 'browser'
		}
		if(params.target){
			options.target = params.target
		}
		let builder = new Builder(options)
		await builder.compile(params.main)
		await builder.writeTo(params.out)
	}

}
