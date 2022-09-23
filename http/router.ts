//import Trouter,{Methods} from 'npm://trouter@3.2.0'
import { Server } from './server.ts'
import {HttpContext} from './context.ts'
import {Exception} from '../util/exception.ts'
import {parse, inject} from 'npm://regexparam@2.0.1'


export interface RouterHttpListener{
	(context: HttpContext) : void
}

export interface AddMethod{
	(route: string, ...fns: Array<any>) : void
}

export interface Handler{
	params: any
	handlers: Array<any>
}

export class Trouter {
	routes = []

	all: AddMethod
	get: AddMethod
	head: AddMethod
	patch: AddMethod
	options: AddMethod
	connect: AddMethod
	delete: AddMethod
	trace: AddMethod
	post: AddMethod
	put: AddMethod


	constructor() {
		this.all = this.add.bind(this, '');
		this.get = this.add.bind(this, 'GET');
		this.head = this.add.bind(this, 'HEAD');
		this.patch = this.add.bind(this, 'PATCH');
		this.options = this.add.bind(this, 'OPTIONS');
		this.connect = this.add.bind(this, 'CONNECT');
		this.delete = this.add.bind(this, 'DELETE');
		this.trace = this.add.bind(this, 'TRACE');
		this.post = this.add.bind(this, 'POST');
		this.put = this.add.bind(this, 'PUT');
	}

	use(route, ...fns) {
		let handlers = [].concat.apply([], fns);
		let { keys, pattern } = parse(route, true);
		this.routes.push({ keys, pattern, method:'', handlers });
		return this;
	}

	add(method, route, ...fns) {
		let { keys, pattern } = parse(route);
		let handlers = [].concat.apply([], fns);
		this.routes.push({ keys, pattern, method, handlers });
		return this;
	}

	find(method: string, url: string){
		let isHEAD=(method === 'HEAD')
		let result = new Array<Handler>()
		for(let route of this.routes){
			if (route.method.length === 0 || route.method === method || isHEAD && route.method === 'GET') {
				if (route.keys === false) {
					let matches = route.pattern.exec(url)
					if (matches === null) continue;

					let params:{[key:string]: any} = {}
					if (matches.groups !== void 0) for (let k in matches.groups) params[k]=matches.groups[k]
					if(route.handlers.length){
						result.push({
							params,
							handlers: route.handlers
						})
					}
				}
				else if (route.keys.length > 0) {
					let matches = route.pattern.exec(url)
					if (matches === null) continue
					let params:{[key:string]: any} = {}
					for (let j=0; j < route.keys.length;) params[route.keys[j]]=matches[++j]
					if(route.handlers.length){
						result.push({
							params,
							handlers: route.handlers
						})
					}
				} else if (route.pattern.test(url)) {
					if(route.handlers.length){
						result.push({
							params: {},
							handlers: route.handlers
						})
					}

				}
			}
		}
		return result 
	}

	_old_find(method, url) {
		let isHEAD=(method === 'HEAD');
		let i=0, j=0, k, tmp, arr=this.routes;
		let matches: any = [], params={}, handlers=[];
		for (; i < arr.length; i++) {
			tmp = arr[i];
			console.info("Tmp:", tmp)
			if (tmp.method.length === 0 || tmp.method === method || isHEAD && tmp.method === 'GET') {
				if (tmp.keys === false) {
					matches = tmp.pattern.exec(url);
					if (matches === null) continue;
					if (matches.groups !== void 0) for (k in matches.groups) params[k]=matches.groups[k];
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				} else if (tmp.keys.length > 0) {
					matches = tmp.pattern.exec(url);
					if (matches === null) continue;
					for (j=0; j < tmp.keys.length;) params[tmp.keys[j]]=matches[++j];
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				} else if (tmp.pattern.test(url)) {
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				}
			} // else not a match
		}

		return { params, handlers };
	}
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

		if(!method) method = context.request.method 
		let results: Array<Handler>
		if(Router.internalMethods.indexOf(method) >= 0){
			results = this.#internal.find(method, url || context.request.uri.pathname)
			if(!results.length){
				let func = null 
				if(method == "ERROR") func = this.#Error.bind(this)
				else func = this.#NotFound.bind(this)
				results = [{
					handlers: [func],
					params: {}
				}]
			}
		}
		else{
			results = this.#raw.find(method, url || context.request.uri.pathname)
		}
		
		
		if(!results.length) return false 
		
		let ourl = context.request.uri.pathname	
		console.info("Lookup result:", results)
		for(let result of results){
			context.request.params = result.params

			for(let fn of result.handlers){
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

			if(context.reply?.raw?.writableEnded) break 
		}


	}

	on(method: string, path: string, listener: RouterHttpListener){

		
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
		if(path.indexOf("*") >= 0){
			throw Exception.create("Route for 'use' method cannot contain *").putCode("INVALID_ROUTE")
		}
		let cPath = path + "/*"
		let wild = ''
		// change URL in request
		const realHandler = async (context: HttpContext) => {
			console.info("Cpath", cPath, context.request.params.wild)
			let path = context.request.params.wild
			//delete context.request.params.wild

			if(path[0] != "/") path = "/" + path
			wild = path 
			context.request.$pushUrl(path)

			try{
				let route = listener as Router
				if(typeof route.lookup == "function"){
					return await route.lookup(context)
				}
				else{
					return await (listener as RouterHttpListener)(context)
				}
			}catch(e){
				throw e
			}
			finally{
				context.request.$popUrl()
			}
		}
		return this.#raw.all(cPath, realHandler)
	}

	off(method: string, listener: RouterHttpListener){

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