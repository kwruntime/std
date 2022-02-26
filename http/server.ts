import http from 'http'
import Exception from '../util/exception.ts'
import { AsyncEventEmitter } from "../async/events.ts"
import * as async from '../util/async.ts'
import {HttpContext, Reply, Request} from  './context.ts'


export class Server extends AsyncEventEmitter{

	#raw: http.Server
	#count = 0
	
	connectionTimeout = 0
	keepAliveTimeout = 0
	maxRequestsPerSocket = 0
	requestTimeout = 0
	trustProxy = true 
	maxConnections : number = 50000

	

	get raw(){
		return this.#raw
	}


	constructor(server?: http.Server){
		super()

		Object.defineProperty(this, "$reqCount", {
			value: 0
		})

		if(!server){
			server = http.createServer({
				
			})
		}

		server.timeout = this.connectionTimeout
		//server.maxConnections = this.maxConnections
		server.keepAliveTimeout = this.keepAliveTimeout
		server.maxRequestsPerSocket = this.maxRequestsPerSocket

		server.on("request", (req, res)=>{


			let reply = new Reply(res, this)
			if(this.#count > this.maxConnections){
				// throw 
				return reply.code(503).send({
					error: {
						message: 'Max concurrent connections reached',
						code: 'MAX_CONNECTION_REACHED'
					}
				})
			}

			
			let context = {
				type: 'request',
				request : new Request(req, this),
				reply
			}
			this.#count++
			res.socket.setMaxListeners(0)
			res.socket.once("close", ()=> this.#count--)
			this.emit("request", context)
		})

		server.on("upgrade", (req, socket, head)=> {
			let context = {
				type: 'upgrade',
				request : new Request(req, this),
				socket, 
				head
			}
			this.emit("upgrade", context)
		})

		server.on("close", ()=> this.emit("close"))
		server.on("connection", (socket) => this.emit("connection", socket))
		server.on("listening", ()=> this.emit("listening"))
		this.#raw = server 
	}

	get address(){
		return this.#raw.address()
	}

	async listen(address: string | number){

		let def = new async.Deferred<void>()
		let addrinfo = this.#getAddress(address)
		if(addrinfo.port){
			this.#raw.listen(addrinfo.port, addrinfo.host)
		}else if(addrinfo.path){
			this.#raw.listen(addrinfo.path)
		}else{
			throw Exception.create("Failed to listen. Invalid address: " + address).putCode("INVALID_ADDRESS")
		}
		this.#raw.once("listening", def.resolve)
		this.#raw.once("error", def.reject)
		await def.promise 
		return this.#raw.address()

	}

	#getAddress(address: string | number){
		if(typeof address == "number"){
			return {
				port: 0,
				host: '127.0.0.1'
			}
		}
		if(address.startsWith("unix://")){
			return {
				path: address.substring(7)
			}
		}
		else if(address.startsWith("/")){
			return {
				path: address
			}
		}
		else if(address.startsWith("tcp://")){
			let part = address.substring(6)
			let ipv6 = part.match(/\[(.*)\]\:(\d+)/)
			let ipv4 = part.match(/([\d\.]+)\:(\d+)/)
			let host = ipv6?.[1] || ipv4?.[1]
			let port = Number(ipv6?.[2] || ipv4?.[2])
			return {
				host,
				port
			}
		}
	}

}