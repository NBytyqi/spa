const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const rxjs = require('rxjs');
const {
    bufferTime,
    filter,
} = require('rxjs/operators');
const utils = require('../utils');
const sharp = require('sharp');
const db = require('../db');
const ioServer = require('../../modules/webserver/socketio/server');
const logger = require('../logging').getLog('imageProcessor', 'save-snapshot');

// service worker thread.. seems to have memory leak..?
// const scaleImageWorker = require('../workers/scale-image');
// scaleImageWorker.startThreads();

// the most recent daypath used for each camera
// can when saving an image this is checked to avoid doing mkdirp on every save
// only when necessary
const lastUsedDayPaths = []; // {id: cam.id, dayPath: string}

// create a buffer to bulk insert new snaps for performance
const bufferedInsertSubject = new rxjs.Subject();
let bufferedInsertSub;

if (!bufferedInsertSub) {
    bufferedInsertSub = bufferedInsertSubject.pipe(bufferTime(10000), filter(items => items && items.length)).subscribe(async (items) => {
        logger.info(`Adding ${items.length} new snapshots to db`);
        let res;
        try {
            res = await db.models.Snapshot.bulkCreate(items, {
                raw: true
            });
        } catch (error) {
            logger.error(`ERROR while saving snapshots to db `, error);
        } finally {
            res = null; // gc
            items = null;

        }


    });
}

async function saveSnapshot(cam, picBuf, timestamp, recInstanceId, plate) {


    //logger.info(`Saving snapshot for ${cam.name});

    // calc the daypath to use, only run ensurePath if necessary for performance!
    const lastDayPathIndex = lastUsedDayPaths.findIndex(item => {
        return item.id === cam.id;
    });
    const ymd = timestamp.getFullYear().toString() + ('0' + (timestamp.getMonth() + 1)).slice(-2) + ('0' + (timestamp.getDate())).slice(-2);
    const hours = ('0' + timestamp.getHours()).slice(-2).toString();
    let dayPath = path.join(ymd, hours); // this is what it should be
    let snapshotPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/snapshotFolder'), dayPath);

    // ensure dayPath exists if changed from last time
    if (lastDayPathIndex === -1 || lastUsedDayPaths[lastDayPathIndex].dayPath !== dayPath) {
        // make a new path
        await utils.ensurePath(snapshotPath);
        if (lastDayPathIndex > -1) {
            // update it
            lastUsedDayPaths[lastDayPathIndex].dayPath = dayPath;
        } else {
            // add it for next time
            lastUsedDayPaths.push({
                id: cam.id,
                dayPath: dayPath
            });
        }
    }

    const filename = timestamp.getTime() + '.jpg';
    const thumbFilename = timestamp.getTime() + 'thumb.jpg';
    const newFilePath = path.join(snapshotPath, filename);
    const newThumbPath = path.join(snapshotPath, thumbFilename)

    const maxSize = {
        width: 200,
        height: 200
    }

    const smallSize = {
        width: 64,
        height: 48
    };

    // save downloaded file
    if (picBuf.length) {

        // use this one for AI inference
        try {
            let originalPicBuf = picBuf; //TEMP TEMP TEMP TEST

            // save original snapshot
            await new Promise((resolve, reject) => {
                fs.open(newFilePath, 'w', function (err, fd) {
                    if (err) {
                        throw 'error opening file: ' + err;
                    }
                    fs.write(fd, originalPicBuf, 0, originalPicBuf.length, null, (err) => {
                        if (err) throw reject(err);
                        fs.close(fd, () => {
                            resolve();
                        })
                    });
                });
            });

            // save thumb snapshot

            let smallThumbBuf;
            smallThumbBuf = await sharp(picBuf).resize(smallSize.width, smallSize.height, {
                fit: 'inside'
            }).toBuffer();

            await new Promise((resolve, reject) => {
                fs.open(newThumbPath, 'w', function (err, fd) {
                    if (err) {
                        throw 'error opening file: ' + err;
                    }
                    fs.write(fd, smallThumbBuf, 0, smallThumbBuf.length, null, (err) => {
                        if (err) throw reject(err);
                        fs.close(fd, () => {
                            resolve();
                        })
                    });
                });

            });

            // smallThumbBuf = await scaleImageWorker.scaleImage(picBuf, smallSize.width, smallSize.height);
            // createSmallImg(cam.id, picBuf, smallSize.width, smallSize.height, timestamp)

            // add to db
            const newSnap = {
                save: false,
                filename: filename,
                thumbFilename: thumbFilename,
                dayPath: dayPath,
                width: cam.stream2Width,
                height: cam.stream2Height,
                fileSize: originalPicBuf.length,
                thumbWidth: smallSize.width,
                thumbHeight: smallSize.height,
                thumbFileSize: 0,
                timestamp: timestamp,
                cameraId: cam.id,
                storagedeviceId: cam.storagedevice.id,
                recordingId: recInstanceId
            }

            //bufferedInsertSubject.next(newSnap); // send to buffer to process later
            const newSnapRec = await db.models.Snapshot.create(newSnap); // save now

            ioServer.io.emit('imagesaved-large', {
                id: cam.id,
                timestamp: timestamp,
                imgBuf: picBuf,
                plate: plate,
                recInstanceId: recInstanceId
            });


            if (smallThumbBuf) {
                ioServer.io.emit('imagesaved-small', {
                    id: cam.id,
                    timestamp: timestamp,
                    imgBuf: smallThumbBuf,
                    plate: plate,
                    recInstanceId: recInstanceId
                });

            }

            originalPicBuf = null;
            smallThumbBuf = null;

            return newSnapRec;
        } catch (error) {
            logger.error(`Could not process image from camera ${cam.name} IP: ${cam.IPv4} MAC: ${cam.mac}. Snapshot skipped`);
        }


    } else {
        logger.error(`Requested image from camera ${cam.name} IP: ${cam.IPv4} MAC: ${cam.mac}, contained no data. Snapshot skipped`);
    }
}


module.exports = {
    saveSnapshot
}