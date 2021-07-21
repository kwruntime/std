
import {Registry} from '../../package/yarn'
import 'npm://esbuild@0.12.15##esbuild'
import * as esbuild from "esbuild"

import Path from 'path'
import fs from 'fs'



main()
async function main(){

    let reg = new Registry()

    let name = "find-my-way"
    let version = "4.3.3"
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


    name = "fast-json-stringify"
    version = "2.7.7"

    desc = await reg.resolve(`${name}@${version}`)
    folder = Path.join(__dirname, name)
    if(!fs.existsSync(folder)) fs.mkdirSync(folder)

    esbuild.buildSync({
        entryPoints: [desc.main],
        bundle: true,
        platform: 'node',
        target: ['node10.4'],
        outfile: __dirname + `/${name}/${version}.js`
    })


    name = "serve-static"
    version = "1.14.1"

    desc = await reg.resolve(`${name}@${version}`)
    folder = Path.join(__dirname, name)
    if(!fs.existsSync(folder)) fs.mkdirSync(folder)

    esbuild.buildSync({
        entryPoints: [desc.main],
        bundle: true,
        platform: 'node',
        target: ['node10.4'],
        outfile: __dirname + `/${name}/${version}.js`
    })




}