import {Program, langs} from './mod.ts'

main()
async function main(){
	let lang = 'en'
	try{
		await Program.uiInstall()
	}
	catch(e){
		console.error("\x1b[31m\x1b[1m" + langs[lang].onerror + ":\x1b[0m", e.message)
		console.info()
	}
}