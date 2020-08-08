const rxjs = require('rxjs');
const {} = rxjs;
const {
    filter,
    timeInterval,
    throttleTime
} = require('rxjs/operators');
const got = require('got');
const path = require('path');
const config = require('../../config/config');
const utils = require('../../lib/utils');
const ip = require('../../lib/image-processing');
const gstreamer = require('../../lib/gstreamer');
const recLib = require('../../lib/recording');
const uuidv4 = require('uuid/v4');
const Modbus = require('../../lib/modbus')
const db = require('../../lib/db');
const logger = require('../../lib/logging').getLog('app', 'snapshots');
const ioServer = require('../webserver/socketio/server');

// {id: cam.id, subscription: Subscription, completeSubject: Subject}
const snapshotSubs = [];


async function startGettingSnapshots(camId) {

    if (snapshotSubs.findIndex(item => item.id === camId) > -1) {
        // Already getting snapshots
        return;
    }

    // get latest cam
    const cam = await db.models.Camera.findOne({
        where: {
            id: camId
        },
        include: [db.models.StorageDevice]
    });

    const snapshotPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/snapshotFolder'));
    await utils.ensurePath(snapshotPath);

    // start the gstreamer process that gets snapshots of each video frame and emits an event
    await gstreamer.startGstreamer(cam.id);

    // listen for new images from the decoder, for THIS camera via filter
    // imgObj = {cam, timestamp, count, img}
    const cameraImagesObservable = gstreamer.imageReceivedSubject.pipe(filter(imgObj => imgObj.cam.id === cam.id));

    // send io image once per second
    const cameraImageReceiverSub = cameraImagesObservable.pipe(throttleTime(1000)).subscribe(newImg => {
        if (newImg && newImg.img) {
            ioServer.io.emit('snapshot_live_' + cam.id, {
                id: cam.id,
                timestamp: newImg.timestamp,
                imgBuf: newImg.img
            });

        }
    });


    snapshotSubs.push({
        id: cam.id,
        cameraImageReceiverSub: cameraImageReceiverSub

    });
}

function stopGettingSnapshots(camId) {

    const sub = snapshotSubs.findIndex(item => {
        return item.id === camId
    });

    if (sub > -1) {
        if (sub.cameraImageReceiverSub) {
            sub.cameraImageReceiverSub.unsubscribe();
        }
        if (sub.processCompleteSub) {
            sub.processCompleteSub.unsubscribe();
        }
        snapshotSubs.splice(sub, 1);
        gstreamer.stopGstreamer(camId);
    }
}

// download snapshot from camera via uri
async function getSnapshotFromUri(cam) {
    let response = [];
    try {
        const tempResponse = await got(cam.snapshotUri, {
            encoding: null,
            decompress: false,
            retries: 5,
            timeout: 5000
        });

        response = response ? tempResponse.body : [];
    } catch (error) {
        let errorMsg;
        if (error && error.HTTPError) {
            errorMsg = {
                HTTPError: error.HTTPError,
                url: error.url
            };
        }

        if (error && error.RequestError) {
            errorMsg = {
                RequestError: error.RequestError,
                url: error.url
            };
        }

        if (error && error.code === 'ETIMEDOUT') {
            errorMsg = {
                TimeoutError: 'ETIMEDOUT',
                url: error.url
            };
        }
        logger.error(`Could not fetch image from camrea address: `, errorMsg ? errorMsg : error);
    }


    return response
}

async function createSnapshotFromUri(cam) {
    // get snapshot from cam directly
    let picBuf = await getSnapshotFromUri(cam);

    // save it
    await saveSnapshot(cam, picBuf, new Date());
}

function getLatestImage(camId) {
    const status = gstreamer.getStatusByCameraId(camId);
    return status.lastImage;
}

module.exports = {
    getSnapshotFromUri,
    createSnapshotFromUri,
    startGettingSnapshots,
    stopGettingSnapshots,
    getLatestImage
}