// main processing loop started by arrival of vehicle on sensor
const Modbus = require('../../lib/modbus');
const db = require('../../lib/db');
const gstreamer = require('../../lib/gstreamer');
const Recording = require('../../lib/recording');
const uuidv4 = require('uuid/v4');
const ip = require('../../lib/image-processing');
const {
    take
} = require('rxjs/operators');
const ioServer = require('../webserver/socketio/server');
const config = require('../../config/config');
const path = require('path');
const logger = require('../../lib/logging').getLog('app', 'PL');

const events = []; // current events before saving

function getEventByGateId(id) {
    return events.find(item => item.record.gateId === id);
}

async function startMonitoringEvents() {
    logger.info('Starting Monitoring Modbus');

    const gates = await db.models.Gate.findAll();

    for (const gate of gates) {
        const event = {
            status: 'pending',
            type: 'plate detection',
            plate: null,
            isBlacklisted: false,
            isOverride: false,
            startDate: null,
            carOnSensor: null,
            carOffSensor: null,
            gateOpened: null,
            gateClosed: null,
            endDate: null,
            duration: 0,
            sensorDuration: 0,
            gateOpenDuration: 0,
            searchString: '',
            complete: false,
            isApproved: false,
            isDenied: false,
            isDeniedAndBlacklisted: false,
            isPendingAction: true,
            currentGateStatus: {
                gateOpen: false,
                sensor: false
            }
        }
        ioServer.io.emit('pl_event_update', {
            id: gate.id,
            event: event
        });
    }



    // car on sensor
    Modbus.carOnSensorSubject.subscribe(async data => {
        // result = {result: result, gate: gate}



        //console.log(result)
        const eventDate = new Date();

        // create event object
        const event = {
            record: {
                status: 'pending',
                type: 'plate detection',
                plate: null,
                isBlacklisted: false,
                isOverride: false,
                startDate: eventDate,
                carOnSensor: eventDate,
                carOffSensor: null,
                gateOpened: null,
                gateClosed: null,
                endDate: null,
                duration: 0,
                sensorDuration: 0,
                gateOpenDuration: 0,
                searchString: '',
                complete: false,
                isApproved: false,
                isDenied: false,
                isDeniedAndBlacklisted: false,
                isPendingAction: true,
                // refs
                recordingId: null,
                gateId: data.result.gateId,
                userId: null,
                snapshotId: null,
                cameraId: data.gate.cameraId,

                // not part of model
                currentGateStatus: Modbus.getStatusByGateId(data.result.gateId),
                isRecording: false,
                lprStatusMessage: '',
                lprProcessing: false
            },
            streamInfo: null,
            tempId: uuidv4(),
            gateInstance: null
        };

        event.gateInstance = await db.models.Gate.findOne({
            where: {
                id: data.result.gateId
            }
        });

        events.push(event); // add event to list

        logger.info(`Gate ${event.gateInstance.name} - Car on sensor`);

        // start updating event with avaiable info

        // get latest snapshot
        const gStatus = gstreamer.getStatusByCameraId(data.gate.cameraId);
        if (!gStatus) {

            return;
        }
        const imgObj = gStatus.lastImage;

        // start recording
        const filename = uuidv4() + '.mp4';
        const streamInfo = await Recording.startRecording(imgObj.cam.id, filename, 600000, true);
        event.streamInfo = streamInfo;


        // wait for recording to start
        streamInfo.segmentProcessors[0].segmentCreatedSubject.pipe(take(1)).subscribe(async newSeg => {
            logger.info(`Gate ${event.gateInstance.name} - Recording Started`);
            Modbus.getCurrentStatus
            event.record.recordingId = newSeg.recInstance.id;
            event.record.isRecording = true;

            // start plate detection
            event.record.lprProcessing = true;
            event.record.status = 'Looking for plate';
            event.record.lprStatusMessage = 'Looking for plate';
            ioServer.io.emit('pl_event_update', {
                id: event.record.gateId,
                event: event.record
            });

            // get/save snapshot
            const snapRec = await ip.saveSanpshot(imgObj.cam, imgObj.img, imgObj.timestamp, newSeg.recInstance.id, '');
            event.record.snapshotId = snapRec.id;

            const snapshotPath = path.join(imgObj.cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), imgObj.cam.id, config.get('/snapshotFolder'), snapRec.dayPath);


            const plateData = await ip.LPR.carmenLPR.detectLicensePlate(imgObj.cam.id, imgObj.img, imgObj.timestamp, uuidv4(), snapshotPath);
            event.record.plate = plateData.plate;

            if (plateData.hasPlate) {
                snapRec.plate = plateData.plate;
                await snapRec.save();
            }

            event.record.lprProcessing = false;
            event.record.lprStatusMessage = plateData.plate;
            ioServer.io.emit('pl_event_update', {
                id: event.record.gateId,
                event: event.record
            });

            // check blacklist
            if (event.record.plate) {
                const plateOnBlacklist = await db.models.Blacklist.findOne({
                    where: {
                        plate: event.record.plate
                    }
                });

                if (plateOnBlacklist) {
                    event.record.isBlacklisted = true;
                }
            } else {
                event.record.isBlacklisted = false;
            }




            ioServer.io.emit('pl_event_new', {
                id: event.record.gateId,
                event: event.record
            });

            ioServer.io.emit('pl_event_caronsensor', {
                id: event.record.gateId,
                event: event.record
            });

            ioServer.io.emit('pl_event_update', {
                id: event.record.gateId,
                event: event.record
            });

            // wait for recording to finish
            streamInfo.segmentProcessors[0].segmentCompleteSubject.pipe(take(1)).subscribe(async completedSeg => {
                logger.info(`Gate ${event.gateInstance.name} - Recording completed`);

                event.record.duration = completedSeg.duration;
                event.record.complete = true;
                event.record.endDate = completedSeg.end;
                event.record.isRecording = false;

                // save everything to db
                const newEventRec = await db.models.Event.create(event.record);

                setTimeout(() => {
                    // send event complete notification
                    ioServer.io.emit('pl_event_complete', {
                        id: newEventRec.gateId,
                        event: newEventRec.toJSON() // with id included
                    });

                    ioServer.io.emit('pl_event_update', {
                        id: newEventRec.id,
                        event: newEventRec.toJSON(),
                    });
                }, 300);


                // remove from status list
                const idx = events.findIndex(item => item.tempId === event.tempId);
                events.splice(idx, 1); // remove

            });

        });


    });

    // car off sensor
    Modbus.carOffSensorSubject.subscribe(async data => {
        const event = getEventByGateId(data.result.gateId);
        if (!event) {
            return;
        }

        logger.info(`Gate ${event.gateInstance.name} - Car OFF sensor`);
        event.record.carOffSensor = new Date();
        event.record.sensorDuration = event.record.carOffSensor.getTime() - event.record.carOnSensor.getTime(); // in ms

        event.record.currentGateStatus = Modbus.getStatusByGateId(event.record.gateId);

        ioServer.io.emit('pl_event_caroffsensor', {
            id: event.record.gateId,
            event: event.record
        });

        ioServer.io.emit('pl_event_update', {
            id: event.record.gateId,
            event: event.record
        });

        if (event.record.isPendingAction) {
            event.record.status = 'Car left sensor before user action';
            logger.info(`Gate ${event.gateInstance.name} - Car left before use action`);
        }

        await completeEvent(event.record.gateId);
    });

    // gate opened
    Modbus.gateOpenedSubject.subscribe(data => {
        const event = getEventByGateId(data.result.gateId);

        if (!event) {
            return;
        }
        logger.info(`Gate ${event.gateInstance.name} - Gate opened`);

        event.record.gateOpened = new Date();
        event.record.currentGateStatus = Modbus.getStatusByGateId(event.record.gateId);

        event.record.status = 'Gate Open';

        ioServer.io.emit('pl_event_gateopened', {
            id: event.record.gateId,
            event: event.record
        });

        ioServer.io.emit('pl_event_update', {
            id: event.record.gateId,
            event: event.record
        });
    });

    //gate closed
    Modbus.gateClosedSubject.subscribe(async data => {
        const event = getEventByGateId(data.result.gateId);
        if (!event) {
            return;
        }

        logger.info(`Gate ${event.gateInstance.name} - Gate closed`);

        event.record.gateClosed = new Date();
        if (event.record.gateOpened && event.record.gateClosed) {
            event.record.gateOpenDuration = event.record.gateOpened.getTime() - event.record.gateClosed.getTime(); // in ms
        }

        // await completeEvent(event.record.gateId);

        ioServer.io.emit('pl_event_gateclosed', {
            id: event.record.gateId,
            event: event.record
        });

        ioServer.io.emit('pl_event_update', {
            id: event.record.gateId,
            event: event.record
        });
    });

}


async function completeEvent(gateId) {
    let event = getEventByGateId(gateId);

    logger.info(`Gate ${event.gateInstance.name} - Stopping recording`);

    event.record.currentGateStatus = Modbus.getStatusByGateId(event.record.gateId);


    // trigger stop recording
    try {
        await Recording.stopRecording(event.record.cameraId);
    } catch (error) {

    }


    ioServer.io.emit('pl_event_update', {
        id: event.record.gateId,
        event: event.record
    });

    setTimeout(async () => {
        const event = getEventByGateId(gateId); // see if event still exists

        if (event) {
            logger.info(`Gate ${event.gateInstance.name} - Recording error, completing event anyway`);

            event.record.duration = 0;
            event.record.complete = true;
            event.record.endDate = null;
            event.record.isRecording = false;
            event.record.plate = '';

            // save everything to db
            const newEventRec = await db.models.Event.create(event.record);

            setTimeout(() => {
                // send event complete notification
                ioServer.io.emit('pl_event_complete', {
                    id: newEventRec.gateId,
                    event: newEventRec.toJSON() // with id included
                });

                ioServer.io.emit('pl_event_update', {
                    id: newEventRec.id,
                    event: newEventRec.toJSON(),
                });
            }, 300);


            // remove from status list
            const idx = events.findIndex(item => item.tempId === event.tempId);
            events.splice(idx, 1); // remove
        }

    }, 2500);
}

async function approve(gateId, userId) {
    const event = getEventByGateId(gateId);

    logger.info(`Gate ${event.gateInstance.name} - Car approved`);

    event.record.isApproved = true;
    event.record.isDenied = false;
    event.record.isDeniedAndBlacklisted = false;
    event.record.userId = userId;
    event.record.isPendingAction = false;

    ioServer.io.emit('pl_event_update', {
        id: event.record.gateId,
        event: event.record
    });

    await Modbus.openGate(event.gateInstance);

    setTimeout(async () => {
        await Modbus.closeGate(event.gateInstance); // this will complete the event

        // make sure the recording stops
        setTimeout(() => {
            if (!event.record.complete) {
                completeEvent(event.gateInstance.id);
            }
        }, 10000);

    }, config.get('/gateOpenTimeAfterApproval'));

    event.record.status = 'Approved';
}

async function deny(gateId, userId) {
    const event = getEventByGateId(gateId);

    logger.info(`Gate ${event.gateInstance.name} - Car denied`);

    event.record.isApproved = false;
    event.record.isDenied = true;
    event.record.isDeniedAndBlacklisted = false;
    event.record.isOverride = false;
    event.record.userId = userId;
    event.record.isPendingAction = false;

    ioServer.io.emit('pl_event_update', {
        id: event.record.gateId,
        event: event.record
    });

    if (event.currentGateStatus && event.currentGateStatus.gateOpen) {
        await Modbus.closeGate(event.gateInstance); // complete recording
    } else {
        await completeEvent(gateId);
    }

    event.record.status = 'Denied';
}

async function denyAndBlacklist(gateId, userId) {
    const event = getEventByGateId(gateId);

    logger.info(`Gate ${event.gateInstance.name} - Car denied and blacklisted`);

    const data = {
        plate: event.record.plate,
        notes: 'Deny and Blacklist Action',
        gateId: gateId,
        cameraId: event.record.cameraId,
        userId: event.record.userId
    }

    // add to blacklist 
    const bl = await db.models.Blacklist.create(data);

    event.record.isApproved = false;
    event.record.isDenied = false;
    event.record.isDeniedAndBlacklisted = true;
    event.record.isBlacklisted = true;
    event.record.isOverride = false;
    event.record.userId = userId; // save user that did this
    event.record.isPendingAction = false;

    ioServer.io.emit('pl_event_update', {
        id: event.record.gateId,
        event: event.record
    });

    if (event.currentGateStatus && event.currentGateStatus.gateOpen) {
        await Modbus.closeGate(event.gateInstance); // complete recording
    } else {
        await completeEvent(gateId);
    }

    event.record.status = 'Denied and Blacklisted';
}

async function override(gateId, userId) {
    const event = getEventByGateId(gateId);

    logger.info(`Gate ${event.gateInstance.name} - Car blacklist overridden`);

    event.record.isApproved = false;
    event.record.isDenied = false;
    event.record.isDeniedAndBlacklisted = true;
    event.record.isBlacklisted = true;
    event.record.isOverride = true;
    event.record.userId = userId; // save user that did this
    event.record.isPendingAction = false;

    ioServer.io.emit('pl_event_update', {
        id: event.record.gateId,
        event: event.record
    });

    await Modbus.openGate(event.gateInstance);

    setTimeout(async () => {
        await Modbus.closeGate(event.gateInstance); // this will complete the event
    }, config.get('/gateOpenTimeAfterApproval'));

    event.record.status = 'Blacklist Override';
}

function getEvents() {
    return events;
}

module.exports = {
    startMonitoringEvents,
    getEventByGateId,
    approve,
    deny,
    denyAndBlacklist,
    override,
    getEvents
}