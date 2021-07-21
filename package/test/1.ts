
import {Registry} from '../yarn'

main()
async function main(){

    let r = new Registry()
    let mod = await r.resolve("express@4.17.1")
    console.info(mod)

}