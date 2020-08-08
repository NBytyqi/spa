var express = require('express');
var _ = require('lodash');
const jwtConfig = require('../../../config/jwtconfig');
const rateLimit = require("express-rate-limit");

var app = module.exports = express.Router();
const logger = require('../../../lib/logging').getLog('webserver', 'gates-route');
const db = require('../../../lib/db');
const Modbus = require('../../../lib/modbus');
const PL = require('../../processing-loop');


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
    if (!data) {
        return new Error('No Data Received');
    }

    // users.push(profile);
    try {
        const newItem = await db.models.Gate.create(data);

        Modbus.stopGateCheckTimer();
        await Modbus.startGateCheckTimer();
        res.status(200).json(newItem);
    } catch (error) {
        return new Error('Could not process this request');
    }

});

//get
app.get('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    const item = await db.models.Gate.findOne({
        where: {
            id: id
        },
        include: [db.models.Camera]
    });


    return res.json(item)

});

//get multiple
app.get('/', async function (req, res) {

    // get this user
    const items = await db.models.Gate.findAll({
        include: [db.models.Camera]
    });


    return res.json(items);
});

//update
app.put('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Gate.findOne({
        where: {
            id: id
        },
        include: []
    });

    // update
    item = Object.assign(item, req.body);
    try {
        await item.save();

        Modbus.stopGateCheckTimer();
        await Modbus.startGateCheckTimer();

    } catch (error) {
        console.log(error);
        return error;
    }

    return res.status(200).end();
});

//delete
app.delete('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Gate.findOne({
        where: {
            id: id
        },
        include: []
    });

    // delete
    await item.destroy();

    Modbus.stopGateCheckTimer();
    await Modbus.startGateCheckTimer();

    res.status(200).end();
});

app.get('/control/modbusstatus/:id', async function (req, res) {
    try {


        // get gates
        const gate = await db.models.Gate.findOne({
            where: {
                id: req.params.id
            },
            include: [db.models.Camera]
        });

        if (!gate) {
            return  res.status(400).end('Gate not found')
        }

        const status = Modbus.getStatusByGateId(gate.id);

        //const gateResponse = await Modbus.isGateOpen(gate);
        //const sensorResponse = await Modbus.isSensorActive(gate);
        //let connected = true;

        // if (gateResponse === 'ECONNREFUSED' || sensorResponse === 'ECONNREFUSED') {
        //     connected = false;
        // }
        const result = {
            connected: status ? status.connected : false,
            gateOpen: status ? status.gateOpen : -1,
            sensor: status ? status.sensor : -1
        }


        return res.json(result);
    } catch (error) {
        logger.error(error);
        res.status(400).end();
    }
});

// open a gate
app.get('/control/opengate/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    // users.push(profile);
    try {
        const gateResponse = await Modbus.openGate(gate);
        if (gateResponse === 'ECONNREFUSED') {
            return res.status(400).end();
        }

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }

});

// close gate
app.get('/control/closegate/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        const gateResponse = await Modbus.closeGate(gate);
        if (gateResponse === 'ECONNREFUSED') {
            return res.status(400).end();
        }

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }

});

// sim car on sensor
app.get('/control/simcaron/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        const gateResponse = await Modbus.writeCoilByGate(gate, gate.modbus_read_coiladdress + 20, 1);
        if (gateResponse === 'ECONNREFUSED') {
            return res.status(400).end();
        }

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }

});

// sim car on sensor
app.get('/control/simcaroff/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        const gateResponse = await Modbus.writeCoilByGate(gate, gate.modbus_read_coiladdress + 20, 0);
        if (gateResponse === 'ECONNREFUSED') {
            return res.status(400).end();
        }

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }

});

// approve car
app.get('/control/approve/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        await PL.approve(gate.id, req.user.data.id);

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }
});

// deny car
app.get('/control/deny/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        await PL.deny(gate.id, req.user.data.id);

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }
});

// blacklist car
app.get('/control/denyandblacklist/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        await PL.denyAndBlacklist(gate.id, req.user.data.id);

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }
});

// override blacklist and approve
app.get('/control/override/:id', async function (req, res) {

    const gate = await db.models.Gate.findOne({
        where: {
            id: req.params.id
        },
        include: [db.models.Camera]
    });

    try {
        await PL.override(gate.id, req.user.data.id);

        return res.status(200).end();
    } catch (error) {
        return new Error('Could not process this request');
    }
});

// get all current events
app.get('/control/getcurrentevents', async function (req, res) {

    try {
        const events = PL.getEvents().map(item => item.record);

        return res.status(200).json(events);
    } catch (error) {
        return new Error('Could not process this request');
    }
});

module.exports = app