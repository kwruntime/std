import { HttpContext } from "./context.ts"
import Path from 'path'
import fs from 'fs'
import {Exception} from '../util/exception.ts'
import mime from 'npm://mime-types@2.1.35'
import parseRange from 'npm://range-parser@1.2.1'
import crypto from 'crypto'


export interface StaticOptions{
    path: string 
    finishOnNotFound?: boolean
    cache?: {
        enabled?: boolean
        seconds? : number 
    }
}

export class Static{
    #path: string 
    #options : StaticOptions

    constructor(options: StaticOptions){
        this.#path = options.path
        this.#options = options
    }


    async handle(context: HttpContext){

        let name = context.request.uri.pathname
        let original = context.request.urlInfo.original
        if(original.endsWith(".html")){
            return context.reply.code(301).redirect(original.substring(0, original.length - 5))
        }


        let file = Path.join(this.#path, name)
        let stats = null
        try {
            stats = await fs.promises.lstat(file)
        } catch (err) {
            if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                throw Exception.create(`File read error: ${err.code}. Message: ${err.message}`).putCode("FILE_ERROR_" + err.code)
            }
        }
        if(!stats){
            file += ".html"
            try {
                stats = await fs.promises.lstat(file)
            } catch (err) {
                if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                    throw Exception.create(`File read error: ${err.code}. Message: ${err.message}`).putCode("FILE_ERROR_" + err.code)
                }
            }
        }

        if(!stats){
            if(this.#options.finishOnNotFound){
                await context.reply.code(404).send({
                    error: {
                        code: 'NOT_FOUND',
                        message: "Path not found"
                    }
                })
            }

            return 
        } 



        let type = mime.lookup(file)
        let rangeStr = context.request.headers.range
        let start = 0, end = stats.size - 1, partial = false
        if(rangeStr){
            let range = parseRange(stats.size, rangeStr)
            if(range == -1){
                return context.reply.code(416).send({
                    error: {
                        code: 'RANGE_NOT_SATISFIABLE',
                        message: "Range is not satisfiable"
                    }
                })
            }
            else if(range == -2){
                return context.reply.code(400).send({
                    error: {
                        code: 'BAD_RANGE_REQUEST',
                        message: "Range request is not valid"
                    }
                })
            }
            else if(range.type == "bytes"){
                if(range.length > 1){
                    return context.reply.code(400).send({
                        error: {
                            code: 'RANGE_NOT_SUPPORTED',
                            message: "Range request is not supported"
                        }
                    })
                }

                start = range[0].start 
                end = range[0].end
                partial = true 
            }
        }

        let etag = ''

        if(this.#options.cache?.enabled){
            let etagStr = [file]
            etagStr.push(stats.mtimeMs)
            etagStr.push(stats.size)
            crypto.createHash("md5").update(etagStr.join(">")).digest("hex")
            let rEtag = context.request.headers["if-none-match"]
            if(rEtag == etag){
                return context.reply.code(304).send({
                    ok: true,
                    status: 'Not modified'
                })
            }
        }

        context.reply.code(partial ? 206 : 200)
            .header("content-type", type)
            .header("content-length", end - start + 1)
            .header("accept-range", "bytes")
            .header("accept-ranges", "bytes")

        if(this.#options.cache?.enabled){
            context.reply.header("cache", "public,max-age="+ (this.#options.cache?.seconds || 300))
                .header("etag", etag)
        }
                    


        if(partial){
            context.reply.header("content-range", `bytes ${start}-${end}/${stats.size}`)
        }

        // create the readstream 
        let streamRead = fs.createReadStream(file, {
            start,
            end
        })
        return await context.reply.send(streamRead)


    }

}