
import {Registry} from '../../package/yarn'
import 'npm://esbuild@0.12.15##esbuild'
import * as esbuild from "esbuild"

import Path from 'path'
import fs from 'fs'



main()
async function main(){

    let reg = new Registry()

    let name = "tar"
    let version = "6.1.0"
    let desc = await reg.resolve(`${name}@${version}`)

    let folder = Path.join(__dirname, name)
    if(!fs.existsSync(folder)) fs.mkdirSync(folder)

    esbuild.buildSync({
        entryPoints: [desc.main],
        bundle: true,
        platform: 'node',
        target: ['node10.4'],
        outfile: __dirname + `/${name}/${version}.js`
    })

}