const rxjs = require('rxjs');
const {
    interval,
    merge
} = rxjs;
// const {interval} = require('rxjs');
const {
    takeUntil,
    auditTime,
    buffer,
    bufferTime,
    throttleTime,
    filter,
    timeInterval
} = require('rxjs/operators');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const utils = require('../lib/utils');
const db = require('../lib/db');
const util = require('util');
const logger = require('../logging').getLog('imageProcessor', 'timelapse');


let ffmpeg;
if (process.platform === 'win32') {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
}


if (process.platform === 'linux') {
    ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
    ffmpeg.setFfprobePath('/usr/bin/ffprobe');
}


async function createTimeLapse(cam, start, end, durationOfClipInSec) {
    const timespanInSecs = (end - start) / 1000;
    logger.info(`Making timelapse video of '${cam.name}' from ${start} to ${end} (${timespanInSecs}secs) with a final duration of ${durationOfClipInSec}`);

    return new Promise(async (resolve, reject) => {
        const Sequelize = require('sequelize');
        const Op = Sequelize.Op
        const snaps = await db.models.Snapshot.findAll({
            where: {
                cameraId: cam.id,
                timestamp: {
                    [Op.between]: [start, end]
                }
            }
        });

        logger.info('snaps ' + snaps.length);


        let frameRate = snaps.length / durationOfClipInSec;
        let targetFrameRate = 15;

        if (frameRate > targetFrameRate) {
            // remove extra frames
            let coff = Math.round(frameRate / targetFrameRate);
            const totalframes = snaps.length / coff;
            let i = snaps.length;
            while (snaps.length > totalframes) {
                i--;
                (i + 1) % coff === 0 && snaps.splice(i, 1);

                if (i === 0) {
                    frameRate = Math.round(snaps.length / durationOfClipInSec);
                    coff = Math.round(frameRate / targetFrameRate);
                    i = snaps.length; // reset to the end start again
                }

            }

            frameRate = snaps.length / durationOfClipInSec; // recalc framerate 
        }

        logger.info('spliced snaps ' + snaps.length + ' framerate ' + frameRate);

        // make concat list
        const snapshotPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/snapshotFolder'));

        const outputPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'));
        const concatFilePath = path.join(outputPath, 'tl.txt');

        try {
            const unlinkAsync = util.promisify(fs.unlink);
            await unlinkAsync(concatFilePath);
        } catch (error) {

        }

        const concatFS = fs.createWriteStream(concatFilePath, {
            flags: 'a' // 'a' means appending (old data will be preserved)
        });

        for (const snap of snaps) {
            concatFS.write(`file '${path.join(snapshotPath, snap.dayPath, snap.filename)}'\n`); // append string to file
        }

        concatFS.end() // close string


        // PROCESS LIST
        // ffmpeg -f concat -i tl.txt -an timelapse.mp4


        const command = ffmpeg();
        command.input(concatFilePath);
        command.inputOption('-f concat');
        command.inputOption('-safe 0');
        command.inputOption(`-r ${frameRate}`);
        command.output(path.join(outputPath, 'tl.mp4'));
        command.addOption('-an');
        command.addOption(`-r ${frameRate}`)
        command.addOption('-s 320x240')
        command.addOption('-c:v h264_omx')

        // setup event handlers
        command
            .on('start', (commandLine) => {
                //logger.info('Spawned Ffmpeg with command: ' + commandLine);
                if (commandLine) {
                    // log?
                }
            })
            .on('progress', (info) => {
                //logger.info(info);

            })
            .on('end', async (err) => {
                if (err) {
                    logger.error('error running ffmpeg command!: ', err);
                    return reject(err);
                }

                return resolve();
            })
            .on('error', async (err, stdout, stderr) => {
                if (err) {
                    logger.error(`Error making timelapse of camera ${cam.cameraNum} ip: ${cam.IPv4} mac: ${cam.mac}`, stderr);
                    return reject(err);
                }

            });


        // START FFMPEG COMMAND
        command.run();

    });

}



module.exports = {
    createTimeLapse
}