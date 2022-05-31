import {Builder} from '../package/compiler/build.ts'
import Path from 'path'

export class Program{
	static async main(){
		let builder = new Builder({
			target:'node'
		})
		await builder.compile(Path.join(__dirname, "main.ts"))
		await builder.writeTo(Path.join(__dirname, "installer.js"))
	}
}