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


//get vault file
videoRoute.get('/:recId', async function (req, res) {
    // logger.log(req.user);
    const recId = req.params.recId;
    const rec = await db.models.Recording.findOne({
        where: {
            id: recId
        },
        include: [db.models.StorageDevice]
    });

    const finalpath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.cameraId, config.get('/vaultFolder'), rec.filename);



    res.sendFile(finalpath);
});


//get recording list
videoRoute.get('/list/:cameraNum/:start?/:end?', async (req, res, next) => {
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
videoRoute.get('/download/:recId', async function (req, res) {
    const recId = req.params.recId;
    const rec = await db.models.Recording.findOne({
        where: {
            id: recId
        },
        include: [db.models.StorageDevice]
    });

    const finalpath = path.join(rec.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), rec.cameraId, config.get('/vaultFolder'), rec.filename);


    var stat = fs.statSync(finalpath);
    res.writeHeader(200, {
        "Content-Length": stat.size,
        "Content-Disposition": "attachment;filename=\"" + rec.filename + "\"",
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked"
    });
    var fReadStream = fs.createReadStream(finalpath);
    fReadStream.on('data', function (chunk) {
        if (!res.write(chunk)) {
            //fReadStream.pause();
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