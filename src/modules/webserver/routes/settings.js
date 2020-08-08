var express = require('express');
var _ = require('lodash');
const config = require('../../../config/config');
var jwt = require('jsonwebtoken');
const rateLimit = require("express-rate-limit");

var app = module.exports = express.Router();
const logger = require('../../../lib/logging').getLog('webserver', 'gates-route');
const db = require('../../../lib/db');

//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 requests per 15min
});

//  apply to all requests
//app.use(limiter);



//get
app.get('/', async function (req, res) {

    // get config file
    return res.json(config.get('/'));

});


//update
app.post('/', async function (req, res) {


    // update
    config.push('/', req.body);

    res.status(200);
});

module.exports = app