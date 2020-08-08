'use strict';
const {
    Worker,
    isMainThread,
    parentPort,
    workerData
} = require('worker_threads');
const rxjs = require('rxjs');
const {
    timeout,
    filter,
    take
} = require('rxjs/operators');



const threadCount = 1
const threads = [];

const resultSubject = new rxjs.Subject();

let id = -1;

async function startThreads() {
    console.log(`Running scale image worker with ${threadCount} threads...`);

    for (let i = 0; i < threadCount; i++) {
        console.log('creating thread of ' + __filename)
        threads.push(new Worker(__filename, {
            workerData: {
                k: 2
            }
        }));
    }

    for (let worker of threads) {
        worker.on('error', (err) => {
            throw err;
        });
        worker.on('exit', (code) => {
            const idx = threads.indexOf(worker);
            threads.splice(idx);
            console.log(`Thread exiting code ${code}, now a total of ${threads.length} threads running...`);
            if (threads.length === 0) {
                console.log('All threads closed');
                process.exit()
            }
        });
        worker.on('message', (msg) => {
            // message from worker
            resultSubject.next(msg);

        });
    }
}

if (!isMainThread) {
    const sharp = require('sharp');

    // this is the worker thread stuff
    // on new message, process image and return the result
    parentPort.on('message', async (msg) => {

        // This code is executed in the worker and not in the main thread.
        const buf = new Buffer.from(msg.imageBuf);
        let resultBuf = await sharp(buf).resize(msg.width, msg.height, msg.options).toBuffer();

        // Send a message to the main thread.
        parentPort.postMessage({
            id: msg.id,
            imgBuf: resultBuf
        });

        resultBuf = null;
    });

    setInterval(() => {
        // keep worker alive!
    }, 1000);

}


async function scaleImage(camId, imageBuf, width, height, options = {
    fit: 'inside'
}) {

    if (threads.length) {
        id += 1;
        const msg = {
            id: camId,
            imageBuf: imageBuf,
            width: width,
            height: height,
            options: options
        }

        // send image to worker
        const worker = threads[0];
        worker.postMessage(msg);


        try {
            let result = await resultSubject.pipe(filter(item => item.id === camId), take(1), timeout(2000)).toPromise();
            const buf = new Buffer.from(result.imgBuf);
            result = null;
            return buf;
        } catch (error) {
            return;
        }

    }
}




module.exports = {
    startThreads,
    scaleImage
}