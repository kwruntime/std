import 'npm://express@4.17.1##express'
import Express from  "express"

main()
async function main(){
    const app = Express()
 
    app.get('/', function (req, res) {
        res.send('Hello World')
    })

    app.listen(3000)
    console.info("HTTP Server running on 127.0.0.1:3000")
}