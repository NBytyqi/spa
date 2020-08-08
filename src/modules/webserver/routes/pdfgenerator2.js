const fs = require('fs')
const path = require('path')
const utils = require('util')
const puppeteer = require('puppeteer')
const hb = require('handlebars')
const readFile = utils.promisify(fs.readFile)
const moment = require('moment')



exports.create = async(req,res,next)=>{

    if(req.query.format==='simple'){

async function getTemplateHtml() {

    console.log("Loading template file in memory")
    try {
        const invoicePath = path.join(__dirname,'simple.html')
        return await readFile(invoicePath, 'utf8');
    } catch (err) {
        return Promise.reject("Could not load html template");
    }
}

async function generatePdf() {
    const time = moment().format('LLLL') 
    let demi=[]
    const {eventsFrom,arra,token,printingUser,eventsTo,totalOfEvents} = req.body
    arra.forEach((e)=>{
        demi.push({data:`<td><img src='http://localhost:3001/api/history/snapshotsmall/${e.snapshot.id}?token=${token}' /></td> <td>${moment(e.startDate).format('DD/MM/YYYY, HH:mm:ssA')}</td> <td>${e.gate.name}</td> <td>${e.plate}</td> <td>${e.camera.username} <td>${e.isBlacklisted}</td> <td>${e.isOverride}</td> <td>${e.isApproved}</td> <td>${e.isDenied}</td>  `})
    })
    
    let data = {printingUser,time,demi,eventsFrom:moment(eventsFrom).format('LLL'),eventsTo:moment(eventsTo).format('LLL'),nrOfEvents:arra.length,totalOfEvents};
    
    let res2 = res
    getTemplateHtml()
        .then(async (res) => {
            // Now we have the html code of our template in res object
            // you can check by logging it on console
            // console.log(res)

            console.log("Compiling the template with handlebars")
            const template = hb.compile(res, { strict: true });
            // we have compile our code with handlebars
            const result = template(data);
            // We can use this to add dyamic data to our handlebas template at run time from database or API as per need. you can read the official doc to learn more https://handlebarsjs.com/
            const html = result;

            // we are using headless mode 
            const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
            const page = await browser.newPage()

            // We set the page content as the generated html by handlebars
            await page.setContent(html)

            // we Use pdf function to generate the pdf in the same folder as this file.
            await page.pdf({ path: `./result.pdf`, format: 'A4' })

            await browser.close();
            console.log("PDF Generated")
            res2.status(200).json({success:true})
            
            
        })
        .catch(err => {
            console.error(err)
        });
    }

generatePdf();



}


else{
    async function getTemplateHtml() {

        console.log("Loading template file in memory")
        try {
            const invoicePath = path.join(__dirname,'detailed.html');
            return await readFile(invoicePath, 'utf8');
        } catch (err) {
            return Promise.reject("Could not load html template");
        }
    }
    
    
    async function generatePdf() {
        const time = moment().format('LLLL') 
        let demi=[]
        
        const {eventsFrom,arra,token,printingUser,eventsTo,totalOfEvents} = req.body
        arra.forEach((e)=>{
            demi.push({data:`<td><img src='http://localhost:3001/api/history/snapshotsmall/${e.snapshot.id}?token=${token}' /></td> <td>${moment(e.startDate).format('DD/MM/YYYY, HH:mm:ssA')}</td> <td>${e.gate.name}</td> <td>${e.plate}</td> <td>${e.camera.username} <td>${e.isBlacklisted}</td> <td>${e.isOverride}</td> <td>${e.isApproved}</td> <td>${e.isDenied}</td>  `})
        })
        let demi2 = []
        arra.forEach((e,index)=>{
            demi2.push({data:`<div style="page-break-after: always;">
            <h3 class="text-center">Event ${index+1}</h3>
            <h4>Date:${moment(e.startDate).format('DD/MM/YYYY, HH:mm:ssA')}</h4>
            <h4>Gate:${e.gate.name} </h4>
            <h4>Plate:${e.plate} </h4>
            <h4>Type: ${e.type}</h4>
            <h4>Blacklisted:${e.isBlacklisted} </h4>
            <h4>Printing User: ${e.camera.username}</h4>
            <h4>Printing time: ${moment().format('LLL')} </h4>
            <img width="100%" src="http://localhost:3001/api/history/snapshotlarge/${e.snapshot.id}?token=${token}"/>
            </div>`})
        })
        // const bc =' <td>Mark</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> <td>Otto</td> '
        
        let data = {printingUser,time,demi,demi2,eventsFrom:moment(eventsFrom).format('LLL'),eventsTo:moment(eventsFrom).format('LLL'),nrOfEvents:arra.length,totalOfEvents, nrOfPages:arra.length +1};
        let res2 = res
        getTemplateHtml()
            .then(async (res) => {
                // Now we have the html code of our template in res object
                // you can check by logging it on console
                // console.log(res)
    
                console.log("Compiling the template with handlebars")
                const template = hb.compile(res, { strict: true });
                // we have compile our code with handlebars
                const result = template(data);
                // We can use this to add dyamic data to our handlebas template at run time from database or API as per need. you can read the official doc to learn more https://handlebarsjs.com/
                const html = result;
    
                // we are using headless mode 
                const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
                const page = await browser.newPage()
    
                // We set the page content as the generated html by handlebars
                await page.setContent(html)
    
                // we Use pdf function to generate the pdf in the same folder as this file.
                await page.pdf({ path: `./result.pdf`, format: 'A4' })
    
                await browser.close();
                console.log("PDF Generated")
                res2.status(200).json({success:true})
    
            })
            .catch(err => {
                console.error(err)
            });
    }
    
    generatePdf();


}
}


exports.download = async(req,res,next)=>{
    console.log('hiniii ne download')
    console.log(path.join(__dirname,'../','../'))
res.sendFile(path.join(`${__dirname}`,'../','../','../','../','result.pdf'))
}
