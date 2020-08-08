var express = require('express');
var _ = require('lodash');
const jwtConfig = require('../../../config/jwtconfig');
const rateLimit = require("express-rate-limit");

var app = module.exports = express.Router();
const logger = require('../../../lib/logging').getLog('webserver', 'blacklist-route');
const db = require('../../../lib/db');

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

    data.userId = req.user.data.id;

    // users.push(profile);
    const newItem = await db.models.Blacklist.create(data);

    res.status(200).json(newItem);
});

//get
app.get('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    const item = await db.models.Blacklist.findOne({
        where: {
            id: id
        },
        include: [db.models.User]
    });


    return res.json(item)

});

//get multiple
app.get('/', async function (req, res) {

    // get this user
    const items = await db.models.Blacklist.findAll({
        include: [db.models.User]
    });


    return res.json(items);
});

//update
app.put('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Blacklist.findOne({
        where: {
            id: id
        },
        include: []
    });

    // update
    item = Object.assign(item, req.body);
    await item.save();

    res.status(200).end();
});

//delete
app.delete('/:id', async function (req, res) {

    const id = req.params.id;
    // get this user
    let item = await db.models.Blacklist.findOne({
        where: {
            id: id
        },
        include: []
    });

    // delete
    await item.destroy();

    res.status(200).end();
});

module.exports = app
