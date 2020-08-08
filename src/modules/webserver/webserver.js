const compression = require('compression')
const compressible = require('compressible');
const express = require('express');
const path = require('path');
const jwt = require('express-jwt');
const jwtConfig = require('../../config/jwtconfig');
const config = require('../../config/config');
const io = require('./socketio/server');
const cors = require('cors');
const logger = require('../../lib/logging').getLog('webserver');
const bodyParser = require('body-parser');
const FirstUser = require('./firstuser');

// middleware
const responseTime = require('response-time')

// load routes
const authRoute = require('./routes/auth');
const videoRoute = require('./routes/video');
const cameraRoute = require('./routes/camera');
const historyRoute = require('./routes/history');
const usersRoute = require('./routes/users');
const gateRoute = require('./routes/gates');
const eventsRoute = require('./routes/events');
const blacklistRoute = require('./routes/blacklist');
const controlRoute = require('./routes/control');
const settingsRoute = require('./routes/settings');
const liveRoute = require('./routes/live');
const permissionsRoute = require('./routes/permissions');
const pdfgenerator = require('./routes/pdfgenerator')

let webServer; // webserver ref

function shouldCompress(req, res) {
    if (req.headers['x-no-compression']) {
        // don't compress responses with this request header
        return false;
    }

    var contentType = res.get('Content-Type');
    if (compressible(contentType) || contentType == 'application/vnd.apple.mpegurl') {
        //  logger.info("Compressing response type: " + contentType);
        return true;
    } else {
        // logger.info("NOT compressing type: " + contentType);
    }

    // fallback to standard filter function
    return compression.filter(req, res);
}

const isRevokedCallback = function (req, payload, done) {
    const issuer = payload.iss;
    const tokenId = payload.jti;

    payload.getRevokedToken(issuer, tokenId, function (err, token) {
        if (err) {
            return done(err);
        }
        //check revocation here...
        const valid = true;
        return done(null, valid);
    });
};

// setup function to check for jwt
const jwtCheck = jwt({
    secret: jwtConfig.secret,
    credentialsRequired: true,
    //isRevoked: isRevokedCallback,
    getToken: function fromHeaderOrQuerystring(req) {
        if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
            return req.headers.authorization.split(' ')[1];
        } else if (req.query && req.query.token) {
            return req.query.token;
        } else if (req.cookies && req.cookies.token) {
            return req.cookies.token;
        }
        return null;
    }
}).unless({path: ['/api/cameras/getplatefromimage']});

function startServer() {
    webServer = express();

    webServer.use(cors());

    //set default compression level to auto - currently level 6, see compression lib for details
    webServer.use(compression({
        filter: shouldCompress,
        level: -1
    }));


    // LOAD API ROUTES
    // create /api/route
    const apiRoute = express.Router();
    // TO DO add jwtCheck to middleware
    apiRoute.use(responseTime(), bodyParser.urlencoded({ extended: true, limit: '5mb' }), bodyParser.json({ extended: true, limit: '5mb' }))
    webServer.use('/api',jwtCheck, apiRoute);

    // add routes to /api/...
    apiRoute.use('/videos', videoRoute);
    videoRoute.use('/history', historyRoute);
    apiRoute.use('/history', historyRoute);


    apiRoute.use('/cameras', cameraRoute);
    cameraRoute.use(liveRoute);
    apiRoute.use('/users', usersRoute);
    apiRoute.use('/gates', gateRoute);
    apiRoute.use('/events', eventsRoute);
    apiRoute.use('/blacklist', blacklistRoute);
    apiRoute.use('/control', controlRoute);
    apiRoute.use('/settings', controlRoute);
    apiRoute.use('/video', videoRoute);
    apiRoute.use('/permissions', permissionsRoute);
    apiRoute.use('/generatepdf',pdfgenerator)


    // auth route does not need a token header, becasue this is where you get one
    webServer.use('/auth', bodyParser.urlencoded({ extended: true }), bodyParser.json({ extended: true }), authRoute); // get web token


    // DEFAULT ROUTE
    webServer.use(compression(), express.static(path.join(__dirname, '../../../../Frontend/dist')));
    webServer.get('*', (req, res) => {
        logger.info(`Route '${req.path}' not found, sending to client side app /index.html`);
        res.sendFile(path.join(__dirname, '../../../../Frontend/dist', '/index.html'));
    });

    // catch 404 and forward to error handler
    webServer.use(function (req, res, next) {
        var err = new Error('404 Not Found');
        err.status = 404;
        next(err);
    });


    // development error handler
    // will print stacktrace
    if (webServer.get('env') === 'development') {
        logger.info("Development mode detected, printing stacktrace for errors");
        webServer.use(function (err, req, res, next) {
            res.status(err.status || 500);
            logger.error(err);
            res.write('error', {
                message: err.message,
                error: err
            });
            res.end();
        });

    } else {
        logger.info("Production Mode");
    }

    // START SERVER
    const httpServer = webServer.listen(config.get('/httpPort'), '0.0.0.0', (err) => {
        if (err) {
            logger.error(`Error starting API Server!`, err)
        } else {
            logger.info(`Gate Control API Server running! access at: http://127.0.0.1:${config.get('/httpPort')}`);
        }

    });

    io.startServer(httpServer);


    // check for admin user
    FirstUser.checkForInitialAdminUser();

}

function stopServer() {
    if (webServer) {
        webServer.close();
    }
}

function getWebServer() {
    return webServer;
}

module.exports = {
    startServer,
    stopServer,
    getWebServer
}