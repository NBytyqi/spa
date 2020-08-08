const rxjs = require('rxjs');
const config = require('../../config/config');
const LPR = require('./lpr');
const uuidv4 = require('uuid/v4');
const logger = require('../logging').getLog('imageProcessor');
const sharp = require('sharp');


const imageProcessedSubject = new rxjs.Subject();

let frameCounter;

let status = {
    processedImgCount: 0,
    processesPerSecond: 0
}

const serverQueue = []; // [{id: camId, queue: []}]
let currentIndex = -1;
let processingQueue = false;

let shutdownSub;

if (!shutdownSub) {
    shutdownSub = config.shutdownSubject.subscribe(val => {
        // cleanup on shutdown
        stopFrameCounter();
    });
}

let throttler1Sec = {};

function startFrameCounter() {
    logger.info('Starting FPS counter');
    // print out the current fps going to the TPU
    if (!frameCounter) {
        frameCounter = setInterval(() => {
            if (status.processedImgCount) {
                status.processesPerSecond = status.processedImgCount / 3;
            } else {
                status.processesPerSecond = 0;
            }
            status.processedImgCount = 0;
            //logger.info('Pipeline FPS ' + status.processesPerSecond.toFixed(1));
        }, 3000);
    }
}

function stopFrameCounter() {
    logger.info('Stopping FPS counter');
    if (frameCounter) {
        clearInterval(frameCounter);
    }
}


// queue items will be run through these steps
async function pipeline(cam, imgBuf, timestampReceived, jobId = null) {
    if (!jobId) {
        jobId = uuidv4();
    }

    const lprResult = await LPR.carmenLPR.detectLicensePlate(cam.id, imgBuf, timestampReceived, jobId)

    const pipelineResult = {
        cam: cam,
        imgBuf: imgBuf,
        jobId: jobId,
        timestamp: timestampReceived,
        result: {
            lpr: lprResult
        }
    }

    imageProcessedSubject.next(pipelineResult);

    status.processedImgCount += 1;
}


// current camera queue in process
// the function goes round robin between queues to select next image to process
// this gives each camera a fair chance at the TPU
function getNextQueueItem() {
    let startIndex = -1; // holder for where we started

    // check for empty server queue
    if (!serverQueue.length) {
        return null;
    }

    // move to next index
    currentIndex += 1; // will be 0 on first run

    while (currentIndex != startIndex) {
        //set the start index
        if (startIndex === -1) {
            startIndex = currentIndex; // set the start position, if we wrap around, the queue is empty
        }

        // wrap around if over the limit
        if (currentIndex > serverQueue.length - 1) {
            currentIndex = 0;
        }

        // see if this queue contains itmes
        if (serverQueue[currentIndex].queue.length) {
            // return next item
            const queueItem = serverQueue[currentIndex].queue.pop(); // get the first item
            return {
                cam: serverQueue[currentIndex].cam,
                queueItem: queueItem
            }
        } else {
            // go to next queue
            currentIndex += 1;
        }
    }

    return null;
}

async function proceessQueue() {

    if (processingQueue) {
        return;
    }

    processingQueue = true;

    // start processing
    while (processingQueue) {
        // get next queue to process
        // queuedItem = {camQueue: {camId: cam.id, queueItem: <next queue item>}
        let nextItem = getNextQueueItem()

        if (!nextItem) {
            processingQueue = false;
            break; // stop processing if no item is returned, the queues are empty
        }

        // process this item
        await pipeline(nextItem.cam, nextItem.queueItem.imgBuf, nextItem.queueItem.timestamp, nextItem.queueItem.processId);

        nextItem = null;
    }

    processingQueue = false;
    currentIndex = -1; // start at 0 again
}

// queue images
function addToProcessQueue(cam, imgBuf, timestampReceived) {

    const processId = uuidv4(); // assign an id to this item so a listner can wait for its completion

    // create a queue item.  (img with metaData)
    const newQueueItem = {
        imgBuf: imgBuf,
        processId: processId,
        timestamp: timestampReceived
    };

    // add to queue for this cam
    let camQueue = serverQueue.find(item => {
        return item.cam.id === cam.id;
    });

    if (camQueue) {
        // add to existing camera queue
        camQueue.queue.unshift(newQueueItem);
        if (camQueue.queue.length > 2) {
            let temp = camQueue.queue.pop(); // remove an older item
            temp = null; // destroy outdated one
        }
    } else {
        // create a new camera queue
        camQueue = {
            cam: cam,
            queue: [newQueueItem]
        }
        serverQueue.push(camQueue);
    }

    proceessQueue(); // signal to start processing camera queues
    return processId;
}


module.exports = {
    stopFrameCounter,
    startFrameCounter,
    addToProcessQueue,
    imageProcessedSubject,
    status
}