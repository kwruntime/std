import {Request} from '../context.ts'
export class TextParser{

	static async parse(req: Request){
		let bytes = await req.body.buffer()
		let contentType = req.headers["content-type"]
		let charset = contentType.split(";").map(function(a){
			let parts = a.split("=")
			return {
				name: parts[0].toUpperCase(),
				value: parts[1]
			}
		}).filter((a) => a.name == "CHARSET")[0]
		return bytes.toString((charset?.value || "utf-8") as BufferEncoding)
	}
}

export default TextParser