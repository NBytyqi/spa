const jwtConfig = require('../../../config/jwtconfig');
const jwt = require('jsonwebtoken');
const express = require('express');
const app = express.Router();
const _ = require('lodash');
const rateLimit = require("express-rate-limit");
const logger = require('../../../lib/logging').getLog('webserver', 'auth');
const db = require('../../../lib/db');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per 15min
    skipSuccessfulRequests: true
});

//  apply to all requests
//app.use(limiter);


function createToken(user, expTime) {

    const claims = {
        id: user.id,
        scope: user.scope,
        access: user.access,
        permissions: user.permissions
    }

    var exp = expTime || (157680000); //5 years

    var obj = _.omit(claims, 'password'); //make sure claims contains no password filed by mistake

    var token = jwt.sign({
        data: obj
    }, jwtConfig.secret, {
        expiresIn: exp
    });


    return token;
}

//create token
app.post('/login', limiter, async function (req, res) {

    try {

        if (!req.body.email || !req.body.password) {
            return res.status(400).send("You must send the username and the password");
        }

        //lookup user in db
        // look for existing user
        const user = await db.models.User.findOne({
            where: {
                email: req.body.email
            },
            include: [db.models.Permissions]
        });

        if (!user) {
            return res.status(401).send("Invalid username or password");
        }

        //check password
        if (user.password !== req.body.password) {
            return res.status(401).send("Invalid username or password");
        }

        var token = createToken(user);

        // logger.log(token);
        //var decoded = jwt.decode(token, config.secret);

        // logger.log(decoded);

        res.status(200).send({
            token: token,
            user: _.omit(user.toJSON(), 'passsword')
        });
    } catch (error) {
        res.status(400).send({
            error: 'Bad request'
        });
    }
});

module.exports = app;