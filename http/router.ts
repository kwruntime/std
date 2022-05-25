import Trouter,{Methods} from 'npm://trouter@3.2.0'
import { Server } from './server.ts'
import {HttpContext} from './context.ts'
import {Exception} from '../util/exception.ts'

export interface RouterHttpListener{
	(context: HttpContext) : void
}

export class Router{

	#raw: Trouter
	#internal: Trouter

	catchNotFound = false 
	catchUnfinished = false

	static internalMethods = [
		"ERROR",
		"NOTFOUND",
		"UNFINISHED"
	]

	constructor(){
		//this.#raw = findmyway()
		this.#raw = new Trouter()
		this.#internal = new Trouter()
	}

	get raw(){
		return this.#raw
	}

	attachToServer(server: Server){
		server.on("request", this.lookup.bind(this))
	}

	attachToRouter(path: string, router: Router){
		return router.use(path, (context) => {
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
			error: {
				message: context.error.message || String(context.error),
				code: context.error.code || context.error.type || "Unknown",
				stack: context.error.stack
			}
		}
		
		context.reply.code(500).header("content-type","application/json;charset=utf8")
		context.reply.send(json)
		console.info("Status code:", context.reply.raw.statusCode)
	}


	async lookup(context: HttpContext){
		if(await this.$lookup(context) === false){
			if(this.catchNotFound){
				return await this.$lookup(context, "NOTFOUND")
			}
		}		
		if(context.reply){
			if((!context.reply.raw.writableEnded) && this.catchUnfinished){
				return await this.$lookup(context, "UNFINISHED")
			}
		}
	}

	async $lookup(context: HttpContext, method = null, url = null){

		if(!method) method = context.request.method as Methods
		let obj:any = {}
		if(Router.internalMethods.indexOf(method) >= 0){
			obj = this.#internal.find(method, url || context.request.uri.pathname)
			if(!obj.handlers.length){
				let func = null 
				if(method == "ERROR") func = this.#Error.bind(this)
				else func = this.#NotFound.bind(this)
				obj.handlers.push(func)
			}
		}
		else{
			obj = this.#raw.find(method, url || context.request.uri.pathname)
		}
		
		context.request.params = obj.params
		if(!obj.handlers.length) return false 
		
		let ourl = context.request.uri.pathname	
		for(let fn of obj.handlers){
			try{
				await fn(context)
				if(context.reply?.raw?.writableEnded) break 
			}catch(e){
				console.error("> kwruntime/http server ERROR:", e.message)
				if(method != "ERROR"){
					context.error = e 
					if(!context.reply?.raw?.writableEnded){
						await this.$lookup(context, "ERROR", ourl)
					}
				}
			}
		}


	}

	on(method: Methods | "ALL" | "USE", path: string, listener: RouterHttpListener){

		
		if(method == "ALL"){
			this.#raw.all(path, listener)
		}
		else if(method == "USE"){
			this.#raw.use(path, listener)
		}
		else{
			if(Router.internalMethods.indexOf(method) >= 0){
				this.#internal.add(method, path, listener)
				return this
			}

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

	use(path: string, listener: RouterHttpListener | Router){		
		// change URL in request
		const realHandler = (context: HttpContext) => {
			context.request.urlInfo.parent = context.request.url
			context.request["$seturl"](context.request.url.substring(path.length))
			//console.info("new url:",context.request.url)
			let route = listener as Router
			if(typeof route.lookup == "function"){
				return route.lookup(context)
			}
			else{
				return (listener as RouterHttpListener)(context)
			}
		}

		return this.#raw.use(path, realHandler)
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