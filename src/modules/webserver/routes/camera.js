const express = require('express');
const app = express.Router();
const path = require('path');
const fs = require("fs");
const config = require('../../../config/config');
const db = require('../../../lib/db');
const ioServer = require('../socketio/server');
const logger = require('../../../lib/logging').getLog('webserver', 'cameras-route');
const onvif = require('../../../lib/onvif');
const Camera = require('../../camera');
const Recording = require('../../../lib/recording');
const Snapshots = require('../../camera/snapshots');
const fileUpload = require('express-fileupload');
const LPR = require('../../../lib/image-processing/lpr');


app.all('/publishlive/:cameraId', async (req, res, next) => {
    req.on('data', (data) => {
        ioServer.io.emit(`livets:${req.params.cameraId}`, data)
    });
});

//check lpr
app.post('/getplatefromimage', fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: {
        fileSize: 50 * 1024 * 1024
    },
}), async function (req, res) {

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    let sampleFile = req.files.img;

    // Use the mv() method to place the file somewhere on your server
    sampleFile.mv('/tmp/test.jpg', async function (err) {
        if (err)
            return res.status(500).send(err);

        const lprResult = await LPR.carmenLPR.detectLicensePlate(null, null, null, null, '/tmp/test.jpg');


        res.send(lprResult.plate);

    });
});

//create
app.post('/', async function (req, res) {

    const data = req.body;

    // users.push(profile);
    const newItem = await db.models.Camera.create(data);



    res.status(200).json(newItem);
});

//get
app.get('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    const item = await db.models.Camera.findOne({
        where: {
            id: id
        },
        include: [db.models.Gate]
    });


    return res.json(item)

});

//get multiple
app.get('/', async function (req, res) {

    try {
        // get this user
        const items = await db.models.Camera.findAll({
            include: [db.models.Gate]
        });


        return res.json(items);
    } catch (error) {
        return res.status(400).json(error);
    }

});

//update
app.put('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Camera.findOne({
        where: {
            id: id
        },
        include: []
    });

    // update user settings here
    item = Object.assign(item, req.body);
    try {
        await item.save();
        await Recording.stopReadingVideoStream(item.id);
        await Snapshots.stopGettingSnapshots(item.id);

        if (item.active) {
            await Recording.startReadingVideoStream(item.id);
            await Snapshots.startGettingSnapshots(item.id);
        }

    } catch (error) {
        console.log(error);
        return error;
    }

    res.status(200).end();
});

//delete
app.delete('/:id', async function (req, res) {

    try {
        const id = req.params.id;
        // get this user
        let item = await db.models.Camera.findOne({
            where: {
                id: id
            },
            include: []
        });

        await Recording.stopReadingVideoStream(item.id);
        await Snapshots.stopGettingSnapshots(item.id);

        // delete item
        await item.destroy();
    } catch (error) {
        logger.error(error);
    }
    res.status(200).end();
});

// scan for onvif cameras
app.get('/services/scanforonvifcameras', async function (req, res) {

    try {
        // get onvif cameras
        const items = await Camera.searchMissingCameras(true); // do not try to login to camera yet, just get that it exists

        return res.json(items);
    } catch (error) {
        return res.status(400).json(error);
    }

});

// install cameras found in onvif search
app.post('/services/installCamerasFromOnvifSearch', async function (req, res) {

    try {
        // get onvif cameras
        const onvifCams = req.body;

        const newCams = await Camera.installCamerasFromOnvifSearch(onvifCams); // do not try to login to camera yet, just get that it exists

        for (const cam of newCams) {
            await Recording.startReadingVideoStream(cam.id);
            await Snapshots.startGettingSnapshots(cam.id);
        }


        return res.json(newCams);
    } catch (error) {
        logger.error(error);
        return res.status(400).json(error);
    }

});


// scan for onvif cameras
app.get('/services/getlatestimage/:id', async function (req, res) {

    try {
        const id = req.params.id;
        // get onvif cameras
        const item = Snapshots.getLatestImage(id)

        return res.json(item);
    } catch (error) {
        return res.status(400).json(error);
    }

});







module.exports = app;