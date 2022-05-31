/** This script is for install KwRuntime/core */
import axios from 'npm://axios@0.21.1'
import Os from 'os'
import Path from 'path'
import fs from 'fs'
import tar from 'npm://tar@6.1.11'
import * as async from '../util/async.ts'
import {Exception} from '../util/exception.ts'
import Child from 'child_process'


export var langs = {
	"en": {
		"onerror": "> Failed to install",
		"nofiles": "No suitable files found for",
		"notnodejs": "NodeJS cannot be installed. Test installing manually",
		"installing": "Installing KwRuntime, please wait a moment.",

		"finished": {
			text: "Press enter to close.",
			button: "CLOSE"
		}
	},
	"es": {
		"onerror": "> Falló la instalación",
		"nofiles": "La instalación no está disponible para",
		"notnodejs": "No se pudo instalar NodeJS. Pruebe instalando manualmente",
		"installing": "Instalando KwRuntime, por favor espere un momento.",
		"finished": {
			text: "Presione enter para cerrar",
			button: "CERRAR"
		}
	}
}


export class Program {

	
	static async uiInstall(lang = 'en'){
		console.clear()
		process.title = 'KwRuntime Installer'
		

		try{
			this.logo(lang)
			await this.install(lang)

			// write a button for close
			let text = langs[lang].finished.text
			let button = "  " + langs[lang].finished.button + "  "
			let diff = Math.max( Number(((process.stdout.columns - text.length) / 2).toFixed(0)), 0 )
			let diff2 = Math.max( Number(((process.stdout.columns - button.length) / 2).toFixed(0)), 0 )
			process.stdout.write(`\n${" ".repeat(diff) + text}\n${" ".repeat(diff2) + "\x1b[47m\x1b[30m" + button}\x1b[0m`)

			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.on("data", process.exit.bind(process,0))

		}
		catch(e){
			console.error("\x1b[31m\x1b[1m" + langs[lang].onerror + ":\x1b[0m", e.message)
			console.info()
		}

	}

	static logo(lang = 'en'){
		// print in window the logo 

		let words = [`
░█─▄▀ ░█──░█ ░█▀▀█ ░█─░█ ░█▄─░█ ▀▀█▀▀ ▀█▀ ░█▀▄▀█ ░█▀▀▀ 
░█▀▄─ ░█░█░█ ░█▄▄▀ ░█─░█ ░█░█░█ ─░█── ░█─ ░█░█░█ ░█▀▀▀ 
░█─░█ ░█▄▀▄█ ░█─░█ ─▀▄▄▀ ░█──▀█ ─░█── ▄█▄ ░█──░█ ░█▄▄▄`,
`
 ▀█▀ ░█▄─░█ ░█▀▀▀█ ▀▀█▀▀ ─█▀▀█ ░█─── ░█─── ░█▀▀▀ ░█▀▀█ 
 ░█─ ░█░█░█ ─▀▀▀▄▄ ─░█── ░█▄▄█ ░█─── ░█─── ░█▀▀▀ ░█▄▄▀ 
 ▄█▄ ░█──▀█ ░█▄▄▄█ ─░█── ░█─░█ ░█▄▄█ ░█▄▄█ ░█▄▄▄ ░█─░█`
		]


		let logoWords = words.map((a) => a.substring(1).split("\n"))
		
		let diff = Number(((process.stdout.columns - logoWords[0][0].length) / 2).toFixed(0))
		if(diff < 0){
			logoWords = [
				[
					"------------------------",
					"  KWRUNTIME INSTALLER   ",
					"------------------------"
				]
			]
			diff = Math.max(Number(((process.stdout.columns - logoWords[0][0].length) / 2).toFixed(0)), 0)
			
		}
		const toWrite = logoWords.map( (a) => a.map( (b) => (" ".repeat(diff) + b)).join("\n") )

		
		console.info(`

\x1b[32m${toWrite.join("\n\n")}\x1b[0m


\x1b[33m> ${langs[lang].installing}\x1b[0m`) 
	}

	static async install(lang = 'en'){
		
		let kwruntimeFolder = Path.join(Os.homedir(), "KwRuntime")
		if(!fs.existsSync(kwruntimeFolder)) fs.mkdirSync(kwruntimeFolder)

		let bin = Path.join(kwruntimeFolder,"bin")
		if(!fs.existsSync(bin)) fs.mkdirSync(bin)

		let runtime = Path.join(kwruntimeFolder,"runtime")
		if(!fs.existsSync(runtime)) fs.mkdirSync(runtime)

		let arch = Os.arch()
		if(arch == "ia32") arch = "x86"

		let response = await axios({
			method:'GET',
			url: "https://raw.githubusercontent.com/kwruntime/core/main/install.info.json"
		})
		let platformData = response.data[Os.platform()]
		let files = platformData?.files
		if(!files){
			throw Exception.create(`${langs[lang].nofiles}: ${Os.platform}-${arch}`).putCode("UNSUPPORTED_PLATFORM")
		}


		for(let file of files){
			let out = Path.join(kwruntimeFolder, file.path)
			let response = await axios({
				method:'GET',
				url: file.href,
				responseType: 'arraybuffer'
			})
			let bytes = Buffer.from(response.data)
			await fs.promises.writeFile(out, bytes)

			if(file.compression == "tar+gz"){
				// extract 
				let def = new async.Deferred<void>()
				let sr = fs.createReadStream(out)
				sr.on("error", def.reject)
				let sw = tar.x({
					C: Path.dirname(out)
				})
				sw.on("error", def.reject)
				sw.on("finish", def.resolve)
				sr.pipe(sw)
				await def.promise
			}
		}


		let nodeversion = process.version.split(".")
		if(nodeversion[0] < "14"){
			// download nodejs 
			let nodeInfo = platformData.node[arch]
			if(!nodeInfo){
				throw Exception.create(`${langs[lang].nofiles}: ${Os.platform}-${arch}`).putCode("UNSUPPORTED_PLATFORM")
			}	
			if(Os.platform() == "win32"){
				let release = Os.release().split(".").map(Number)
				if(release[0] <= 6 && release[1] <= 1){
					// windows 7 
					nodeInfo = nodeInfo.filter((a)=> a.os == "<windows8")
				}
			}
			let installable = nodeInfo[0]
			if(!installable){
				throw Exception.create(`${langs[lang].nofiles}: ${Os.platform}-${arch}`).putCode("UNSUPPORTED_PLATFORM")	
			}

			

			/*nodefolder = Path.join(nodefolder, arch)
			if(!fs.existsSync(nodefolder)) fs.mkdirSync(nodefolder)*/


			let nodeTar = Path.join(bin, installable.name)
			let response = await axios({
				method:'GET',
				url: installable.href,
				responseType: 'arraybuffer'
			})
			let bytes = Buffer.from(response.data)
			await fs.promises.writeFile(nodeTar, bytes)

			// extract 
			let def = new async.Deferred<void>()
			let sr = fs.createReadStream(nodeTar)
			sr.on("error", def.reject)
			let sw = tar.x({
				C: Path.dirname(nodeTar)
			})
			sw.on("error", def.reject)
			sw.on("finish", def.resolve)
			sr.pipe(sw)
			await def.promise

		}
		else{

			let nodefolder = Path.join(bin, arch)
			if(!fs.existsSync(nodefolder)) fs.mkdirSync(nodefolder)
			nodefolder = Path.join(nodefolder, process.version)
			if(!fs.existsSync(nodefolder)) fs.mkdirSync(nodefolder)

			let nodeexe = Path.join(nodefolder, "node")
			if(Os.platform() == "win32") nodeexe += ".exe"
			if(process.execPath != nodeexe){
				// copy ...
				await fs.promises.copyFile(process.execPath, nodeexe)
			}
		}

		// get best node executor


		let folders = await fs.promises.readdir(Path.join(bin, arch))

		let bynumber:any = {}
		let convertVersion = function(version){
			let items = version.split(".").map(Number)
			let factor = 1 , value = 0
			for(let i=items.length-1;i>=0;i--){
				if(isNaN(items[i])){
					items[i] = 0
				}
				value += items[i] * factor
				factor *= 10000
			}
			bynumber[value] = version
			return value
		}
		
		let majorversion = folders.map(convertVersion).sort().reverse()[0]
		if(!majorversion){
			throw Exception.create(`${langs[lang].notnodejs}`).putCode("NODEJS_NOT_FOUN")	
		}

		let nodeexe =  Path.join(bin, arch, bynumber[majorversion], "node")
		if(Os.platform() == "win32") nodeexe += ".exe"

		let def = new async.Deferred<void>()
		let p = Child.spawn(nodeexe, [Path.join(runtime, "kwruntime.js"), "--self-install"], {
			stdio:'inherit'
		})
		p.once("exit", def.resolve)
		p.once("error", def.reject)
		await def.promise


	}
}

