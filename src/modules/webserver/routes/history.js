const express = require('express');
const historyRoute = express.Router();
const path = require('path');
const fs = require("fs");
const config = require('../../../config/config');
const db = require('../../../lib/db');
const ioServer = require('../socketio/server');
const rec = require('../../../lib/recording');
const Sequelize = require('sequelize');
const readChunk = require('read-chunk');
const logger = require('../../../lib/logging').getLog('webserver', 'history');


historyRoute.get('/snapshotlarge/:snapId', async (req, res) => {
    const snapId = req.params.snapId;

    if (!snapId) {
        return res.status(400).end();
    }

    try {
        const snapshot = await db.models.Snapshot.findOne({
            where: {
                id: snapId
            },
            include: [{
                model: db.models.Camera,
                include: [db.models.StorageDevice]
            }]
        });
        if (snapshot) {
            const snapPath = path.join(snapshot.camera.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), snapshot.cameraId, config.get('/snapshotFolder'), snapshot.dayPath, snapshot.filename);
            res.contentType(snapPath)
            return res.sendFile(snapPath);
 
        } else {
            res.status(400).end();
        }
    } catch (error) {
        logger.error(error);
    }

});

historyRoute.get('/snapshotsmall/:snapId', async (req, res) => {
    const snapId = req.params.snapId;

    if (!snapId) {
        return res.status(400).end();
    }

    try {
        const snapshot = await db.models.Snapshot.findOne({
            where: {
                id: snapId
            },
            include: [{
                model: db.models.Camera,
                include: [db.models.StorageDevice]
            }]
        });
        if (snapshot) {
            const snapPath = path.join(snapshot.camera.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), snapshot.cameraId, config.get('/snapshotFolder'), snapshot.dayPath, snapshot.thumbFilename);
            res.contentType(snapPath)
            return res.sendFile(snapPath);

        } else {
            res.status(400).end();
        }
    } catch (error) {
        logger.error(error);
    }

});

historyRoute.get('/:camId/:streamId/init-:recId.mp4', async (req, res) => {
    const recId = req.params.recId;

    const initSegment = await getInitSegment(recId);

    try {
        if (initSegment) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4'
            });
            res.end(initSegment);
        } else {
            res.sendStatus(503);
        }
    } catch (error) {

    }

});

async function getInitSegment(recId) {
    const rec = await db.models.Recording.findOne({
        where: {
            id: recId
        },
        include: [db.models.StorageDevice]
    });
    const camVaultPath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.cameraId, config.get('/vaultFolder'));
    return readChunk(path.join(camVaultPath, rec.filename), 0, rec.initSize);
}


// get segment file
historyRoute.get('/:camId/:streamId/:chunkIds*\_:segcnt.m4s', async (req, res) => {
    try {

        // logger.log(req.params)

        // logger.log(chunkIds)
        const segment = await buildSegmentFromRecOffsets(req.params.chunkIds, req);

        if (segment) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4'
            });
            res.end(segment);
        } else {
            res.sendStatus(503);
        }
    } catch (error) {
        if (error.type === 'clientCancelledRequest') {
            // logger.log('Client canceled request...')
        } else {
            logger.log(error)
            res.status(400);
            res.end('Could not process your request at this time, sorry :(');
        }

    }
});

async function buildSegmentFromRecOffsets(recOffsetStr, req) {
    let cancelRequest = false;

    req.once('close', (err) => {
        cancelRequest = true;
    });

    // wait 20ms for a cancel before proceeding
    await new Promise(resolve => setTimeout(resolve, 30));
    if (cancelRequest) {
        throw {
            type: 'clientCancelledRequest'
        }
    }


    const recVals = [];
    for (const recStr of recOffsetStr.split('-')) {
        const vals = recStr.split('+');
        recVals.push({
            id: vals[0],
            startOffset: parseInt(vals[1]),
            size: parseInt(vals[2])
        })
    }

    if (!recVals.length) {
        return;
    }

    const Op = Sequelize.Op;
    const recs = await db.models.Recording.findAll({
        where: {
            id: {
                [Op.in]: recVals.map(item => item.id)
            }
        },
        include: [db.models.StorageDevice]
    });

    let segment;
    // logger.log(chunks)
    // logger.log(camVaultPath)

    // let expectedSize = 0;
    for (const recording of recs) {
        if (cancelRequest) {
            throw {
                type: 'clientCancelledRequest'
            }
        }

        const recVal = recVals.find(item => item.id === recording.id.toString());
        // console.log(recVals)

        // expectedSize += chunk.size;
        const camVaultPath = path.join(recording.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), recording.cameraId, config.get('/vaultFolder'));

        const buf = await readChunk(path.join(camVaultPath, recording.filename), recVal.startOffset, recVal.size);
        if (segment) {
            segment = Buffer.concat([segment, buf]);
        } else {
            segment = buf;
        }
    }

    // logger.log(`Segment size ${segment.length} expected size: ${expectedSize}`);
    return segment;
}

async function buildSegmentFromChunkIds(chunkIdsStr, req) {

    let cancelRequest = false;

    req.once('close', (err) => {
        cancelRequest = true;
    });

    // wait 20ms for a cancel before proceeding
    await new Promise(resolve => setTimeout(resolve, 20));
    if (cancelRequest) {
        throw {
            type: 'clientCancelledRequest'
        }
    }
    const chunkIds = chunkIdsStr.split('+');
    const Op = Sequelize.Op;
    const chunks = await db.models.RecordingChunk.findAll({
        where: {
            id: {
                [Op.in]: chunkIds
            }
        },
        include: [{
            model: db.models.Recording,
            include: [db.models.StorageDevice]
        }]
    });

    let segment;
    // logger.log(chunks)
    // logger.log(camVaultPath)

    // let expectedSize = 0;
    for (const [i, chunk] of chunks.entries()) {
        if (cancelRequest) {
            throw {
                type: 'clientCancelledRequest'
            }
        }
        // expectedSize += chunk.size;
        const camVaultPath = path.join(chunk.recording.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), chunk.recording.cameraId, config.get('/vaultFolder'));

        const buf = await readChunk(path.join(camVaultPath, chunk.recording.filename), chunk.startOffset, chunk.size);
        if (segment) {
            segment = Buffer.concat([segment, buf]);
        } else {
            segment = buf;
        }
    }

    // logger.log(`Segment size ${segment.length} expected size: ${expectedSize}`);
    return segment;
}

async function getRecordingChunks(camId, fromDate, toDate, pageSize, page) {
    const Op = Sequelize.Op;
    return db.models.RecordingChunk.findAll({
        attributes: ['id', 'recordingId', 'duration', 'timestamp'],
        where: {
            [Op.and]: {
                timestamp: {
                    [Op.between]: [fromDate, toDate]
                },
                cameraId: camId
            }
        },
        raw: true,
        limit: pageSize,
        offset: pageSize * page
    });
}

// camId can be camera number or cameraId UUID
historyRoute.get('/:camId/:streamId/:file.m3u8', async (req, res, next) => {
    const now = Date.now();
    const fromDate = new Date(now - 1800000);
    const toDate = new Date(now);
    logger.log(`Getting video from ${fromDate} to ${toDate}`);
    let m3u8 = '';

    try {

        // let recordings = [];
        // let pageSize = 1000;
        // let currentPage = 1;

        // let result = [];
        // do {
        //     await new Promise(resolve => {
        //     setImmediate(async () => {
        //         result = await getRecordingChunks(req.params.camId, fromDate, toDate, pageSize, currentPage);
        //         currentPage += 1;

        //         recordings.push(...result)
        //         return resolve();
        //     });
        // });
        // } while (result.length);


        // const fromDate = Date.now() - 66000000;
        // const toDate = Date.now();

        // const betterdb = db.getBetterDB();
        // const recordings = betterdb.prepare(`SELECT id, recordingId, duration, timestamp FROM recordingchunks
        //                                     WHERE timestamp BETWEEN datetime(?) AND datetime (?)
        //                                     AND cameraId=?`).all(fromDate.toISOString(), toDate.toISOString(), req.params.camId);
        // logger.log(`Found ${recordings.length} chunks between dates`);
        const Op = Sequelize.Op;

        // make sure the camera exists
        const cam = await db.models.Camera.findOne({
            where: {
                [Op.or]: [{
                        id: req.params.camId
                    },
                    {
                        cameraNum: req.params.camId
                    }
                ]
            }
        });

        if (!cam) {
            res.status(400);
            res.end(`Camera number or id '${req.params.camId}' not found, sorry :(`);
            return;
        }



        const chunks = await db.models.RecordingChunk.findAll({
            attributes: ['id', 'recordingId', 'duration', 'timestamp', 'startOffset', 'size'],
            where: {
                timestamp: {
                    [Op.between]: [fromDate, toDate]
                },
                cameraId: cam.id,
            },
            raw: true
        });


        logger.log(`Found chunks: ${chunks.length}`);


        if (!chunks.length) {
            res.sendStatus(400);
            res.end('No video found for the requested time frame');
            return;
        }

        // return res.end(recordings.length.toString());
        // return next();
        // logger.log(recordings[0])
        m3u8 = buildPlayList(chunks);

        if (m3u8) {
            res.setHeader('Access-Control-Allow-Credentials', true);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl'
            });
            res.end(m3u8);
        } else {
            res.sendStatus(503); //todo maybe send 400
        }

        res.status(400);
        res.end(`Requested playlist was not found, sorry :(`);

    } catch (error) {
        logger.log(error)
        res.status(400);
        res.end('Could not process your request at this time, sorry87987 :(', error);
    }

});

function buildPlayList(recordingChunks) {
    // logger.log(recordingChunks)
    let m3u8 = '#EXTM3U\n';

    // target size of each segment to send to player
    const targetDur = 10000;

    m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';
    m3u8 += '#EXT-X-VERSION:7\n';
    // m3u8 += '#EXT-X-ALLOW-CACHE:YES\n';
    m3u8 += `#EXT-X-TARGETDURATION:${targetDur}\n`;
    m3u8 += `#EXT-X-MEDIA-SEQUENCE:0\n`;

    // add initial segment metadata info
    m3u8 += `#EXT-X-MAP:URI="init-${recordingChunks[0].recordingId}.mp4"\n`;


    // global m3u8 list vars
    let segCount = 0;
    let discontCount = 0;

    // current segmnet vars
    const chunksInSeg = [];
    let lastChunk;
    let segDur = 0;
    let hasDiscont = false;
    let currentRecId = -1;
    let size = 0;
    let segFileName = ''; // recId+startOffset+size_recId+startOffset+size_segCount.m4s

    function createSegmentInList() {
        // complete out last segment filename
        segFileName += size;

        if (hasDiscont) {
            m3u8 += `#EXT-X-DISCONTINUITY\n`;
            hasDiscont = false; // reset
        }

        m3u8 += `#EXTINF:${(segDur / 1000).toFixed(6)},\n`;
        m3u8 += `#EXT-X-PROGRAM-DATE-TIME:${new Date(chunksInSeg[0].timestamp).toISOString()}\n`

        //create file string with chunk ids
        // let idStr = '';
        // for (const [i, chunk] of chunksInSeg.entries()) {
        //     idStr = idStr + (i === 0 ? chunk.id : '+' + chunk.id);
        // }

        // add segmenet in the format <Rec id to start>_<chunk index in rec id>_<end rec id>_<chunk index end>
        m3u8 += `${segFileName}_${segCount}.m4s\n`;
        segCount += 1;

        // reset for next segment
        chunksInSeg.length = 0
        segDur = 0;
        segFileName = '';
        size = 0;

        currentRecId = -1;
    }


    function updateFilename(chunk) {
        if (chunk.recordingId !== currentRecId) {
            if (currentRecId !== -1) {
                // other chunks after first
                segFileName += size + '-' + chunk.recordingId + '+' + chunk.startOffset + '+';
            } else {
                // first chunk of this segment
                segFileName = chunk.recordingId + '+' + chunk.startOffset + '+';
            }
            currentRecId = chunk.recordingId;
            size = 0;
        }
        size += chunk.size;
    }

    function processsChunk(chunk, isFinal) {
        if (!chunk) {
            return;
        }

        let timeGap = false;
        // check if this chunk's start time is past the last chunk's duration
        // if so, it is considered a discontuation of time timeline and will need marked as such so the player does not freak out
        if (lastChunk && new Date(chunk.timestamp).getTime() - new Date(lastChunk.timestamp).getTime() > lastChunk.duration) {
            // console.log('discont: ' + (new Date(chunk.timestamp).getTime() - new Date(lastChunk.timestamp).getTime()));
            discontCount++;
            timeGap = true;
        }


        if ((segDur + chunk.duration) < targetDur && !isFinal && !timeGap) {
            segDur += chunk.duration;
            chunksInSeg.push(chunk);
            updateFilename(chunk);
        } else {

            if (isFinal) {
                segDur += chunk.duration;
                chunksInSeg.push(chunk);
                updateFilename(chunk);
                createSegmentInList();
            } else {
                createSegmentInList();
                segDur += chunk.duration;
                chunksInSeg.push(chunk);
                updateFilename(chunk);
            }

            // set discont for next segment
            if (timeGap) {
                hasDiscont = true;
            }
        }

        lastChunk = chunk;

    }


    // go through all the recordings and chunks
    for (const [rIdx, chunk] of recordingChunks.entries()) {
        //logger.log(chunk)
        let isFinal = false;
        if (rIdx === recordingChunks.length - 1) {
            isFinal = true;
        }
        processsChunk(chunk, isFinal);
    }

    m3u8 += `#EXT-X-ENDLIST\n`;


    logger.log(`Segment count: ${segCount} Disconts: ${discontCount}`)

    return m3u8;
}

module.exports = historyRoute;