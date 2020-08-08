const onvif = require('../../lib/onvif');
const db = require('../../lib/db');
const rxjs = require('rxjs');
const ioServer = require('../webserver/socketio/server');
const Snapshots = require('./snapshots');
const uuidv4 = require('uuid/v4');

// events for actions
const addCameraSubject = new rxjs.Subject();
const deleteCameraSubject = new rxjs.Subject();
const updateCameraSubject = new rxjs.Subject();
const Sequelize = require('sequelize');

const logger = require('../../lib/logging').getLog('app', 'camera');

const status = {
    installingMissingCameras: false
};

async function getCameraList() {
    const sequelize = db.getDB();
    let cams = [];
    if (sequelize) {
        cams = await db.models.Camera.findAll({
            include: [{
                model: db.models.StorageDevice,
            }],
            order: sequelize.literal('cameraNum ASC')
        });
    }
    return cams;
}

async function installCamerasFromOnvifSearch(missingCams) {
    logger.info('Installing new cameras from onvif search');
    status.installingMissingCameras = true;
    const installedCams = [];

    for (const onvifCam of missingCams) {

        const cam = onvifCam.exinfo;

        const newID = uuidv4(); // create new UUID for this cam

        // build new camera data
        const newCam = {
            id: newID, 
            active: true,
            name: onvifCam.name,
            cameraNum: onvifCam.cameraNum,
            mac: cam.mac,
            IPv4: cam.IPv4,
            username: cam.username,
            password: cam.password,
            stream1: cam.mainStreamUri,
            stream1Width: cam.mainStreamWidth,
            stream1Height: cam.mainStreamHeight,
            stream1Settings: cam.mainStreamProfile,
            stream1HasAudio: cam.mainStreamHasAudio,
            stream2: cam.subStreamUri,
            stream2Width: cam.subStreamWidth,
            stream2Height: cam.subStreamHeight,
            stream2Settings: cam.subStreamProfile,
            stream2HasAudio: cam.subStreamHasAudio,
            snapshotUri: cam.snapshotUri,
            isDhcp: cam.DHCP,
            lastConnection: null,
            isRecording: false,
            isStalled: false,
            lastProcessedSegmentIndex: -1,
            pid: '',
            storagedeviceId: null,
            hlsUrlStream1: `/api/cameras/live/${newID}/1/stream.m3u8`,
            hlsUrlStream2: `/api/cameras/live/${newID}/2/stream.m3u8`,
            hlsUrlStream3: `/api/cameras/live/${newID}/3/stream.m3u8`
        };

        // set storage device for this camera
        // use the storage device with the least number of camreas
        const sequelize = db.getDB();
        const storageDevices = await db.models.StorageDevice.findAll({
            attributes: [
                'id',
                [sequelize.fn('count', sequelize.col('cameras.storagedeviceId')), 'totalCameras'],
                'isPrimary'
            ],
            include: [{
                model: db.models.Camera,
            }],
            order: [
                [sequelize.literal('totalCameras ASC')]
            ]
        });

        // TO DO figure out which storage to add camera too??
        if (storageDevices.length) {
            //const lowestSD = storageDevices[0];
            const primarySD = storageDevices.find(item => {
                return item.isPrimary;
            });
            newCam.storagedeviceId = primarySD.id;
        }

        await addCamera(newCam);
        installedCams.push(newCam); // update list of installed cameras
    }

    ioServer.io.emit('camerasAdded', {
        addedCameraIds: installedCams.map(item => item.id)
    });


    status.installingMissingCameras = false;

    return installedCams;
}

async function updateChangedCameras(changedCams) {
    for (const data of changedCams) {
        logger.info(`Detected new settings for camera mac: ${data.originalDbCam.mac} oldIP: ${data.originalDbCam.IPv4} newIp: ${data.newOnvifCam.IPv4}`)
        data.originalDbCam.IPv4 = data.newOnvifCam.IPv4;
        data.originalDbCam.stream1 = data.newOnvifCam.mainStreamUri;
        data.originalDbCam.stream2 = data.newOnvifCam.subStreamUri;
        data.originalDbCam.snapshotUri = data.newOnvifCam.snapshotUri;
        data.originalDbCam.username = data.newOnvifCam.username;
        data.originalDbCam.password = data.newOnvifCam.password;
        data.originalDbCam.stream1HasAudio = data.newOnvifCam.mainStreamHasAudio;
        data.originalDbCam.stream2HasAudio = data.newOnvifCam.subStreamHasAudio;
        data.originalDbCam.stream1Width = data.newOnvifCam.mainStreamWidth;
        data.originalDbCam.stream1Height = data.newOnvifCam.mainStreamHeight;
        data.originalDbCam.stream2Width = data.newOnvifCam.subStreamWidth;
        data.originalDbCam.stream2Height = data.newOnvifCam.subStreamHeight;
        await data.originalDbCam.save();
        updateCameraSubject.next(data.originalDbCam);
    }

    ioServer.io.emit('camerasUpdated', {
        changedCamIds: changedCams.map(item => item.originalDbCam.id)
    });
}

async function searchMissingCameras(getExtendedInfo = true) {
    logger.info('Searching for missing cameras');
    const missingCams = [];
    const changedCams = [];

    // get onvif cameras on network
    const onvifList = await onvif.scanForCameras(getExtendedInfo);

    // compare list of cameras found with what we have
    const dbList = await getCameraList(); // returns in ascending order

    // calc next camera number
    let nextCameraNumber = dbList.length > 0 ? dbList[dbList.length - 1].cameraNum + 1 : 1;

    // compare by mac address to find missing cameras
    for (const onvifCam of onvifList) {
        const inDb = dbList.find((dbCam) => {
            const mac = onvifCam.exinfo ? onvifCam.exinfo.mac : null
            return dbCam.mac === mac;
        });
        if (!inDb) {
            onvifCam.name = `Camera ${nextCameraNumber}`; // add a name to the onvif props
            onvifCam.cameraNum = nextCameraNumber;
            missingCams.push(onvifCam);
            nextCameraNumber++;
        } else {
            // check for camera info changes
            if (inDb.IPv4 !== onvifCam.IPv4) {
                logger.info(`IP change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }

            if (inDb.username !== onvifCam.username) {
                logger.info(`username change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }

            if (inDb.password !== onvifCam.password) {
                logger.info(`password change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }

            if (inDb.stream1HasAudio !== onvifCam.mainStreamHasAudio) {
                logger.info(`audio (stream1) change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }
            if (inDb.stream2HasAudio !== onvifCam.subStreamHasAudio) {
                logger.info(`audio (stream2) change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }

            if (inDb.stream2Width !== onvifCam.subStreamWidth || inDb.stream2Height !== onvifCam.subStreamHeight || inDb.stream1Width !== onvifCam.mainStreamWidth || inDb.stream1Height !== onvifCam.mainStreamHeight) {
                logger.info(`resolution change detected for camera ip: ${onvifCam.IPv4} mac: ${onvifCam.mac}`);
                changedCams.push({
                    originalDbCam: inDb,
                    newOnvifCam: onvifCam
                });
            }
        }
    }

    logger.info(`Found ${missingCams.length} new cameras`);
    return {
        missingCams: missingCams,
        changedCams: changedCams
    };
}

async function addCamera(cam) {
    logger.info(`Adding new camera to system - IP:${cam.IPv4} MAC:${cam.mac}  Stream1: ${cam.stream1Width}x${cam.stream1Height}  Stream2: ${cam.stream2Width}x${cam.stream2Height}`)
    let newCam;
    try {
        const Op = Sequelize.Op;
        const existing = await db.models.Camera.findOne({
            where: {
                [Op.or]: [
                    {
                    mac: cam.exinfo ? cam.exinfo.mac : '123412345'
                    }, {
                    id: cam.id
                }]
            },
            include: [{
                model: db.models.StorageDevice,
            }],
        })

        if (existing) {
            throw new Error('Camera mac or id already in db');
        }


        newCam = await db.models.Camera.create(cam);

        // add storage devices to output
        newCam = await db.models.Camera.findOne({
            where: {
                id: newCam.id
            },
            include: [{
                model: db.models.StorageDevice,
            }],
        })
        addCameraSubject.next(newCam);
    } catch (error) {
        logger.info('Error adding camera!')
    }

    return newCam;
}

async function deleteCamera(cam) {
    logger.info(`Deleting camera from system - IP:${cam.ip} MAC:${cam.mac}`);
    try {
        // get instance
        const camInstance = await db.models.Camera.findOne({
            where: {
                mac: cam.mac,
            }
        });

        // wipe all camera content from system
        deleteCameraContent(camInstance);

        await camInstance.destroy();

        // reassign camera numbers in ascending order so there is no gap in numbers
        // new cameras are always added to the end

        const camList = await getCameraList();
        for (let index = 0; index < camList.length; index++) {
            cam.camNumber = index + 1;
            await cam.save();
        }

        deleteCameraSubject.next(cam);
    } catch (error) {
        logger.info('Error deleting camera!')
    }
}

// TO DO delete all recordings, snapshots, events etc...
async function deleteCameraContent(camInstance) {
    // this could take a min, send event when complete

}

async function updateCamera(cam) {
    logger.info(`Update camera data for - IP:${cam.IPv4} MAC:${cam.mac} Stream1: ${cam.stream1Width}x${cam.stream1Height}  Stream2: ${cam.stream2Width}x${cam.stream2Height}`)
    try {
        const camInstance = await db.models.Camera.findOne({
            where: {
                mac: cam.mac,
            }
        });
        const updatedCam = await camInstance.update(cam);
        updateCameraSubject.next(updatedCam);
    } catch (error) {
        logger.info('Error updating camera!')
    }
}

async function startMonitorEvents() {
    logger.info('Start monitoring for lpr events')
    const sequelize = db.getDB();

    // start getting snapshots
    // get list of active cameras in db
    let camList = await db.models.Camera.findAll({
        where: [{
            active: true
        }],
        include: [{
            model: db.models.StorageDevice
        }],
        order: sequelize.literal('cameraNum ASC')
    });

    // make sure they are all recording...
    for (const modelcam of camList) {
        let cam = modelcam.toJSON(); // convert to json
        Snapshots.startGettingSnapshots(cam.id);

        // put a one sec pause between starts so things don't all happen at once
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    camList = null; //gc
}

async function stopMonitorEvents() {
    logger.info('Stop monitoring for lpr events')
    const sequelize = db.getDB();

    // start getting snapshots
    // get list of active cameras in db
    let camList = await db.models.Camera.findAll({
        where: [{
            active: true
        }],
        include: [{
            model: db.models.StorageDevice
        }],
        order: sequelize.literal('cameraNum ASC')
    });

    // make sure they are all recording...
    for (const modelcam of camList) {
        let cam = modelcam.toJSON(); // convert to json
        Snapshots.stopGettingSnapshots(cam.id);
    }

    camList = null; //gc
}


module.exports = {
    getCameraList,
    installCamerasFromOnvifSearch,
    startMonitorEvents,
    stopMonitorEvents,
    searchMissingCameras,
    addCamera,
    deleteCamera,
    updateCamera,
    addCameraSubject,
    deleteCameraSubject,
    updateCameraSubject,
    status,
    updateChangedCameras
}