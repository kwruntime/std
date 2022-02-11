import findmyway from 'npm://find-my-way@5.1.1'
import { Server } from './server.ts'
import {HttpContext} from './context.ts'

export interface RouterHttpListener{
	(context: HttpContext) : void
}

export class Router{

	#raw: findmyway.Instance<findmyway.HTTPVersion.V1>
	#listeners = new Map<string, Map<any, Function>>()
	
	constructor(){
		this.#raw = findmyway()
	}

	get raw(){
		return this.#raw
	}

	attachToServer(server: Server){
		server.on("request", this.lookup.bind(this))
	}

	attachToRouter(path: string, router: Router){
		return router.all(path + "/*", (context) => {
			let url = "/" + context.request.params["*"]
			context.request.$seturl(url)
			return this.lookup(context) 
		})
	}

	async lookup(context: HttpContext){
		//return this.#raw.lookup(context.request.raw, context.reply.raw, context)
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
		}
	}

	on(method: "ERROR404" | findmyway.HTTPMethod | findmyway.HTTPMethod[], path: string, listener: RouterHttpListener){

		let realfunc = function(a, b, params){
			this.request.params = params
			return listener(this)
		}
		let listens = this.#listeners.get(String(method))
		if(!listens){
			listens = new Map<any, Function>()
			this.#listeners.set(String(method), listens)
		}
		listens.set(listener, realfunc)
		if(method == "ALL"){
			this.#raw.all(path, realfunc)
		}
		else{
			this.#raw.on(method, path, realfunc)
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


	off(method: findmyway.HTTPMethod | findmyway.HTTPMethod[], listener: RouterHttpListener){
		let listens = this.#listeners.get(String(method))
		if(listens){
			let func = listens.get(listener)
			if(func){
				this.#raw.off(method, func)
				listens.delete(listener)
			}
		}
		
	}




}