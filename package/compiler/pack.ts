// pack the source code in a special format called BinaryTypescript
// .kwb extension
import fs from 'fs'
import * as async from "gh+/kwruntime/std@1.1.4/util/async.ts"
import Zlib from 'zlib'
import Path from 'path'
import tar from 'npm://tar@6.1.11'
import crypto from 'crypto'
import { Writable } from 'stream'
import {Builder} from './build.ts'

export interface PackagerOptions{
	workingFolder?: string // carpeta destino
	root?: string	
	compression?: {
		type: "gzip" | "brotli"
		params?: any 
	}
	follow?: boolean // follow symlinks?
	main?: string // main file

	hash?: string 
	useDataFolder?: boolean 

	buildOptions?: {
		npmExternalModules: string[]
	}
}
export class Packager{

	#options: PackagerOptions
	#hashs:string[] = []
	#files = []

	constructor(options: PackagerOptions){
		this.#options = options 
	}


	async writeTo(stream: string | Writable){
		if(typeof stream == "string"){
			stream = fs.createWriteStream(stream)
		}

		let def = new async.Deferred<void>()
		stream.once("error", def.reject)
		stream.once("finish", def.resolve)

		stream.write("#!/usr/bin/env kwrun\n")
		// get javascript code 
		let runtimeFile = Path.join(__dirname, "pack.runtime.ts")
		if(!import.meta.url.startsWith("file:")){
			runtimeFile = (new URL("pack.runtime.ts", import.meta.url)).href
		}


		let builder = new Builder({
			target: 'node'
		})
		await builder.compile(runtimeFile)
		let codeStr = builder.source.code


		let sha1 = crypto.createHash('sha1')
		let hash = ''
		if(this.#options.hash){
			hash = this.#options.hash
		}else{
			if(this.#files.length == 1){
				hash = this.#files[0].sha1
			}
			else{

				for(let file of this.#files){
					sha1.update(file.sha1)
				}
				hash = sha1.digest("hex")
			}
		}
		let f = this.#files.map(a => {
			return {
				name: a.name,
				type: a.type,
				compression: a.compression
			}
		})

		let hashInfo = {
			hash,
			date: Date.now(),
			useDataFolder: Boolean(this.#options.useDataFolder)
		}
		codeStr += `\n\nexports.kawixPreload = async function (){ $$module.exports = await global.__KWRUNTIME__PACK(__filename, ${JSON.stringify(hashInfo)}, ${JSON.stringify(f)}, ${JSON.stringify(this.#options.main)}); }`
		let code = Buffer.from(codeStr)



		let bufferControl = Buffer.allocUnsafe(8)
		let compression = this.#options.compression?.type || "brotli", compressionc = '0'

		if(compression == "brotli"){
			compressionc = 'b'
			let cargs = this.#options.compression?.params || {
				params:{
					[Zlib.constants.BROTLI_PARAM_QUALITY]: 4
				}
			}
			let def = new async.Deferred<Buffer>()
			Zlib.brotliCompress(code, cargs, (err, data)=>{
				if(err) return def.reject(err)
				def.resolve(data)
			})
			code = await def.promise
		}
		else if(compression == "gzip"){
			compressionc = 'g'
			let cargs = this.#options.compression?.params || {}
			let def = new async.Deferred<Buffer>()
			Zlib.gzip(code, cargs, (err, data)=>{
				if(err) return def.reject(err)
				def.resolve(data)
			})
			code = await def.promise
		}
		bufferControl.writeInt32LE(code.length)

		let meta = {}, offset = 0
		for(let file of this.#files){
			if(file.file){
				let stat = await fs.promises.stat(file.file)
				meta[file.name] = {
					offset,
					length: stat.size
				}
				offset+= stat.size
			}
			else if(file.content){
				meta[file.name] = {
					offset,
					length: file.content.length
				}
				offset+= file.content.length
			}
		}
		let metaBuffer = Buffer.from(JSON.stringify(meta))
		if(compression == "brotli"){
			compressionc = 'b'
			let cargs = this.#options.compression?.params || {
				params:{
					[Zlib.constants.BROTLI_PARAM_QUALITY]: 4
				}
			}
			let def = new async.Deferred<Buffer>()
			Zlib.brotliCompress(metaBuffer, cargs, (err, data)=>{
				if(err) return def.reject(err)
				def.resolve(data)
			})
			metaBuffer = await def.promise
		}
		else if(compression == "gzip"){
			compressionc = 'g'
			let cargs = this.#options.compression?.params || {}
			let def = new async.Deferred<Buffer>()
			Zlib.gzip(metaBuffer, cargs, (err, data)=>{
				if(err) return def.reject(err)
				def.resolve(data)
			})
			metaBuffer = await def.promise
		}

		bufferControl.writeInt32LE(metaBuffer.length, 4)
		stream.write(bufferControl)
		stream.write(compressionc + "\n")
		stream.write(code)
		stream.write("\n")
		stream.write(metaBuffer)

		// start write content 
		for(let file of this.#files){
			if(file.file){
				let def = new async.Deferred<void>()
				let sr = fs.createReadStream(file.file)
				sr.once("error", def.reject)
				sr.once("end", def.resolve)
				sr.on("data", function(bytes){
					stream.write(bytes)
				})
				await def.promise
			}
			else if(file.content){
				stream.write(file.content)
			}
		}
		stream.end()
		await def.promise 

	}
	
	async addSource(source: string, name?: string){
		let file = Path.join(this.#options.workingFolder, "app.ts")
		await fs.promises.writeFile(file, source)
		return await this.addSourceFile(file, name)
	}
	async addSourceFile(file: string, name?: string){
		if(!name){
			if(this.#options.root){
				name = Path.relative(this.#options.root, file)
				while(name.startsWith("../")){
					name = name.substring(0, 3)
				}
			}
			else{
				name = Path.basename(file)
			}
		}

		let builder = new Builder(Object.assign({
			target: 'node'
		}, this.#options.buildOptions || {}))
		await builder.compile(file)
		let code = builder.source.code
		
		let compression = this.#options.compression?.type || "brotli"
		let buffer: Buffer
		if(compression == "brotli"){
			let cargs = this.#options.compression?.params || {
				params:{
					[Zlib.constants.BROTLI_PARAM_QUALITY]: 4
				}
			}
			let def = new async.Deferred<void>()
			Zlib.brotliCompress(Buffer.from(code), cargs, (err, data)=>{
				buffer = data 
				if(err) return def.reject(err)
				def.resolve()
			})
			await def.promise
		}
		else if(compression == "gzip"){
			let cargs = this.#options.compression?.params || {}
			let def = new async.Deferred<void>()
			Zlib.gzip(Buffer.from(code), cargs, (err, data)=>{
				buffer = data 
				if(err) return def.reject(err)
				def.resolve()
			})
			await def.promise
		}

		this.#files.push({
			name,
			content: buffer,
			type: 'file',
			compression,
			sha1: crypto.createHash('sha1').update(buffer).digest('hex')
		})

	}

	
	async add(paths: string[], relative?: string){

		let compression = this.#options.compression?.type || "brotli"
		let compressor = null
		if(compression == "brotli"){
			let cargs = this.#options.compression?.params || {
				params:{
					[Zlib.constants.BROTLI_PARAM_QUALITY]: 4
				}
			}
			compressor = Zlib.createBrotliCompress(cargs)
		}
		else if(compression == "gzip"){
			let cargs = this.#options.compression?.params || {}
			compressor = Zlib.createGzip(cargs)
		}

		
		relative = relative || this.#options.root
		paths = paths.map((a)=> Path.relative(relative, a))
		let sha1 = crypto.createHash('sha1')
		let def = new async.Deferred<void>()
		let name = `data${this.#files.length}.tar.c`
		let tarfile = Path.join(this.#options.workingFolder, name)
		let tars = tar.c({
			gzip: false,
			follow: this.#options.follow,
			cwd: relative
		}, paths)
		tars.on("error", def.reject)

		let tarst:Writable		
		compressor.on("error", def.reject)
		compressor.on("data", function(bytes){
			sha1.update(bytes)
			tarst.write(bytes)
		})
		tarst = fs.createWriteStream(tarfile)
		tarst.on("error", def.reject)
		tarst.on("finish", def.resolve)
		tars.pipe(compressor)
		tarst.on("finish", def.resolve)
		compressor.on("end", ()=> tarst.end())
		await def.promise

		this.#files.push({
			name,
			file: tarfile,
			type: 'tar',
			compression,
			sha1: sha1.digest("hex")
		})

	}

}