
import cson from 'npm://cson-parser@4.0.9'
import {KModule, kawix} from "github://kwruntime/core@8a14c7d/src/kwruntime.ts"
import Module from 'module'
import fs from 'fs'

KModule.addExtensionLoader(".cson", {
	compile: csonParse
})


export var parse = cson.parse 
export var stringify = cson.stringify 

export async function csonParse(filename: string, module: Module, options: any){

	let content = await fs.promises.readFile(filename,"utf8")
	let json = cson.parse(content, null)
	let source = "module.exports = " + JSON.stringify(json, null, '\t')
	let info = await kawix.compileSource(source, Object.assign({}, options, {
		filename
	}))
	return info  


}