var express = require('express');
var _ = require('lodash');
const jwtConfig = require('../../../config/jwtconfig');
const rateLimit = require("express-rate-limit");
const config = require('../../../config/config');
var app = module.exports = express.Router();
const logger = require('../../../lib/logging').getLog('webserver', 'events-route');
const db = require('../../../lib/db');
const fs = require('fs');
const path = require('path');
const util = require('util');

const unlinkAsync = util.promisify(fs.unlink);

//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 requests per 15min
});

//  apply to all requests
//app.use(limiter);


//create
app.post('/', async function (req, res) {

    const data = req.body;

    // users.push(profile);
    const newItem = await db.models.Event.create(data);

    res.status(200).json(newItem);
});

//get
app.get('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    const item = await db.models.Event.findOne({
        where: {
            id: id
        },
        include: [db.models.Camera, db.models.Recording, db.models.Snapshot, db.models.User]
    });


    return res.json(item)

});

//get multiple
app.get('/', async function (req, res) {

    // get this user
    const items = await db.models.Event.findAll({
        order: [
            ['startDate', 'DESC'],
        ],
        include: [db.models.Camera, db.models.Recording, db.models.Snapshot, db.models.User, db.models.Gate]
    });


    return res.json(items);
});

//update
app.put('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Event.findOne({
        where: {
            id: id
        },
        include: [db.models.Camera, db.models.Recording, db.models.Snapshot, db.models.User, db.models.Gate]
    });

    // update
    item = Object.assign(item, req.params);
    await item.save();

    res.status(200).end();
});

//delete
app.delete('/:id', async function (req, res) {
    try {



        const id = req.params.id;
        // get this user
        let item = await db.models.Event.findOne({
            where: {
                id: id
            },
            include: [{
                model: db.models.Recording,
                include: [db.models.StorageDevice]
            }, {
                model: db.models.Camera,
                include: [db.models.StorageDevice]
            }, db.models.Snapshot]
        });

        // delete recording
        if (item.recording) {
            const filePath = path.join(item.recording.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), item.cameraId, config.get('/vaultFolder'), item.recording.filename);
            try {
                await unlinkAsync(filePath);
            } catch (error) {
                //logger.error(`Could not delete ${filePath} (you should never see this!)`, error);

            }
        }


        // delete snapshots
        if (item.snapshot) {
            const snapPath = path.join(item.camera.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), item.cameraId, config.get('/snapshotFolder'), item.snapshot.dayPath, item.snapshot.filename);
            try {
                await unlinkAsync(snapPath);
            } catch (error) {
                logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
            }

            // remove thumbnail file too
            try {
                const snapThumbPath = path.join(item.camera.storagedevice.mountPoint, config.get('/baseFolder'), config.get('/cameraBaseFolder'), item.cameraId, config.get('/snapshotFolder'), item.snapshot.dayPath, item.snapshot.thumbFilename);
                await unlinkAsync(snapThumbPath);
            } catch (error) {
                //TODO report error?? ignore for now
                //logger.error(`Could not delete ${snapPath} (you should never see this!)`, error);
            }
            await item.snapshot.destroy();

        }

        try {
            await item.recording.destroy();
        } catch (error) {

        }


        // delete event
        await item.destroy();

        res.status(200).end();
    } catch (error) {
        logger.error(error);
        res.status(400).end();
    }
});

module.exports = app