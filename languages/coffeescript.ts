
import coffeescript from 'npm://coffeescript@2.7.0'
import {KModule, kawix} from "github://kwruntime/core@8a14c7d/src/kwruntime.ts"
import Module from 'module'
import fs from 'fs'
KModule.addExtensionLoader(".coffee", {
	compile: coffeeScriptCompile
})


export async function coffeeScriptCompile(filename: string, module: Module, options: any){

	let content = await fs.promises.readFile(filename,"utf8")
	let source = coffeescript.compile(content, {
		inlineMap: true,
		filename
	})
	let info = await kawix.compileSource(source, Object.assign({}, options, {
		filename
	}))
	return info  


}