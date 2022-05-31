import {deferred, Deferred} from './deferred.ts'
import {Exception} from '../util/exception.ts'
import { AsyncEventEmitter } from './events.ts'


export class EventIterator{

    #parent: AsyncEventEmitter
    #deferred: Deferred<void>
    #events: string[]
    #funcs: Array<(...args:any)=> void> = []
    #stopped = false 

    constructor(parent: AsyncEventEmitter, events: string[]){
        this.#parent = parent
        this.#events = events
    }


    stop(){
        this.#stopped = true
        if(this.#deferred){
            this.#deferred.reject(Exception.create("Iterator stopped").putCode("ITERATOR_STOPPED"))
        }
        for(let i=0;i< this.#events.length;i++){
            let event = this.#events[i]
            this.#parent.removeListener(event, this.#funcs[i])
        }

    }

    get enumerator(){
        return this[Symbol.asyncIterator]()
    }
    

    async *[Symbol.asyncIterator](){
        let def:Deferred<void> = null
        let items = []
        let createFunc = function(event: string){
            return function(item){
                items.push({
                    type: event,
                    data: item
                })
                if(def){
                    def.resolve()
                }
            }
        }


        for(let event of this.#events){
            let f = createFunc(event)
            this.#funcs.push(f)
            this.#parent.on(event, f)
        }

        try{
            while(!this.#stopped){
                if(items.length){
                    while(items.length){
                        let item = items.shift()
                        yield item
                    }
                }
                else{
                    def = this.#deferred =  deferred<void>()
                    await def 
                }
            }
        }catch(e){
            if(e.code == "ITERATOR_STOPPED")
                return 
            else
                throw e
        }
    }
}