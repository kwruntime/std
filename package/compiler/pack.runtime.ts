

import tar from 'npm://tar@6.1.11'
import * as async from 'gh+/kwruntime/std@1.1.4/util/async.ts'
import fs from 'fs'
import Zlib from 'zlib'
import Os from 'os'
import Path from 'path'

global.__KWRUNTIME__PACK = runtime
async function runtime(filename: string, hashInfo: any, files: any[], main: string){

	let outfolder = Path.join(Os.tmpdir(), "kwruntime")
	if(hashInfo.useDataFolder){
		outfolder = Path.join(Os.homedir(), ".kawi")
		if(!fs.existsSync(outfolder)) fs.mkdirSync(outfolder)
		outfolder = Path.join(outfolder, "user-data")
		if(!fs.existsSync(outfolder)) fs.mkdirSync(outfolder)
		outfolder = Path.join(outfolder, "kwb")
		if(!fs.existsSync(outfolder)) fs.mkdirSync(outfolder)
	}

	if(!fs.existsSync(outfolder)) fs.mkdirSync(outfolder)
	outfolder = Path.join(outfolder, hashInfo.hash)
	if(!fs.existsSync(outfolder)) fs.mkdirSync(outfolder)
	let okfile = Path.join(outfolder, "date")
	let needUncompress= true
	if(fs.existsSync(okfile)){
		let date = Number(fs.readFileSync(okfile, 'utf8'))
		if(date >= (hashInfo.date|| 0)){
			needUncompress = false 
		}
	}


	if(needUncompress){		
		let binary = kawix.getBinary(filename)
		for(let file of files){

			let dec = null
			let def = new async.Deferred<void>()
			if(file.compression == "brotli"){
				dec = Zlib.createBrotliDecompress()
			}
			else if(file.compression == "gzip"){
				dec = Zlib.createGunzip()
			}
			dec.on("error", def.reject)
			
			let sr = await binary.getStream(file.name)
			sr.on("error", def.reject)
			if(file.type == "tar"){	
				let tars = tar.x({
					gzip: false, 
					C: outfolder
				})
				tars.on("error", def.reject)				
				
				sr.pipe(dec).pipe(tars)
				tars.on("finish", def.resolve)
			}
			else if (file.type == "file"){

				let parts = file.name.split("/")
				for(let i=0;i<parts.length-1;i++){
					let part = parts[i]
					let folder = Path.join(outfolder, part)
					if(!fs.existsSync(folder)) fs.mkdirSync(folder)
				}

				let w = fs.createWriteStream(Path.join(outfolder, file.name))
				w.once("error", def.reject)
				sr.pipe(dec).pipe(w)
				w.on("finish", def.resolve)
			}
			await def.promise
		}

		fs.writeFileSync(okfile, String(hashInfo.date || 0))

	}
	if(main){
		let mainfile = Path.join(outfolder, main)
		global.kawix.setData(mainfile, "binaryFile", filename)
		let mod = await global.kawix.import(mainfile)
		//mod.kwRuntimeBinaryFile = filename
		return mod 
	}
	return {
		folder: outfolder
	}
}