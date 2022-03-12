import {Request} from '../context.ts'
import * as async from '../../util/async.ts'
import {Exception} from '../../util/exception.ts'

export class BufferParser{

	static async parse(req: Request){
		let len = 0, def = new async.Deferred<void>()
		let maxlen = req.server.maxBodyLength
		let buffers = []

		req.stream.on("error", def.reject)
		req.stream.on("data", function(bytes){
			len += bytes.length 
			if(len >= maxlen){
				def.reject()
				return Exception.create("Body exceeds max length").putCode("MAX_LENGTH_EXCEEDED")
			}
			buffers.push(bytes)
		})
		req.stream.on("end", def.resolve)
		await def.promise

		return Buffer.concat(buffers)
	}
	
}

export default BufferParser