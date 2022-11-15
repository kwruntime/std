import {Request} from '../context.ts'
import qs from 'npm://qs@6.10.3'

export class FormEncoded{

	static async parse(req: Request){
		let text = await req.body.text()
		return qs.parse(text)
	}
}

export default FormEncoded