// handle gestreamer snapshot pipline commands here
const db = require('./db');
// const config = require('../config/config');
const rxjs = require('rxjs');
const {
    take,
    filter,
    timeout
} = require('rxjs/operators');
const utils = require('./utils');
const P2J = require('pipe2jpeg');
const spawn = require('child_process').spawn;
const si = require('./system-info');
const config = require('../config/config');

const gstreamerErrorSubject = new rxjs.Subject();
const unreachableCameraErrorSubject = new rxjs.Subject(); // emits {cam: cam, timestamp: date} sent when gstreamer fails to connect to ip of camera (could be reboot, or bad ip, etc..)
const imageReceivedSubject = new rxjs.Subject(); // emits {cam, timestamp, count, img}
const gstreamerStartedSubject = new rxjs.Subject(); // emits (cam) = sent when there has been verified progress from camera


const imagePublishRate = -1; // -1 will send all images, or set to a time limit to no more then this often (in ms)
const startTimeout = 10000; //in ms, time to wait for started signal before retrying
const stalledTimeout = 5000; //in ms, time from last image received to consider a stream stalled
const streamToCollectImagesFrom = 2; // camera stream to decode images from 


// holds the cams that are supposed to be recording so they can be auto restarted on failure
// cameras are added to this list when started
// removed when explicited stopped();
//{dbId: cam.id, command: gstreamer process ref, pid: pid}
const status = {
    gstreamerInstances: []
};

const logger = require('./logging').getLog('app', 'gstreamer');


async function startGstreamer(camId) {



    // exit if already starting
    const idx = status.gstreamerInstances.findIndex(item => {
        return item.dbId === camId;
    });

    if (idx > -1 && status.gstreamerInstances[idx].starting) {
        return;
    }

    if (idx > -1) {
        await stopGstreamer(camId); // remove from list
    }

    const newStatus = {}; // new gstreamer status object

    // get latest from db
    const cam = await db.models.Camera.findOne({
        where: {
            id: camId
        },
        include: [{
            model: db.models.StorageDevice,
        }]
    });

    if (!cam) {
        return;
    }

    logger.info(`Starting gstreamer ${cam.name} cam number ${cam.cameraNum} ip:${cam.IPv4} mac:${cam.mac}`);

    let streamAddress;
    const stream1WithUserPass = cam.stream1.split('rtsp://').join(`rtsp://${cam.username}:${cam.password}@`); // add user and pass to stream
    const stream2WithUserPass = cam.stream2.split('rtsp://').join(`rtsp://${cam.username}:${cam.password}@`); // add user and pass to stream
    switch (streamToCollectImagesFrom) {
        case 1:
            streamAddress = stream1WithUserPass;
            break;
        case 2:
            streamAddress = stream2WithUserPass;
            break;
        default:
            streamAddress = stream2WithUserPass;
            break;
    }


    // INTERVAL IMAGE CAPTURE
    const p2j = new P2J();

    let jpegCounter = 0;
    let last = 0;
    let camJson = cam.toJSON()
    p2j.on('jpeg', (jpeg) => {
        // logger.info(`received jpeg ${cam.name}`, ++jpegCounter);
        const now = Date.now();

        if (imagePublishRate === -1 || now - last > imagePublishRate) {
            ++jpegCounter;

            const imgObj = {
                cam: camJson,
                timestamp: new Date(),
                count: jpegCounter,
                img: jpeg
            };
            imageReceivedSubject.next(imgObj);
            newStatus.lastImage = imgObj; // save current image
            last = now
        }


    });



    // using gstreamer
    // will need the following
    // sudo apt-get install gstreamer1.0-tools
    //gst-launch-1.0 -v -q rtspsrc location="rtsp://192.168.1.88:554/av0_1" do-timestamp=true is-live=true drop-on-latency=true latency=0 num-buffers=1 ! rtph264depay ! h264parse config-interval=-1 ! omxh264dec ! queue2 max-size-buffers=1 ! jpegenc idct-method=1 ! fdsink max-lateness=1 sync=false async=true
    //if (cam.cameraNum === 2) { // TEST TEST TEST



    // DEBUG print command string used
    // let str = '';
    // for (const p of getGstreamerParams(streamAddress)) {
    //     str += p + ' ';
    // }
    // logger.info('started with: ', str)

    let gstreamer;
    let winNC;

    try {

        if (process.platform === 'linux') {
            gstreamer = spawn('gst-launch-1.0', getGstreamerParams(streamAddress), {
                stdio: ['ignore', 'pipe', 'ignore'],
                detached: true
            });
        }

        if (process.platform === 'win32') {

            gstreamer = spawn(config.get('/winGstreamerPath') + '\\gst-launch-1.0.exe', getGstreamerParams(streamAddress, cam), {
                stdio: ['ignore', 'pipe', 'ignore'],
                detached: true
            });

            await new Promise(resolve => setTimeout(resolve, 2000)); // give the gstreamer process a change to start, because NC will just close if a server is not available

            winNC = spawn('D:\\Freelance\\Gate_control\\gate_dependency\\netcat-win32-1.12\\nc.exe', ['127.0.0.1', `555${cam.cameraNum}`], {
                stdio: ['ignore', 'pipe', 'ignore'],
                detached: true
            });
        }




        gstreamer.on('error', (error) => {
            logger.error(`Error during gstreamer process camera ${cam.cameraNum} ip: ${cam.IPv4} mac: ${cam.mac}, process stopped `, error);

            gstreamerErrorSubject.next(cam);

            const idx = status.gstreamerInstances.findIndex(item => {
                return item.dbId === cam.id;
            });

            if (idx > -1 && status.gstreamerInstances[idx].autoRestart) {
                process.nextTick(() => {
                    logger.error(`Will restart gstreamer for camera ${cam.cameraNum} ip: ${cam.IPv4} mac: ${cam.mac} in 3 seconds`);
                    setTimeout(() => {
                        startGstreamer(cam.id); // start again
                    }, 3000);
                });
            }

            // check if the error was that the camera was unreachable, this may mean it is rebooting, or the ip changed
            // send an unreachable event after 60 sec of no connection
            // error would include "Failed to connect" in stderr
            if (error && error.message.indexOf('Failed to connect') > -1 || error && error.indexOf && error.message.indexOf('Failed to connect') > -1) {
                // could not connect to camera at all
                // up the count
                status.gstreamerInstances[idx].unreachableCameraCount += 1;

                // notify that we have not been able to reach the camera for 60sec
                if (status.gstreamerInstances[idx].unreachableCameraCount >= 20) {
                    unreachableCameraErrorSubject.next({
                        cam: cam,
                        timestamp: new Date()
                    });
                }

            }

        });

        gstreamer.on('exit', (code, signal) => {
            logger.error(`Gstreamer for camera ${cam.cameraNum} ip: ${cam.IPv4} mac: ${cam.mac}, has stopped with code ${code}, signal ${signal}`);
            gstreamer.stdout.unpipe(p2j);
            gstreamer.removeAllListeners(['exit']);
            p2j.removeAllListeners(['jpeg']);
            stalledSub.unsubscribe();
            const idx = status.gstreamerInstances.findIndex(item => {
                return item.dbId === cam.id;
            });

            if (idx > -1 && status.gstreamerInstances[idx].autoRestart) {
                gstreamerErrorSubject.next(cam);
                process.nextTick(() => {
                    logger.info(`Will restart gstreamer for camera ${cam.cameraNum} ip: ${cam.IPv4} mac: ${cam.mac} in 3 seconds`);
                    setTimeout(() => {
                        return startGstreamer(cam.id); // start again
                    }, 3000);
                });
            }
        });

        if (process.platform === 'linux') {
            gstreamer.stdout.pipe(p2j);
        } else {
            winNC.stdout.pipe(p2j);
        }

    } catch (error) {
        logger.error(`Error starting gstreamer for ${cam.name} ip: ${cam.IPv4} mac: ${cam.mac} `, error);
    }

    // pipe not working with exec, with spawn it is ok!
    // const gstreamer = exec(`sudo gst-launch-1.0 -v -q rtspsrc location="${stream2WithUserPass}" do-timestamp=true is_live=true ! decodebin ! jpegenc ! fdsink`, (error, stdout, stderr) => {
    //     if(!error) {
    //         stdout.pipe(p2j);
    //     } else {
    //         logger.info('Gstreamer error', error);
    //     }

    // });
    //}

    // Wait for start
    const startedSub = imageReceivedSubject.pipe(filter(info => info.cam.id === cam.id)).pipe(take(1)).pipe(timeout(startTimeout)).subscribe(info => {
        logger.info(`Gstreamer for ${cam.name} ip: ${cam.IPv4} mac: ${cam.mac} successfully started`);

        // reset the unreachable count
        const gstreamerInstance = status.gstreamerInstances.find(item => {
            return item.dbId === cam.id;
        });

        gstreamerInstance.starting = false;


        gstreamerInstance.unreachableCameraCount += 1;

        gstreamerStartedSubject.next(cam);
    }, err => {
        // restart if no start signal is received within 10 sec
        // this prevents an ffmpeg process than has hung on start
        startedSub.unsubscribe();

        const idx = status.gstreamerInstances.findIndex(item => {
            return item.dbId === cam.id;
        });
        status.gstreamerInstances[idx].starting = false;
        logger.error(`Gstreamer for ${cam.name} ip: ${cam.IPv4} mac: ${cam.mac} did not start after ${startTimeout / 1000} seconds`);
        if (idx > -1 && status.gstreamerInstances[idx].autoRestart) {
            process.nextTick(() => {
                return startGstreamer(cam.id);
            });
        }
    });

    // check for stall
    const stalledSub = imageReceivedSubject.pipe(filter(info => info.cam.id === cam.id)).pipe(timeout(stalledTimeout)).subscribe(info => {
        // do nothing
    }, err => {
        // restart if no start signal is received within 10 sec
        // this prevents an ffmpeg process than has hung on start
        stalledSub.unsubscribe();
        logger.error(`Gstreamer for ${cam.name} ip: ${cam.IPv4} mac: ${cam.mac} has stalled! No images received for ${stalledTimeout} seconds`);

        const idx = status.gstreamerInstances.findIndex(item => {
            return item.dbId === cam.id
        });
        status.gstreamerInstances[idx].starting = false;
        if (idx > -1 && status.gstreamerInstances[idx].autoRestart) {
            process.nextTick(() => {
                return startGstreamer(cam.id);
            });
        }
    });

    // add to recording list
    newStatus.dbId = cam.id;
    newStatus.unreachableCameraCount = 0;
    newStatus.gstreamer = gstreamer;
    newStatus.startedSub = startedSub;
    newStatus.stalledSub = stalledSub;
    newStatus.pid = gstreamer ? gstreamer.pid : null;
    newStatus.p2j = p2j;
    newStatus.autoRestart = true;
    newStatus.starting = true;
    newStatus.lastImage = null;

    status.gstreamerInstances.push(newStatus);

    return true
}


function getGstreamerParams(streamAddress, cam = null) {
    // add based on pi version

    const piInfo = si.getPiInfo();
    let piType;
    if (piInfo && piInfo.model && piInfo.model.indexOf('Raspberry Pi 4') > -1) {
        piType = 4;
    }
    if (piInfo && piInfo.model && piInfo.model.indexOf('Raspberry Pi 3') > -1) {
        piType = 3;
    }

    // common params
    const params = [
        '-v',
        '-q'
    ];


    if (streamAddress.indexOf('rtsp://') > -1) { // && streamAddress.indexOf('.mp4') === -1
        params.push(...[
            /* use an live video input */
            'rtspsrc',
            `location="${streamAddress}"`,
            'do-timestamp=true',
            'is-live=true',
            'drop-on-latency=true',
            'latency=0',
            'num-buffers=1',
            '!',
            /* set output flags */
            'rtph264depay',
            '!'
        ]);
    } else {

        params.push(...[
            /* use an artificial video input */
            'filesrc',
            `location="${streamAddress}"`,
            '!'
        ]);
    }

    // pi 3 args
    // parse h264, send to omx decoder
    if (piType === 3) {
        params.push(...[
            'h264parse',
            'config-interval=-1',
            '!',
            'omxh264dec', // this is for pi3
            '!'
        ]);
    }

    // pi 4 args
    // use diffrent decoder
    if (piType === 4) {
        params.push(...[
            //'v4l2h264dec',   // this is for pi4
            'decodebin',
            '!',
        ]);
    }

    // windodws args
    if (!piInfo && process.platform === 'win32' || !piType && process.platform == 'linux') {
        params.push(...[
            'decodebin',
            '!',
        ]);
    }

    // more common parmams
    params.push(...[
        'videorate',
        '!',
        "video/x-raw,framerate=10/1", // limit framerate to 10fps
        '!',
        'queue2',
        'max-size-buffers=1',
        '!',
        'jpegenc',
        'idct-method=1',
    ]);


    if (process.platform !== 'win32') {
        params.push(...[
            '!',
            'fdsink',
            'max-lateness=1',
            'sync=false',
            'async=true'
        ]);
    }

    if (process.platform === 'win32') {
        params.push(...[
            '!',
            'tcpserversink',
            'host=127.0.0.1',
            `port=555${cam.cameraNum}`
        ]);
    }

    return params;
}

async function stopGstreamer(camId) {
    logger.info(`Stopping gstreamer process for ${camId}`)
    let result = true;
    // get index of running gstremaerInstances, kill it, remove it from the list
    const idx = status.gstreamerInstances.findIndex(item => {
        return item.dbId === camId;
    });
    if (idx > -1) {

        status.gstreamerInstances[idx].autoRestart = false;

        if (status.gstreamerInstances[idx].gstreamer) {
            try {
                status.gstreamerInstances[idx].gstreamer.removeAllListeners(['exit']);
                status.gstreamerInstances[idx].gstreamer.kill('SIGKILL'); // stop the command from running
            } catch (error) {
                logger.error(`Could not kill gstreamer process for camId: ${camId}:`, error);
                result = false;
            }
        }

        if (status.gstreamerInstances[idx].startedSub) {
            status.gstreamerInstances[idx].startedSub.unsubscribe();
            status.gstreamerInstances[idx].startedSub = null;
        }

        if (status.gstreamerInstances[idx].stalledSub) {
            status.gstreamerInstances[idx].stalledSub.unsubscribe();
            status.gstreamerInstances[idx].stalledSub = null;
        }

        if (status.gstreamerInstances[idx].p2j) {
            status.gstreamerInstances[idx].p2j.removeAllListeners(['jpeg']);
            status.gstreamerInstances[idx].p2j = null;
        }

        status.gstreamerInstances[idx].p2j = null;

        status.gstreamerInstances.splice(idx, 1); // remove from running list
    }

    return result;

}


async function isGstreamerRunning(cam) {
    // see if it is in the "running list", if so it should be recording
    const found = status.gstreamerInstances.find(item => {
        return item.dbId === cam.id;
    });

    if (found && found.pid) {
        // check if gstreamer is actually running
        return await utils.checkPid(found.pid);

    }
    return false;
}

function getStatusByCameraId(camId) {
    return status.gstreamerInstances.find(item => {
        return item.dbId === camId;
    });
}


module.exports = {
    startGstreamer,
    stopGstreamer,
    isGstreamerRunning,
    gstreamerErrorSubject,
    unreachableCameraErrorSubject,
    gstreamerStartedSubject,
    imageReceivedSubject,
    getStatusByCameraId
}