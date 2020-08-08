const onvif = require('onvif');
const Cam = onvif.Cam;
const _ = require('lodash');
//const OnvifManager = require('onvif-nvt');
const rxjs = require('rxjs');
const logger = require('./logging').getLog('onvif');
const evilscan = require('evilscan');

const motionEventSubject = new rxjs.Subject();

const status = {
    scanningForCameras: false,
    monitoringCams: [] // {id: camId, cam: OnvifCam }
};

const upList = [{
        u: 'admin',
        p: 'admin'
    },
    {
        u: 'Admin',
        p: '1234'
    },
    {
        u: 'admin',
        p: ''
    },
    {
        u: 'admin',
        p: '123456'
    },
    {
        u: 'admin',
        p: '000000'
    },
];

// return list of onvif cameras
async function scanForCameras(getExtendedInfo = true) {
    status.scanningForCameras = true;
    let camList = [];
    await new Promise((resolve, reject) => {

        logger.info('Scanning for cameras');
        // on windows (win10 at least) the probe will fail after 1 or two runs until the arp cache is cleared. not sure why this is?
        // to clear the arp cache run from an elevated cmd: arp -d *
        onvif.Discovery.probe({
            timeout: 5000
        }, async (err, cams) => {
            // function will be called only after timeout (5 sec by default)
            if (err) {
                logger.info(err);
                return reject(err);
            }
            if (cams && !cams.length) {
                logger.info('No cameras found during scan');
            } else {
                logger.info(`Scan complete, found ${cams.length} cameras`);
                for (const cam of cams) {

                    if (getExtendedInfo) {

                        const info = await getCamInfo(cam);
                        if (info) {
                            cam.exinfo = info;
                        } else {
                            logger.error(`Could not get info from camera: ${cam.hostname}`);
                        }
                        camList.push(cam);
                    } else {
                        camList.push(cam);
                    }



                }
            }
            resolve();
        });



    });

    // also Ip scan BRUTE FORCE FOR PORT 554
    const foundByIpList = [];

    await new Promise(resolve => {

        var options = {
            target: '192.168.1.0/24',
            port: '554',
            status: 'O', // Timeout, Refused, Open, Unreachable
            banner: true
        };

        new evilscan(options, (err, scan) => {

            if (err) {
                console.log(err);
                return;
            }

            scan.on('result', (data) => {
                // fired when item is matching options

                if (camList.findIndex(item => item.hostname == data.ip) == -1) {
                    foundByIpList.push(data);
                }
            });

            scan.on('error', (err) => {
                throw new Error(err.toString());
            });

            scan.on('done', async () => {

                for (const tmpCam of foundByIpList) {

                    console.log(tmpCam);

                    const cam = await tryGetCam(tmpCam.ip)

                    if (cam) {
                        if (getExtendedInfo) {

                            const info = await getCamInfo(cam);
                            if (info) {
                                cam.exinfo = info;
                            } else {
                                logger.error(`Could not get info from camera: ${cam.hostname}`);
                            }
                            camList.push(cam);
                        } else {
                            camList.push(cam);
                        }
                    }

                }



                resolve();
            });

            scan.run();
        });
    });
    // OnvifManager.add('discovery')
    // const deviceList = await OnvifManager.discovery.startProbe();
    // logger.info(deviceList)
    // // 'deviceList' contains all ONVIF devices that have responded.
    // // If it is empty, then no ONVIF devices
    // // responded back to the broadcast.
    status.scanningForCameras = false;
    return camList;
}


async function tryGetCam(ip) {



    let cam;


    for (const up of upList) {

        const connectOptions = {
            hostname: ip,
            timeout: 10000,
            username: up.u,
            password: up.p,
            preserveAddress: true // Enables NAT support and re-writes for PullPointSubscription URL
        }

        cam = await new Promise((resolve) => {

            const onvifCam = new Cam(connectOptions, (err) => {
                if (err && err.errno === 'ETIMEDOUT') {
                    //logger.error(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - timeout trying to start event monitoring on port ${port}`);
                    return resolve(null); // timed out
                }

                if (err) {
                    console.log(err.message)
                    //logger.error(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - An error occured while starting event monitoring`, err.message);
                    return resolve(null); // could not connect
                }

                //logger.trace(`Successful connection!, onvif port ${port} for camera ip: ${dbCam.IPv4}`);
                return resolve(onvifCam);
            });
        });

        if (cam) {
            break;
        }

    }

    return cam;
}

// get revelant info for each camera
async function getCamInfo(cam) {
    logger.info(`Getting camera info for: ${cam.hostname}`);
    let info;

    // default username/pass is admin/admin
    // try a few common ones if that doesn't work


    // use this as the defualt username and password
    // more common combos will be tried in camConnect() if this fails..
    cam.username = upList[0].u;
    cam.password = upList[0].p;

    let success = await camConnect(cam);

    if (!success) {
        for (let i = 1; i < upList.length; i++) {
            const up = upList[i];

            logger.info(`Could not login to camera ${cam.hostname} with '${cam.username}'/'${cam.password}', now trying '${up.u}'/'${up.p}'`);
            cam.username = up.u;
            cam.password = up.p;
            success = await camConnect(cam, up.u, up.p);
            if (success) {
                logger.info(`Successfully logged into ${cam.hostname} with '${up.u}'/'${up.p}'`);
                break;
            }
        }
    }




    if (success) {
        const ni = await getNetworkInterfaces(cam);
        const mainUri = await getMainStreamUri(cam);
        const subUri = await getSubStreamUri(cam);
        const snapshotUri = await getSnapshotUri(cam);
        info = {
            hostname: cam.hostname,
            username: cam.username,
            password: cam.password,
            onvifPort: parseInt(cam.port),
            IPv4: _.get(ni, 'networkInterfaces.IPv4.config.manual.address', ''),
            DHCP: _.get(ni, 'networkInterfaces.IPv4.config.DHCP', false),
            mac: _.get(ni, 'networkInterfaces.info.hwAddress', ''),
            mainStreamUri: mainUri,
            mainStreamWidth: _.get(cam, 'profiles[0].videoEncoderConfiguration.resolution.width', 0),
            mainStreamHeight: _.get(cam, 'profiles[0].videoEncoderConfiguration.resolution.height', 0),
            mainStreamProfile: _.get(cam, 'profiles[0]', {}),
            mainStreamHasAudio: _.get(cam, 'profiles[0].audioEncoderConfiguration', false) ? true : false,
            subStreamUri: subUri,
            subStreamWidth: _.get(cam, 'profiles[1].videoEncoderConfiguration.resolution.width', 0),
            subStreamHeight: _.get(cam, 'profiles[1].videoEncoderConfiguration.resolution.height', 0),
            subStreamProfile: _.get(cam, 'profiles[1]', {}),
            subStreamHasAudio: _.get(cam, 'profiles[0].audioEncoderConfiguration', false) ? true : false,
            snapshotUri: snapshotUri
        };
    }

    return info;
}

async function getNetworkInterfaces(cam) {
    return await new Promise(resolve => {
        cam.getNetworkInterfaces((err, ni) => {
            resolve(ni);
        });
    });
}

async function getMainStreamUri(cam) {
    let token;
    if (cam.activeSource && cam.activeSource.profileToken) {
        token = cam.activeSource.profileToken
    } else if (cam.profiles && cam.profiles.length) {
        token = cam.profiles[1].$.token;
    }
    return await new Promise(resolve => {
        cam.getStreamUri({
            protocol: 'RTSP',
            profileToken: token
        }, (err, uri) => {
            resolve(_.get(uri, 'uri', ''));
        });
    });
}

async function getSubStreamUri(cam) {
    return await new Promise(resolve => {

        if (cam.profiles && cam.profiles.length > 1) {
            cam.getStreamUri({
                protocol: 'RTSP',
                profileToken: cam.profiles[1].$.token
            }, (err, uri) => {
                resolve(_.get(uri, 'uri', ''));
            });
        } else {
            resolve('');
        }


    });
}

async function getSnapshotUri(cam) {
    return await new Promise(resolve => {
        cam.getSnapshotUri((err, uri) => {
            resolve(_.get(uri, 'uri', ''));
        });
    });
}

async function camConnect(cam, user = null, pass = null) {
    try {
        return await new Promise((resolve, reject) => {

            // use supplied user/pass, or jsut use what is already set
            if (user) {
                cam.username = user;
            }

            if (pass) {
                cam.password = pass;
            }

            cam.connect(err => {
                if (err) {
                    return reject(false);
                } else {
                    return resolve(true);
                }
            });
        });
    } catch (error) {
        return false;
    } finally {

    }
}

async function startMonitorCameraEvents(dbCam) {
    return
    const camId = dbCam.id;

    const portList = [80, 8899, 2000, 8080]; // onvif ports to try
    let onvifCam;

    if (dbCam.onvifPort) {
        portList.unshift(dbCam.onvifPort);
    }

    // try to connect to each port
    for (const port of portList) {
        logger.trace(`Trying onvif port ${port} for camera ip: ${dbCam.IPv4}`);
        const result = await new Promise((resolve) => {
            const connectOptions = {
                hostname: dbCam.IPv4,
                username: dbCam.username,
                password: dbCam.password,
                port: port,
                timeout: 10000,
                preserveAddress: true // Enables NAT support and re-writes for PullPointSubscription URL
            }

            onvifCam = new Cam(connectOptions, (err) => {
                if (err && err.errno === 'ETIMEDOUT') {
                    logger.error(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - timeout trying to start event monitoring on port ${port}`);
                    return resolve(false); // timed out
                }

                if (err) {
                    // console.log(err)
                    //logger.error(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - An error occured while starting event monitoring`, err.message);
                    return resolve(false); // could not connect
                }

                logger.trace(`Successful connection!, onvif port ${port} for camera ip: ${dbCam.IPv4}`);
                return resolve(true);
            });
        });

        if (result && onvifCam) {
            break; // exit loop
        }
    }

    if (onvifCam) {
        logger.trace(`monitoring ${dbCam.IPv4}`);
        let buttonState;

        onvifCam.on('event', (event) => {
            logger.trace(`event for camera ${dbCam.IPv4}`)
            if (event.topic._.indexOf('CellMotionDetector/Motion') !== -1) {
                const name = _.get(event, 'message.message.data.simpleItem.$.Name', null);
                if (name === 'isMotion' || name === 'IsMotion') {
                    const motionData = _.get(event, 'message.message.data.simpleItem', null);
                    logger.debug(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - Motion detected`);
                    motionEventSubject.next({
                        cam: dbCam.id,
                        data: motionData
                    });
                }
            }

            // watch for button press, or input trigger change
            if (event.topic._.indexOf('DigitalInput') !== -1) {
                const test = _.get(event, 'message.message.data.simpleItem.$.Name', null);
                if (test == 'LogicalState') {
                    const value = _.get(event, 'message.message.data.simpleItem.$.Value', null);
                    if (value && !buttonState) {
                        logger.info(new Date(), "button pressed!");
                        buttonState = value;
                    }

                    if (!value && buttonState) {
                        logger.info(new Date(), "button released!");
                        buttonState = value;
                    }

                }

            }

            // logger.info(event.topic._);
            // logger.info(event.message.message.data.simpleItem.$);
        });


        status.monitoringCams.push({
            id: camId,
            onvifCam: onvifCam
        });
    } else {
        logger.warn(`Camera ${dbCam.cameraNum} - ip: ${dbCam.IPv4} mac: ${dbCam.mac} - Could not establish connection to onvif event monitoring`);
    }
}


function stopMonitoringCameraEvents(camId) {

    const oc = status.monitoringCams.findIndex(item => item.id === camId);

    if (oc > -1) {
        status.monitoringCams[oc].onvifCam.removeAllListeners(['event']);
        status.monitoringCams.splice(oc)
    }

}



module.exports = {
    scanForCameras,
    status,
    startMonitorCameraEvents,
    stopMonitoringCameraEvents,
    motionEventSubject
}