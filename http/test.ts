
import {Server} from './server.ts'
import {Router} from './router.ts'

export var kawixDynamic = {
	time: 10000
}

export var data = {
	time: Date.now(),
	id: 12
}

export class Program {

	static async main(){
		let server = new Server()
		const addr = await server.listen("tcp://0.0.0.0:8080")
		console.info("Listening on:",addr)
		let router = new Router()
		let router2 = new Router()


		router.all("/", function(env){
			env.reply.code(200).send({
				hello:'world',
				path: env.request.uri.pathname
			})
		})
		router.all("/ok", function(env){
			env.reply.code(200).send({
				hello:'world',
				path: env.request.uri.pathname
			})
		})

		router2.attachToRouter("/server2", router)

		router2.all("/path", async function(env){
			env.reply.code(200).send((await import(__filename)).data)
		})

		router2.all("*", function(env){
			env.reply.code(200).send({
				hello:'server2',
				path: env.request.uri.pathname
			})
		})
		//router.attachToServer(server)
		let iterator = server.getIterator("request")
		for await(let event of iterator){
			router.lookup(event.data)
		}
	}
}