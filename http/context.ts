import { IncomingMessage, ServerResponse } from "http"
import { Stream } from "stream"
import * as async from '../util/async.ts'
import { AsyncEventEmitter } from "../async/events.ts"
import qs from 'npm://qs@6.10.3'
import safeJsonStringify from 'npm://safe-json-stringify@1.2.0'
import Exception from '../util/exception.ts'
import { Socket } from "net"
import Zlib from 'zlib'


// default parsers
import {BufferParser} from "./parsers/buffer.ts"
import {TextParser} from "./parsers/text.ts"
import {JsonParser} from "./parsers/json"

export interface HttpContext{
	request: Request 
	socket?: Socket
	head?: any
	reply?: Reply
	error?: any
}



export class RequestBody{
	#req: Request
	constructor(request: Request){
		this.#req = request
	}

	async buffer(){
		return await BufferParser.parse(this.#req)
	}

	async text(){
		let parser = this.#req.server.bodyParsers.get("text/plain") || TextParser
		return await parser.parse(this.#req)
	}

	async json(){
		let parser = this.#req.server.bodyParsers.get("application/json")|| JsonParser
		return await parser.parse(this.#req)
	}

	async parse(){
		let type = this.#req.headers["content-type"] || ''
		type = type.split(";")[0]
		let parser = this.#req.server.bodyParsers.get(type || "application/octect-stream")
		if(!parser){
			throw Exception.create(`Not available parser for type: ${type}`).putCode("NOT_AVAILABLE_PARSER")
		}
		return await parser.parse(this.#req)
	}

	get stream(){
		return this.#req.stream
	}

}

export class RequestUrlInfo{
	current: string 
	parent: string 
	original: string 
}


export class Request extends AsyncEventEmitter{

	#raw: IncomingMessage
	#query = null
	#uri: URL
	#server: any 
	#body: RequestBody	
	params: {[key:string]: any}
	urlInfo = new RequestUrlInfo()


	constructor(raw: IncomingMessage, server: any){
		super()
		this.#raw = raw
		this.#server = server
		this.urlInfo.current = raw.url
	}

	get raw(){
		return this.#raw
	}

	get server(){
		return this.#server
	}

	get query(){
		if(!this.#query){
			
			let search = this.uri.search
			if(search.startsWith("?")) search = search.substring(1)
			this.#query = qs.parse(search)
		}
		return this.#query
	}

	get stream(){
		// get correct stream
		let encoding = this.#raw.headers["content-encoding"]
		if(encoding =="gzip"){
			let st = Zlib.createGunzip()
			this.#raw.pipe(st)
			this.#raw.on("error", function(){})
			return st 				
		}

		if(encoding =="brotli"){
			let st = Zlib.createBrotliDecompress()
			this.#raw.pipe(st)
			this.#raw.on("error", function(){})
			return st 				
		}

		return this.#raw
	}

	get body(){
		if(!this.#body){
			this.#body = new RequestBody(this)
		}
		return this.#body
	}

	get headers(){
		return this.#raw.headers
	}
	/*
	get id(){
		return this.#raw.id
	}*/

	get ip(){
		return this.#raw.socket.remoteAddress
	}

	get ips(){
		let forw = this.headers["x-forwarded-for"]
		let ip = this.ip 
		let ips = []
		if(ip) ips.push(ip)
		if(forw) ips.push(forw)
		return ips
	}

	get hostname(){
		return this.headers["x-forwarded-host"] || this.headers["host"]
	}

	get protocol(){
		return "http"
	}

	get method(){
		return this.#raw.method
	}

	get socket(){
		return this.#raw.socket
	}

	get uri(){
		if(!this.#uri){
			let addr = this.#server.address
			if(addr.port){
				this.#uri = new URL(`http://${addr.address}:${addr.port}${this.url}`)
			}else{
				this.#uri = new URL(`http://127.0.0.1:0${this.url}`)
			}			
		}
		return this.#uri
	}

	get url(){
		return this.#raw.url
	}

	private $seturl(url: string){
		this.#raw.url = url 
		this.#uri = null 
		this.urlInfo.current = url
	}

	
}

export class Reply extends AsyncEventEmitter{
	#raw: ServerResponse
	#headers = new Map<string, any>()
	#statusCode = 200
	#sent = false
	#headSent = false
	#type = ''
	#server: any


	constructor(raw: ServerResponse, server?: any){
		super()
		this.#raw = raw
		this.#raw.on("error", (e) => this.emit("error", e))
		this.#raw.on("finish", () => this.emit("sent"))
		this.#server = server
	}

	get server(){
		return this.#server
	}

	code(statusCode: number){
		this.#statusCode = statusCode
		return this 
	}

	header(key: string, value: any){
		this.#headers.set(key, value)
		return this 
	}

	headers(object: {[key: string]: any}){
		for(let key in object){
			this.header(key, object[key])
		}
		return this
	}

	getHeader(key: string){
		return this.#headers.get(key)
	}

	getHeaders(){
		return this.#headers
	}

	removeHeader(key: string){
		this.#headers.delete(key)
		return this
	}

	hasHeader(key: string){
		return this.#headers.has(key)
	}

	redirect(href: string, code: number = 302){
		this.code(code).header("location", href)
		return this
	}

	type(contentType: string){
		this.#type = contentType
		this.header("content-type", contentType)
		return this
	}

	get sent(){
		return this.#sent || this.#raw.writableEnded
	}

	#sendHead(){
		this.#raw.statusCode = this.#statusCode
		let keys = this.#headers.keys()
		for(let key of keys){
			this.#raw.setHeader(key, this.#headers.get(key))
		}
		this.#headSent = true
		this.emit("headSent")
	}

	get raw(){
		if(!this.#headSent){
			this.#sendHead()
		}
		return this.#raw
	}

	async send(data: any){
		if(data instanceof Promise){
			data = await data 
		}
		if(data instanceof Stream){
			let def = new async.Deferred<void>()
			data.pipe(this.#raw)
			this.#raw.once("error", def.reject)
			this.#raw.once("finish", def.resolve)
			data.once("error", def.reject)
			await def.promise
		}
		else{
			if(typeof data == "string"){
				data = Buffer.from(data)
			}
			if(Buffer.isBuffer(data)){
				if(!this.#type){
					this.type("text/plain")
				}
				this.#raw.end(data)
			}
			else if(typeof data == "number"){
				if(!this.#type){
					this.type("application/json;charset=utf8")
				}
				this.#raw.end(String(data))
			}
			else{
				let str = safeJsonStringify(data)
				if(!this.#type){
					this.type("application/json;charset=utf8")
				}
				this.#raw.end(str)
			}			
		}
	}


}