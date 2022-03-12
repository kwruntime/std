import Trouter,{Methods} from 'npm://trouter@3.2.0'
import { Server } from './server.ts'
import {HttpContext} from './context.ts'
import {Exception} from '../util/exception.ts'

export interface RouterHttpListener{
	(context: HttpContext) : void
}

export class Router{

	//#raw: findmyway.Instance<findmyway.HTTPVersion.V1>
	//#listeners = new Map<string, Map<any, Function>>()

	#raw: Trouter
	
	
	constructor(){
		//this.#raw = findmyway()
		this.#raw = new Trouter()
	}

	get raw(){
		return this.#raw
	}

	attachToServer(server: Server){
		server.on("request", this.lookup.bind(this))
	}

	attachToRouter(path: string, router: Router){
		return router.use(path, (context) => {
			//let url = "/" + context.request.params["*"]
			//context.request.$seturl(url)
			let url = context.request.url.substring(path.length)
			context.request.$seturl(url)
			return this.lookup(context) 
		})
	}

	#NotFound(context: HttpContext){
		let json = {
			message: "Page not found",
			code: "ERROR404"
		}
		context.reply.code(404).header("content-type","application/json;charset=utf8")
		context.reply.send(json)
	}

	#Error(context: HttpContext){
		let json = {
			message: context.error.message || String(context.error),
			code: context.error.code || context.error.type || "Unknown"
		}
		
		context.reply.code(500).header("content-type","application/json;charset=utf8")
		context.reply.send(json)
	}

	async lookup(context: HttpContext){
		let obj = this.#raw.find(context.request.method as Methods, context.request.uri.pathname)
		context.request.params = obj.params
		if(!obj.handlers.length){
			// find ERROR404
			obj = this.#raw.find("404" as Methods, context.request.url)
			if(!obj.handlers.length){
				obj.handlers = [this.#NotFound.bind(this)]
			}
		}
		for(let fn of obj.handlers){
			try{
				await fn(context)
			}catch(e){
				// return 500 error
				context.error = e 
				if(!context.reply.raw.writableEnded){
					obj = this.#raw.find("ERROR" as Methods, context.request.url)
					let fn1 = obj.handlers[0] || this.#Error.bind(this)
					try{
						await fn1(context)
					}catch(e){
						console.error("> kwruntime/http server ERROR:", e.message)
					}
				}
			}
		}

		/*
		let defaultResult = this.#raw.find("ERROR404", context.request.uri.pathname)
		try{
			let result = this.#raw.find(context.request.method, context.request.uri.pathname)
			if(result){
				await result.handler.call(context, context.request.raw, context.reply.raw, result.params)
			}
			else if(defaultResult){
				await defaultResult.handler.call(context, context.request.raw, context.reply.raw, defaultResult.params)
			}
			else{
				return context.reply.code(404).send({
					error: {
						code: 'ERROR404',
						message: 'NOT FOUND'
					}
				})
			}
		}catch(e){
			return context.reply.code(500).send({
				error: {
					code: 'ERROR500',
					message: e.message
				}
			})
		}*/

	}

	on(method: Methods | "ALL" | "USE", path: string, listener: RouterHttpListener){
		/*
		let listens = this.#listeners.get(String(method))
		if(!listens){
			listens = new Map<any, Function>()
			this.#listeners.set(String(method), listens)
		}
		listens.set(listener, realfunc)
		*/
		if(method == "ALL"){
			this.#raw.all(path, listener)
		}
		else if(method == "USE"){
			this.#raw.use(path, listener)
		}
		else{
			this.#raw.add(method, path, listener)
		}
		return this 
	}

	get(path: string, listener: RouterHttpListener){
		return this.on("GET", path, listener)
	}

	all(path: string, listener: RouterHttpListener){
		return this.on("ALL", path, listener)
	}

	copy(path: string, listener: RouterHttpListener){
		return this.on("COPY", path, listener)
	}

	delete(path: string, listener: RouterHttpListener){
		return this.on("COPY", path, listener)
	}

	head(path: string, listener: RouterHttpListener){
		return this.on("HEAD", path, listener)
	}

	link(path: string, listener: RouterHttpListener){
		return this.on("LINK", path, listener)
	}

	lock(path: string, listener: RouterHttpListener){
		return this.on("LOCK", path, listener)
	}

	merge(path: string, listener: RouterHttpListener){
		return this.on("MERGE", path, listener)
	}

	move(path: string, listener: RouterHttpListener){
		return this.on("MOVE", path, listener)
	}

	notify(path: string, listener: RouterHttpListener){
		return this.on("NOTIFY", path, listener)
	}

	options(path: string, listener: RouterHttpListener){
		return this.on("OPTIONS", path, listener)
	}

	patch(path: string, listener: RouterHttpListener){		
		return this.on("PATCH", path, listener)
	}


	post(path: string, listener: RouterHttpListener){
		return this.on("POST", path, listener)
	}

	purge(path: string, listener: RouterHttpListener){
		return this.on("PURGE", path, listener)
	}

	put(path: string, listener: RouterHttpListener){
		return this.on("PUT", path, listener)
	}

	rebind(path: string, listener: RouterHttpListener){
		return this.on("REBIND", path, listener)
	}

	report(path: string, listener: RouterHttpListener){
		return this.on("REPORT", path, listener)
	}

	search(path: string, listener: RouterHttpListener){
		return this.on("SEARCH", path, listener)
	}

	source(path: string, listener: RouterHttpListener){
		return this.on("SOURCE", path, listener)
	}

	subscribe(path: string, listener: RouterHttpListener){
		return this.on("SUBSCRIBE", path, listener)
	}

	trace(path: string, listener: RouterHttpListener){
		return this.on("TRACE", path, listener)
	}

	unlink(path: string, listener: RouterHttpListener){
		return this.on("UNLINK", path, listener)
	}

	unlock(path: string, listener: RouterHttpListener){
		return this.on("UNLOCK", path, listener)
	}

	unsubscribe(path: string, listener: RouterHttpListener){
		return this.on("UNSUBSCRIBE", path, listener)
	}

	use(path: string, listener: RouterHttpListener){
		return this.#raw.use(path, listener)
	}


	off(method: Methods | "ALL" | "USE", listener: RouterHttpListener){

		/*let listens = this.#listeners.get(String(method))
		if(listens){
			let func = listens.get(listener)
			if(func){
				this.#raw.off(method, func)
				listens.delete(listener)
			}
		}*/
		throw Exception.create("Not implemented method").putCode("NOT_IMPLEMENTED")
		
		
	}




}