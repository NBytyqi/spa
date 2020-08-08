const express = require('express');
const videoRoute = express.Router();
const path = require('path');
const fs = require("fs");
const config = require('../../../config/config');
const db = require('../../../lib/db');
const ioServer = require('../socketio/server');
const rec = require('../../../lib/recording');
const logger = require('../../../lib/logging').getLog('webserver', 'video');

let camList = [];

const buf = []
let count = 0;
videoRoute.all('/publishlive/:cameraId', async (req, res, next) => {
    req.on('data', (data) => {
        if (req.params.cameraId === 'b1b8f00a-8c00-4388-9c51-b07d3bb72b5c') {
            buf.push(data);
            count += 1;
        }
        if (count === 5) {
            ioServer.io.emit(`livets:${req.params.cameraId}`, {
                vd: buf,
                ts: Date.now()
            })
            buf.length = 0;
            count = 0;
        }
        data = null; // gc
    });
});


//get live segment
videoRoute.get('/live/:camId/:streamId/init-part.mp4', (req, res) => {
    const camStatus = rec.getStatusByCamId(req.params.camId);

    if (!camStatus) {
        res.status(400);
       return res.end('Camera stream not found!');
    }

    const streamInfo = req.params.streamId === '1' ? camStatus.stream1 : camStatus.stream2;

    try {
        if (streamInfo.fragParser.initialization) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4'
            });
            res.end(streamInfo.fragParser.initialization);
        } else {
            res.sendStatus(503);
        }
    } catch (error) {

    }

});

videoRoute.get('/live/:camId/:streamId/part:id.m4s', (req, res) => {
    try {
        const camStatus = rec.getStatusByCamId(req.params.camId);

        if (!camStatus) {
            res.status(400);
            return res.end('Camera stream not found!');
        }

        const streamInfo = req.params.streamId === '1' ? camStatus.stream1 : camStatus.stream2;
        const segment = streamInfo.fragParser.getHlsSegment(req.params.id);
        if (segment) {
            res.writeHead(200, {
                'Content-Type': 'video/mp4'
            });
            res.end(segment);
        } else {
            res.sendStatus(503);
        }
    } catch (error) {
        res.status(400);
        res.end('Could not process your request at this time, sorry :(');
    }
});


videoRoute.get('/live/:camId/:streamId/:file', async (req, res, next) => {
    if (req.params.file.indexOf('.m3u8') === -1) {
        res.status(400);
        res.end(`Invalid stream name, sorry :(`);
        return;
    }

    try {

        const camStatus = rec.getStatusByCamId(req.params.camId);

        if (!camStatus) {
            res.status(400);
            return res.end('Camera stream not found!');
        }

        const streamInfo = req.params.streamId === '1' ? camStatus.stream1 : camStatus.stream2;
        if (streamInfo.fragParser.m3u8) {
            res.setHeader('Access-Control-Allow-Credentials', true);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl'
            });
            res.end(streamInfo.fragParser.m3u8);
        } else {
            res.sendStatus(503); //todo maybe send 400
        }

        if (req.params.file.indexOf('.m4s') > -1) {
            return;
        }

        res.status(400);
        res.end(`Requested file was not found, sorry :(`);
    } catch (error) {
        logger.error(error)
        res.status(400);
        res.end('Could not process your request at this time, sorry :(');
    }
});

//get vault file
videoRoute.get('/vault/:file', function (req, res) {
    logger.log(req.user);

    const file = req.params.file;
    const vaultPath = path.join(process.cwd(), config.get('/baseFolder'), config.get('/vaultFolder'));
    const finalpath = path.join(vaultPath, file);

    //if this is a temp access token, make sure we are allowed to see this video
    if (req.user.scope && req.user.scope == 'tempaccess' && file != req.user.allowedvideofiles) {
        return res.status(400).send("You are not authorized to view this file");
    } else {
        res.sendfile(finalpath);
    }
});


//get recording list
videoRoute.get('/GetRecordings/:cameraNum/:start?/:end?', async (req, res, next) => {
    const cam = await db.models.Camera.findOne({
        where: {
            cameraNum: req.params.cameraNum
        },
        include: [{
            model: db.models.StorageDevice,
        }]
    });

    const camVaultPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/vaultFolder'));
    const camLivePath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/liveFolder'));
    const snapshotPath = path.join(cam.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), cam.id, config.get('/snapshotFolder'));

    const startDate = req.params.start || new Date();
    const endDate = req.params.end || new Date();

    const recordings = db.models.Recording.findAll({
        where: {
            startDate: req.params.startDate || new Date()
        },
        raw: true
    });

    res.json(recordings)
});

//failed with video js
/*
app.get('/user/:uid/files/!*', function(req, res){
    var uid = req.params.uid,
        path = req.params[0] ? req.params[0] : 'index.html';
    res.sendfile(path, {root: './public'});
});
*/

//send file via stream read, prompts for download in browser
/*router.get('/vault/:file', function(req, res){
    //var uid = req.params.uid,
    //path = req.params[0] ? req.params[0] : 'index.html';
    //res.sendfile(filename);
    // logger.log(req.params);
    var filename = path.join(__dirname, '../../' , 'vault', req.params.file);

     var stat = fs.statSync(filename);

     var fReadStream = fs.createReadStream(filename);
     fReadStream.pipe(res);


});*/

//get file with prompt
/*router.get('/vault/:file', function(req, res){
    var filename = path.join(__dirname, '../../' , 'vault', req.params.file);

    res.download(filename,function(err){
        if(!err){
            logger.log('prompted successfully');
            return;
        }
    });
});*/

//tested not working with video js, but can download 18gb file
videoRoute.get('/download/:file', function (req, res) {
    //var uid = req.params.uid,
    //path = req.params[0] ? req.params[0] : 'index.html';
    //res.sendfile(path, {root: './public'});
    //logger.log(req.params);

    const vaultPath = path.join(process.cwd(), config.get('/baseFolder'), config.get('/vaultFolder'));
    var filename = path.join(vaultPath, req.params.file);

    var stat = fs.statSync(filename);
    res.writeHeader(200, {
        "Content-Length": stat.size,
        "Content-Disposition": "attachment;filename=\"" + req.params.file + "\"",
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked"
    });
    var fReadStream = fs.createReadStream(filename);
    fReadStream.on('data', function (chunk) {
        if (!res.write(chunk)) {
            fReadStream.pause();
        }
    });
    fReadStream.on('end', function () {
        res.end();
    });
    res.on("drain", function () {
        fReadStream.resume();
    });

});

module.exports = videoRoute;