var express = require('express');
var _ = require('lodash');
const jwtConfig = require('../../../config/jwtconfig');
const rateLimit = require("express-rate-limit");

var app = module.exports = express.Router();
const logger = require('../../../lib/logging').getLog('webserver', 'control-route');
const db = require('../../../lib/db');
const Camera = require('../../camera');
const Modbus = require('../../../lib/modbus');
const Onvif = require('../../../lib/onvif');
const SpaceCheck = require('../../../lib/storage/space-check');

//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 requests per 15min
});

//  apply to all requests
//app.use(limiter);


// start monitoring for lpr events
app.get('/startmonitoring', async function (req, res) {

    await Camera.startMonitorEvents();

    return res.status(200);

});

// stop monitoring for lpr events
app.get('/stopmonitoring', async function (req, res) {

    await Camera.stopMonitorEvents();

    return res.status(200);

});

// open gate
app.get('/opengate/:id', async function (req, res) {

    const item = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    await Modbus.openGate(item)

    return res.status(200);

});

// close gate
app.get('/closegate/:id', async function (req, res) {

    const item = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    await Modbus.closeGate(item)

    return res.status(200);

});

// check gate
app.get('/checkgate/:id', async function (req, res) {

    const item = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    const result = await Modbus.isGateOpen(item)

    return res.json(result);

});

//approve car for entry through gate
app.get('/approve/:eventid', async function (req, res) {

    const event = await db.models.Event.findOne({
        where: {
            id: req.params.eventid
        },
        include: []
    });

    event.status = 'approved';
    event.complete = true;
    await event.save();

    const camera = event.getCamera();

    const gate = camera.getGate();

    Modbus.openGate(gate)
    return res.status(200);

});

//approve car for entry through gate
app.get('/deny/:eventid', async function (req, res) {

    const event = await db.models.Event.findOne({
        where: {
            id: req.params.eventid
        },
        include: [db.models.Camera]
    });

    event.status = 'denied';
    event.complete = true;
    await event.save();

    return res.status(200);

});

//approve car for entry through gate
app.get('/overrideapprove/:eventid', async function (req, res) {

    const event = await db.models.Event.findOne({
        where: {
            id: req.params.eventid
        },
        include: []
    });

    event.status = 'approved';
    event.complete = true;
    event.isOverride = true;
    await event.save();

    const camera = event.getCamera();

    const gate = camera.getGate();

    Modbus.openGate(gate)
    return res.status(200);

});


// search onvif cameras
app.get('/searchonvif', async function (req, res) {

    // get this user
    const items = await Onvif.scanForCameras();


    return res.json(items);
});

// add missing cameras to list
app.get('/searchandadd', async function (req, res) {

    // get this user
    const items = await Camera.searchMissingCameras();


    return res.json(items);
});

// get storage info
app.get('/getstorageinfo', async function (req, res) {

    // get this user
    const items = await SpaceCheck.getStorageInfo(db);


    return res.json(items);
});

module.exports = app