const checkDiskSpace = require('check-disk-space');
const config = require('../../config/config');
const utils = require('../utils');
const fs = require('fs');
const util = require('util');
const path = require('path');


const unlinkAsync = util.promisify(fs.unlink);
const existsAsync = util.promisify(fs.exists);

const logger = require('../logging').getLog('storage', 'space-check');


let freeSpaceInterval;

const status = {
    clearingSpace: false
};

// runs every 60 sec
function startCheckFreeSpaceTimer(dbRef) {
    logger.info('Starting freespace check timer');
    if (freeSpaceInterval) {
        clearInterval(freeSpaceInterval);
    }

    freeSpaceInterval = setInterval(() => {
        if (!status.clearingSpace) {
            logger.info(`Free space timer tirggerd. set minimum: ${utils.bytesToSize(config.get('/minFreeRecordingBytes'))}  set maximum: ${config.get('/maxRecordingSpaceToUse') ? utils.bytesToSize(config.get('/maxRecordingSpaceToUse')) : 'UNLIMITED'}`);
            checkFreeSpace(dbRef);

            logger.info(`Running GC`);
            utils.runGC(); // requires --expose-gc on cmd
        }
    }, 120000);
}

function stopCheckFreeSpaceTimer() {
    logger.info('Stopping freespace check timer');
    if (freeSpaceInterval) {
        clearInterval(freeSpaceInterval);
        freeSpaceInterval = null;
    }

    status.clearingSpace = false;
}

async function checkFreeSpace(dbRef) {
    // clear space here
    status.clearingSpace = true;

    // get sum of bytes according to db
    let driveInfos = await getStorageInfo(dbRef);
    for (const info of driveInfos) {
        if (info.freeSpaceNeeded) {
            logger.info(`Drive: '${info.storageDevice.mountPoint}'. Freespace needed because '${info.freeSpaceReason}', total used: ${utils.bytesToSize(info.totalSize)}`);
            await freeSpace(dbRef, info.storageDevice, info.freeSpaceNeeded);
        } else {
            logger.info(`Drive: '${info.storageDevice.mountPoint}'. No freespace needed, free space on drive: ${utils.bytesToSize(info.hdFree)}, total used: ${utils.bytesToSize(info.totalSize)}, max space set to: ${config.get('/maxRecordingSpaceToUse') ? utils.bytesToSize(config.get('/maxRecordingSpaceToUse')) : 'MAX DRIVE SPACE'}`);
        }
    }

    driveInfos = null; // gc

    status.clearingSpace = false;
    return;
}

async function freeSpace(dbRef, storageDevice, sizeInBytes) {
    logger.info(`Need to clear at least ${utils.bytesToSize(sizeInBytes)} from drive ${storageDevice.mountPoint}`);
    let sequelize = dbRef.getDB();


    let totalBytes = 0;
    let recToDel = [];
    let offset = 0;
    let oldestImageFolder = [];
    let pageSize = 10;

    while (totalBytes < sizeInBytes) {
        logger.info(`Getting Oldest ${pageSize} Recordings from drive ${storageDevice.mountPoint}`);
        // get the oldest videos that clear size plus 10%
        let recordings = await dbRef.models.Recording.findAll({
            where: {
                storageDeviceId: storageDevice.id
            },
            include: [{
                    model: dbRef.models.StorageDevice
                },
                {
                    model: dbRef.models.Camera
                }
            ],
            order: sequelize.literal('startDate ASC'),
            limit: pageSize,
            offset: offset
        });

        if (!recordings.length) {
            break; // exit loop if we reached the end of db
        }


        // make a list to delete
        for (const rec of recordings) {
            if (totalBytes < sizeInBytes) {
                recToDel.push(rec);
                totalBytes += rec.fileSize;

                rec.snapshots = await dbRef.models.Snapshot.findAll({
                    attributes: ['id', 'filename', 'thumbFilename', 'dayPath', 'filesize', 'thumbFileSize', 'timestamp'],
                    where: {
                        recordingId: rec.id
                    },
                    order: sequelize.literal('timestamp ASC'),
                    raw: true
                });

                // all file sizes of snapshots that will be deleted too
                // let snapsize = 0;
                for (const snap of rec.snapshots) {
                    totalBytes += snap.fileSize;
                    totalBytes += snap.thumbFileSize;

                    // snapsize += snap.fileSize;
                    // snapsize += snap.thumbFileSize;
                }

                // logger.info(`Snap size: ${utils.bytesToSize(snapsize)}`)

                // update the oldest camera snapshot on record, so we can delete folders that are older then this
                const cameraEntry = oldestImageFolder.find(item => {
                    return item.id === rec.cameraId
                });
                if (cameraEntry) {
                    if (rec.snapshots && rec.snapshots.length && cameraEntry.timestamp > rec.snapshots[0].timestamp) {
                        cameraEntry.timestamp = rec.snapshots[0].timestamp;
                    }
                } else {
                    if (rec.snapshots && rec.snapshots.length) {
                        oldestImageFolder.push({
                            id: rec.cameraId,
                            timestamp: rec.snapshots[0].timestamp
                        });
                    }
                }
            }
        }

        recordings = null; // gc

        offset += pageSize;
    }

    logger.info(`Purging ${utils.bytesToSize(totalBytes)} from drive ${storageDevice.mountPoint}`)

    // logger.info(oldestImageFolder);
    // process.exit();
    // TO DO delete empty image folders


    // delete the items
    for (const rec of recToDel) {
        try {

            logger.info(`Removing camera ${rec.camera.name} file ${rec.filename} to free space`);
            // let snaps = await rec.getSnapshots({
            //     raw: true
            // });


            const filePath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.camera.id, config.get('/vaultFolder'), rec.filename);
            try {
                await unlinkAsync(filePath);
            } catch (error) {
                logger.error(`Could not delete ${filePath} (you should never see this!)`, error);

            }

            // await rec.destroy(); // will cascade delete snapshots

            // delete snapshot files
            for (const snap of rec.snapshots) {

                // remove full size snapshot
                const snapPath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.camera.id, config.get('/snapshotFolder'), snap.dayPath, snap.filename);
                try {
                    await unlinkAsync(snapPath);
                } catch (error) {
                    logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
                }

                // remove thumbnail file too
                try {
                    const snapThumbPath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.camera.id, config.get('/snapshotFolder'), snap.dayPath, snap.thumbFilename);
                    await unlinkAsync(snapThumbPath);
                } catch (error) {
                    //TODO report error?? ignore for now
                    //logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
                }
            }

            if (rec.snapshots && rec.snapshots.length) {
                // remove snapshots from db
                await dbRef.models.Snapshot.destroy({
                    where: {
                        id: rec.snapshots.map(item => {
                            return item.id
                        })
                    }
                });
            }

            // get recording chunks

            rec.recordingChunks = await dbRef.models.RecordingChunk.findAll({
                attributes: ['id'],
                where: {
                    recordingId: rec.id
                },
                raw: true
            });

            if (rec.recordingChunks && rec.recordingChunks.length) {
                // remove recording chunks from db
                await dbRef.models.RecordingChunk.destroy({
                    where: {
                        id: rec.recordingChunks.map(item => {
                            return item.id
                        })
                    }
                });
            }

        } catch (error) {
            logger.error(`Error removing camera ${rec.camera.name} file ${rec.filename} while trying to free space. `, error);
        }
    }

    // delete all at once
    if (recToDel.length) {

        // remove recordings
        await dbRef.models.Recording.destroy({
            where: {
                id: recToDel.map(item => {
                    return item.id
                })
            }
        });

    }
}

async function getStorageInfo(db) {

    let storageDevices = await db.models.StorageDevice.findAll({
        where: {
            active: true
        },
        raw: true
    });

    const resultDrives = [];

    for (const storageDevice of storageDevices) {

        try {

            const result = {
                storageDevice: storageDevice,
                totalSize: 0,
                avgFileSize: 0,
                avgDurationInSec: 0,
                totalRecordings: 0,
                totalDurationInSec: 0,
                totalDurationInMinutes: 0,
                totalDurationInHours: 0,
                totalDurationInDays: 0,
                totalDurationStringHHMMSS: '00:00:00',
                totalDurationStringDDHHMMSS: '00:00:00:00',
                totalDurationObj: {
                    days: 0,
                    hours: 0,
                    minutes: 0,
                    seconds: 0
                },
                totalRelativeDuration: 0,
                estSizePerMin: 0,
                estSizePerHour: 0,
                estSizePerDay: 0,
                estSizePerMonth: 0,
                oldestDate: null,
                newestDate: null,
                hdFree: 0,
                hdUsed: 0,
                hdSize: 0,
                hdPercentFree: 0,
                hdPercentUsed: 0,
                hdPercentUsedOfMaxAllowd: 0,
                hdPercentFreeOfMaxAllowd: 0,
                estMinutesLeft: 0,
                estHoursLeft: 0,
                estDaysLeft: 0,
                estCapacityMinutes: 0,
                estCapacityhours: 0,
                estCapacityDays: 0,
                estCapacityMonths: 0,
                cameras: [],
                minFreeRecordingBytes: config.get('/minFreeRecordingBytes'),
                maxRecordingSpaceToUse: config.get('/maxRecordingSpaceToUse'),
                maxAvaiableRecordingSpaceForUse: config.get('/maxRecordingSpaceToUse') - config.get('/minFreeRecordingBytes'),
                freeSpaceNeeded: 0,
                freeSpaceReason: ''
            }


            // for each drive
            const spaceInfo = await checkDiskSpace(storageDevice.mountPoint);
            result.hdUsed = spaceInfo.size - spaceInfo.free;
            result.hdSize = spaceInfo.size;
            result.hdFree = spaceInfo.free;
            result.hdPercentFree = (spaceInfo.free / spaceInfo.size) * 100;
            result.hdPercentUsed = (result.hdUsed / spaceInfo.size) * 100;

            result.totalSize = result.hdUsed;
            //////





            // get result per camera
            // const dbResult = await db.models.Recording.findAll({
            //     where: {
            //         storagedeviceId: storageDevice.id
            //     },
            //     attributes: [
            //         'id',
            //         [sequelize.fn('sum', sequelize.col('recording.fileSize')), 'totalRecordingSize'],
            //         [sequelize.fn('sum', sequelize.col('snapshots.fileSize')), 'snapshotFileSize'],
            //         [sequelize.fn('count', sequelize.col('Recording.id')), 'totalRecordings'],
            //         [sequelize.fn('max', sequelize.col('endDate')), 'newestDate'],
            //         [sequelize.fn('min', sequelize.col('startDate')), 'oldestDate'],
            //         [sequelize.fn('sum', sequelize.col('duration')), 'totalDuration'],
            //         [sequelize.fn('sum', sequelize.col('relativeDuration')), 'totalRelativeDuration']
            //     ],
            //     include: [{
            //             model: db.models.Camera,
            //         },
            //         {
            //             model: db.models.Snapshot,
            //             attributes: []
            //         }
            //     ],
            //     group: ['Recording.cameraId'],
            //     raw: true,
            //     order: sequelize.literal('totalRecordingSize DESC')
            // });

            // add all the camera totals
            // dbResult.map(item => {
            //     result.totalSize += item.totalRecordingSize;
            //     result.totalRecordings += item.totalRecordings;
            //     result.oldestDate = !result.oldestDate || item.oldestDate < result.oldestDate ? item.oldestDate : result.oldestDate;
            //     result.newestDate = !result.newestDate || item.newestDate > result.newestDate ? item.newestDate : result.newestDate;
            //     result.totalDurationInSec += item.totalDuration;
            //     result.totalRelativeDuration += item.totalRelativeDuration;
            //     item.estSizePerMin = Math.ceil((item.totalRecordingSize / (item.totalDuration / 60)));
            //     item.estSizePerHour = item.estSizePerMin * 60;
            //     item.estSizePerDay = item.estSizePerHour * 24;
            //     item.estSizePerMonth = item.estSizePerDay * 30;

            //     result.estSizePerMin += item.estSizePerMin;
            //     result.estSizePerHour += item.estSizePerHour;
            //     result.estSizePerDay += item.estSizePerDay;
            //     result.estSizePerMonth += item.estSizePerMonth;
            // });

            // calc total size left
            result.hdFreeOfMaxAllowd = result.maxAvaiableRecordingSpaceForUse - result.totalSize;
            result.hdPercentUsedOfMaxAllowd = (result.totalSize / result.maxAvaiableRecordingSpaceForUse) * 100;
            result.hdPercentFreeOfMaxAllowd = (result.hdFreeOfMaxAllowd / result.maxAvaiableRecordingSpaceForUse) * 100

            // calc overage


            // calc total durations
            result.totalDurationInMinutes = parseFloat((result.totalDurationInSec > 0 ? result.totalDurationInSec / 60 : 0).toFixed(2));
            result.totalDurationInHours = parseFloat((result.totalDurationInSec > 0 ? (result.totalDurationInSec / 60) / 60 : 0).toFixed(2));
            result.totalDurationInDays = parseFloat((result.totalDurationInHours > 0 ? result.totalDurationInHours / 24 : 0).toFixed(2));
            result.totalDurationStringHHMMSS = utils.toHHMMSS(result.totalDurationInSec);
            result.totalDurationStringDDHHMMSS = utils.toDDHHMMSS(result.totalDurationInSec);
            result.totalDurationObj = utils.getDDHHMMSSobj(result.totalDurationInSec);

            //result.cameras = dbResult;
            result.avgFileSize = Math.ceil(result.totalSize / result.totalRecordings);

            // calc average duration
            result.avgDurationInSec = result.cameras.length ? result.totalDurationInSec / result.cameras.length : 0;
            result.avgDurationInMinutes = parseFloat((result.avgDurationInSec > 0 ? result.avgDurationInSec / 60 : 0).toFixed(2));
            result.avgDurationInHours = parseFloat((result.avgDurationInSec > 0 ? (result.avgDurationInSec / 60) / 60 : 0).toFixed(2));
            result.avgDurationInDays = parseFloat((result.totalDurationInHours > 0 ? result.totalDurationInHours / 24 : 0).toFixed(2));
            result.avgDurationStringHHMMSS = utils.toHHMMSS(result.avgDurationInSec);
            result.avgDurationStringDDHHMMSS = utils.toDDHHMMSS(result.avgDurationInSec);
            result.avgDurationObj = utils.getDDHHMMSSobj(result.avgDurationInSec);

            // estimate time
            result.estMinutesLeft = result.hdFreeOfMaxAllowd / result.estSizePerMin;
            result.estHoursLeft = result.hdFreeOfMaxAllowd / result.estSizePerHour;
            result.estDaysLeft = result.hdFreeOfMaxAllowd / result.estSizePerDay;
            result.estCapacityMinutes = result.maxAvaiableRecordingSpaceForUse / result.estSizePerMin;
            result.estCapacityDays = result.maxAvaiableRecordingSpaceForUse / result.estSizePerDay;
            result.estCapacityhours = result.maxAvaiableRecordingSpaceForUse / result.estSizePerHour;
            result.estCapacityMonths = result.maxAvaiableRecordingSpaceForUse / result.estSizePerMonth;

            // calc freespace needed



            const camerasDir = path.join(storageDevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'));
            let cameraFolderInfo;

            try {
                cameraFolderInfo = await utils.statAsync(camerasDir);
            } catch (error) {
                // TO DO CATCH THIS ERROR
            }


            if (result.hdFree < result.minFreeRecordingBytes) {
                // under minimum for drive buffer
                result.freeSpaceNeeded = result.minFreeRecordingBytes - result.hdFree;
                result.freeSpaceReason = `Under minimim drive freespace of ${utils.bytesToSize(result.minFreeRecordingBytes)}`;
            } else if (result.maxRecordingSpaceToUse && result.totalSize > result.maxRecordingSpaceToUse || result.maxRecordingSpaceToUse && cameraFolderInfo && cameraFolderInfo.size > result.maxRecordingSpaceToUse) {
                // over maxuse amount
                result.freeSpaceNeeded = result.totalSize - result.maxRecordingSpaceToUse;
                result.freeSpaceReason = `Over maximum set usage amount of ${utils.bytesToSize(result.maxRecordingSpaceToUse)} by ${utils.bytesToSize(result.freeSpaceNeeded)}`;
            }

            resultDrives.push(result);

        } catch (error) {
            logger.info(`Error while getting storage info for ${storageDevice.mountPoint}. `, error)
        }

    }
    storageDevices = null; //gc
    return resultDrives;
}



async function clearOrphanSnapshots(dbRef) {
    let pageSize = 50;
    let theresMore = true;
    let removed = 0;

    while (theresMore) {
        let orphanSnaps = await dbRef.models.Snapshot.findAll({
            where: {
                recordingId: null
            },
            include: dbRef.models.StorageDevice,
            limit: pageSize
        });


        // delete all at once
        if (orphanSnaps.length) {
            logger.info(`Found ${orphanSnaps.length} orphan snapshots not linked to any video clip.  Deleting...`);

            for (const snap of orphanSnaps) {

                // remove full size snapshot
                const snapPath = path.join(snap.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), snap.cameraId, config.get('/snapshotFolder'), snap.dayPath, snap.filename);
                try {
                    await unlinkAsync(snapPath);
                } catch (error) {
                    logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
                }

                // remove thumbnail file too
                // try {
                //     const snapThumbPath = path.join(snap.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), snap.cameraId, config.get('/snapshotFolder'), snap.dayPath, snap.thumbFilename);
                //     await unlinkAsync(snapThumbPath);
                // } catch (error) {
                //     //TODO report error?? ignore for now
                //     logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
                // }
            }


            await dbRef.models.Snapshot.destroy({
                where: {
                    id: orphanSnaps.map(item => {
                        return item.id
                    })
                }
            });

            removed += orphanSnaps.length;

            orphanSnaps = null; // gc


        } else {
            theresMore = false;
        }

        logger.info(`Finished removing ${removed} orphan snapshots`);

    }

}


async function deleteOrphanCameraFolders(storageDevices, cameras) {
    const rimraf = require('rimraf');

    for (const sd of storageDevices) {
        console.log(`Removing orphaned camera folders on drive '${sd.name}'`);


        const camerasPath = path.join(sd.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'));


        const pathExists = await existsAsync(camerasPath);
        if (pathExists) {

            const files = await getDirs(camerasPath);

            const rimrafAsync = util.promisify(rimraf);
            for (const file of files) {

                const found = cameras.find(item => item.id === file);

                if (!found) {
                    console.log(`Removing orphanded camera folder '${file}'`);
                    try {
                        await rimrafAsync(path.join(camerasPath, file));
                    } catch (error) {
                        console.log(`Error Removing orphaned camera folder '${file}'`, error);
                    }
                }

            }
        }

    }
}

async function getDirs(dir) {
    const files = await util.promisify(fs.readdir)(dir);
    const dirlist = [];
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stat = await util.promisify(fs.stat)(filepath);
        if (stat.isDirectory()) {
            dirlist.push(file);
        }
    }
    return dirlist;
}


module.exports = {
    startCheckFreeSpaceTimer,
    stopCheckFreeSpaceTimer,
    status,
    checkFreeSpace,
    getStorageInfo,
    clearOrphanSnapshots,
    deleteOrphanCameraFolders
}