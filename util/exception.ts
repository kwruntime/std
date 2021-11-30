
export class Exception extends Error {
	code: string
	innerException: Error
	
	static create(message:string, innerException = null) {
		let e = new Exception(message)
		if (innerException) {
			e.innerException = innerException
		}
		return e
	}

	putCode(code: string) {
		this.code = code
		return this
	}

	putStack(stack: string) {
		this.stack = stack
		return this
	}

	putMessage(message: string) {
		this.message = message
		return this
	}

	raise() {
		throw this
	}

}

export default Exception
