const Mp4Frag = require('mp4frag');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const {
    spawn
} = require('child_process');
const rxjs = require('rxjs');
const {
    timeout,
    take
} = require('rxjs/operators');
const db = require('../db');
const path = require('path');
const config = require('../../config/config');
const utils = require('../utils');
const SegmentProcessor = require('./segment-processor');

const logger = require('../logging').getLog('app', 'recording');

const segmentCompleteSubject = new rxjs.Subject();
const segmentCreatedSubject = new rxjs.Subject();

// recording status of each camera/stream
const cameraStatusList = [];

function isRecordingPlate(plate) {
    return cameraStatusList.findIndex(item => {
        return item.segmentProcessors.findIndex(sp => sp.plate === plate) > -1 ? true : false;
    }) > -1 ? true : false;
}

/**
 *Start recording of specified camera
 *
 * @param {*} camId
 * @param number preBufferClipCount, gets the number of frags to include at the video start
 */
async function startRecording(camId, filename, timeout, writePreBuffer) {
    const idx = cameraStatusList.findIndex(item => item.camId === camId)

    if (idx > -1) {
        let camStatus = cameraStatusList[idx];
        const streamInfo = camStatus.stream1;

        //  create segment processor, save segments
        const sp = new SegmentProcessor({
            streamInfo: streamInfo, // the stream metadata
            segLength: Number.MAX_SAFE_INTEGER, // how often to split the mp4 segments in seconds
            writePreBuffer: writePreBuffer, // ad the prebuffer to strat of the file,
            timeout: timeout, // never record for longer than this
            filename: filename, // filename of the new recording,
        });

        // start recording and add segmentprocess to list of active recordings
        streamInfo.fragParser.pipe(sp, {
            end: false
        });

        streamInfo.segmentProcessors.push(sp);
        streamInfo.recording = true;

        sp.segmentCompleteSubject.pipe(take(1)).subscribe(completedSeg => {
            segmentCompleteSubject.next(completedSeg);
        });

        sp.segmentCreatedSubject.pipe(take(1)).subscribe(newSegment => {
            segmentCreatedSubject.next(newSegment);
        });

        return streamInfo;

    }
}

/**
 *Stop recording of specified camera clip by filename
 *Completes the video clip and converts to standard MP4 file
 *
 * @param {*} camId
 */
async function stopRecording(camId, filename = null) {
    const idx = cameraStatusList.findIndex(item => item.camId === camId);

    if (idx > -1) {
        let camStatus = cameraStatusList[idx];
        const streamInfo = camStatus.stream1;

        // get segmentProcessor by filename
        const spIndex = streamInfo.segmentProcessors.findIndex(item => item._streamInfo.fragParser.camId === camId);

        if (spIndex > -1) {
            const sp = streamInfo.segmentProcessors[spIndex];
            // start saving segments after first one arrives
            //  create segment processor, save segments
            if (sp) {
                streamInfo.fragParser.unpipe(sp); // complete recording
                await sp._flush();
                streamInfo.segmentProcessors.splice(spIndex, 1);
            }
        }

        if (!streamInfo.segmentProcessors.length) {
            streamInfo.recording = false;
        }
    }
}


async function startReadingVideoStream(camId) {
    const cam = await db.models.Camera.findOne({
        where: {
            id: camId
        },
        include: db.models.StorageDevice
    });

    const camVaultPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/vaultFolder'));

    const cameraStatus = {
        camId: camId,
        stream1: {
            name: 'stream1',
            cam: cam,
            recordStream: true,
            fragParser: null,
            segmentProcessors: [],
            streamAddress: cam.stream1.split('rtsp://').join(`rtsp://${cam.username}:${cam.password}@`), // add user and pass to stream
            recording: false,
            ffmpegProcess: null,
            pid: null,
            autoRestart: true,
            restartTimeoutRef: null,
            camVaultPath: camVaultPath,
            recordingStoppedSubject: new rxjs.Subject(),
            newSegmentSubscription: null
        },
        stream2: {
            name: 'stream2',
            cam: cam,
            recordStream: false,
            fragParser: null,
            segmentProcessors: [],
            streamAddress: cam.stream2.split('rtsp://').join(`rtsp://${cam.username}:${cam.password}@`), // add user and pass to stream
            recording: false,
            ffmpegProcess: null,
            pid: null,
            autoRestart: true,
            restartTimeoutRef: null,
            camVaultPath: camVaultPath,
            recordingStoppedSubject: new rxjs.Subject(),
            newSegmentSubscription: null
        }
    };


    // verify video, live, snapshot folders
    await utils.ensurePath(camVaultPath);

    cameraStatusList.push(cameraStatus);

    // start ffmpeg processes
    launchFFmpeg(cameraStatus.stream1); // record this stream to mp4 files
    launchFFmpeg(cameraStatus.stream2); // do not record this one
}

/**
 *Stops recording of specified camera
 *
 * @param {*} camId
 */
async function stopReadingVideoStream(camId) {
    const idx = cameraStatusList.findIndex(item => item.camId === camId)

    if (idx > -1) {
        let camStatus = cameraStatusList[idx];

        logger.info(`Stopping recording for camera ${camStatus.stream1.cam.name} mac: ${camStatus.stream1.cam.mac} id: ${camStatus.camId}`);

        if (camStatus.segmentSavedObs) {
            camStatus.segmentSavedObs.unsubscribe()
        }

        try {
            camStatus.stream1.autoRestart = false;
            camStatus.stream1.recording = false;
            if (camStatus.stream1.ffmpegProcess) {
                if (camStatus.stream1.restartTimeoutRef) {
                    clearTimeout(camStatus.stream1.restartTimeoutRef);
                }


                const closeObs = rxjs.fromEvent(camStatus.stream1.ffmpegProcess, 'close').pipe(timeout(1000), take(1));
                camStatus.stream1.ffmpegProcess.kill('SIGKILL')

                camStatus.stream1.pid = null;
                camStatus.stream1.recordingStoppedSubject.next(camId);

                await closeObs.toPromise();
            }
        } catch (error) {
            logger.error(error)
        }

        try {
            camStatus.stream2.autoRestart = false;
            camStatus.stream2.recording = false;
            if (camStatus.stream2.ffmpegProcess) {
                if (camStatus.stream2.restartTimeoutRef) {
                    clearTimeout(camStatus.stream2.restartTimeoutRef);
                }

                const closeObs = rxjs.fromEvent(camStatus.stream2.ffmpegProcess, 'close').pipe(timeout(1000), take(1));
                camStatus.stream2.ffmpegProcess.kill('SIGKILL');

                camStatus.stream2.pid = null;
                camStatus.stream2.recordingStoppedSubject.next(camId);



                await closeObs.toPromise();
            }
        } catch (error) {
            logger.error(error)
        }

        // cleanup
        for (let key of Object.keys(camStatus)) {
            camStatus[key] = null; // gc
        }

        status = null;

        cameraStatusList.splice(idx, 1); // remove from list
    } else {
        logger.info(`Camera stop was requested for camera id: ${camId}, but it is not recording`);
    }
}

function launchFFmpeg(streamInfo) {
    const winFfmpegPath = ffmpegPath;
    streamInfo.ffmpegProcess = spawn(
        process.platform === 'linux' ? 'ffmpeg' : winFfmpegPath,
        getFfmpegArgs(streamInfo.streamAddress), {
            stdio: ['ignore', 'pipe', 'ignore'],
            detached: true
        }
    );

    streamInfo.ffmpegProcess.once('close', (code) => {
        streamInfo.recording = false;
        streamInfo.ffmpegProcess.removeAllListeners(['close']);
        streamInfo.fragParser.removeAllListeners(['segment']);
        streamInfo.ffmpegProcess.stdio[1].unpipe(streamInfo.fragParser);
        streamInfo.recordingStoppedSubject.next(streamInfo.cam.id);
        streamInfo.ffmpegProcess = null;
        if (streamInfo.autoRestart) {
            logger.error(`Ffmpeg process for ${streamInfo.name} - ${streamInfo.cam.name} mac: ${streamInfo.cam.mac} id: ${streamInfo.cam.id}, exited with code ${code}, restarting in 5 seconds`);
            streamInfo.restartTimeoutRef = setTimeout(() => {
                launchFFmpeg(streamInfo); // relaunch
            }, 5000);
        } else {
            logger.info(`Ffmpeg process for ${streamInfo.name} - cam ${streamInfo.cam.id} exited with code ${code}`);
        }
    });

    // streamInfo.ffmpegProcess.stderr.on('data', err => {
    //     console.log(err.toString());
    // })

    streamInfo.pid = streamInfo.ffmpegProcess.pid;

    // create new mp4 parser
    streamInfo.fragParser = new Mp4Frag({
        hlsListSize: 5,
        preBufferListSize: 10,
        hlsBase: `part`,
        camId: streamInfo.cam.id
    });


    // process chunks as they arrive from stream
    streamInfo.ffmpegProcess.stdio[1].pipe(streamInfo.fragParser, {
        end: false
    }).once('error', error => {
        logger.error(error);
        if (streamInfo.ffmpegProcess) {
            streamInfo.ffmpegProcess.kill();
        }
    });

}

function getFfmpegArgs(streamAddress) {
    //     command.inputOptions([ '-thread_queue_size 512',   ', '-threads 1']);

    if (streamAddress.indexOf('rtsp://') === -1 && streamAddress.indexOf('.mp4') > -1) {
        // this is a looped video
        return [
            '-re',
            '-stream_loop', '-1',
            '-i', streamAddress,
            '-c', 'copy',
            '-f', 'mp4',
            '-g', '30',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-metadata', 'title="Gate Control"',
            'pipe:1'
        ];
    }

    return [
        '-max_error_rate', '.5',
        '-avioflags', '+direct',
        '-copy_unknown',
        '-err_detect', 'ignore_err',
        '-rtbufsize', '100k',
        '-max_interleave_delta', '300000',
        '-stimeout', '6000000',
        '-fflags', '+genpts+igndts+discardcorrupt+nobuffer+flush_packets',
        '-reorder_queue_size', '5',
        '-rtsp_transport', 'tcp',
        '-use_wallclock_as_timestamps', '1',
        '-i', streamAddress,
        '-map', '0:0',
        //'-map', '0:1?',
        //'-c:a', 'aac',
        '-c:v', 'copy',
        '-f', 'mp4',
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        //'-write_prft', 'wallclock',
        '-metadata', 'title="Gate Control"',
        '-reset_timestamps', '1',
        'pipe:1'
    ]
}

function getStatusByCamId(camId) {
    return cameraStatusList.find(item => item.camId === camId);
}

module.exports = {
    getStatusByCamId,
    startReadingVideoStream,
    stopReadingVideoStream,
    startRecording,
    stopRecording,
    isRecordingPlate
}