
export class Exception extends Error {
	code: string 
	static create(message, innerException = null) {
		var e;
		e = new Exception(message);
		if (innerException) {
			e.innerException = innerException;
		}
		return e;
	}

	putCode(code) {
		this.code = code;
		return this;
	}

	putStack(stack) {
		this.stack = stack;
		return this;
	}

	putMessage(message) {
		this.message = message;
		return this;
	}

	raise() {
		throw this;
	}

};

export default Exception;
