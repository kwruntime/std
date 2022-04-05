import {Request} from '../context.ts'
export class JsonParser{

	static async parse(req: Request){
		let text = await req.body.text()
		return JSON.parse(text)
	}
}

export default JsonParser