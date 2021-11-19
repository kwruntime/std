import { EventEmitter } from "events"
import {EventIterator} from "./event_iterator.ts"

export class AsyncEventEmitter extends EventEmitter{

        
    getEnumerator(event: string | string[]){
        return this.getIterator(event).enumerator
    }

    getIterator(event: string | string[]){
        if(typeof event == "string"){
            event = [event]
        }
        return new EventIterator(this, event)
    }

}

