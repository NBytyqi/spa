const winston = require('winston');
const rxjs = require('rxjs');
const config = require('../../config/config');
const path = require('path');
const fs = require('fs');
const loggers = require('./loggers');
const storage = require('../storage');
const mkdirp = require('mkdirp');

const onLog = new rxjs.Subject();

const logs = {
    app: null,
    ai: null,
    db: null,
    frontend: null,
    error: null,
    imageProcessor: null,
    storage: null,
    webserver: null,
    onvif: null,
    notifications: null,
    startup: null
}


function initLogging() {
    const colors = {
        trace: 'magenta',
        input: 'grey',
        verbose: 'cyan',
        prompt: 'grey',
        debug: 'blue',
        info: 'green',
        db: 'grey',
        help: 'cyan',
        warn: 'yellow',
        error: 'red'
    };
    winston.addColors(colors);


    // const primaryDrive = storage.getPrimaryDriveInConfig();
    // const logFolder = path.join(primaryDrive.mountPoint, config.get('/baseFolder'), config.get('/logFolder'));
    // const hasLogFolder = fs.existsSync(logFolder);
    // if (!hasLogFolder) {
    //     mkdirp.sync(logFolder);
    // }

    const startupLogFolder = path.join(__dirname, '../../../logs')
    if (!fs.existsSync(startupLogFolder)) {
        mkdirp.sync(startupLogFolder);
    }

    loggers.createLoggers(startupLogFolder);

    // save to the global logger def
    // these are accessed from other parts of the app for direct logging
    logs.app = winston.loggers.get('app');
    logs.error = winston.loggers.get('error');
    logs.db = winston.loggers.get('db');
    logs.frontend = winston.loggers.get('frontend');
    logs.imageProcessor = winston.loggers.get('imageProcessor');
    logs.storage = winston.loggers.get('storage');
    logs.webserver = winston.loggers.get('webserver');
    logs.onvif = winston.loggers.get('onvif');
    logs.notifications = winston.loggers.get('notifications');
    logs.startup = winston.loggers.get('startup');

}

// returns a logging object for the specified type
// if you want to log to a specific log directly, you can use:
// e.g logging.logs.db('optional section name', 'This is a log message!');
function getLog(logName, section = null) {

    // create log file by logName if it does not exist
    // if (!logs[logName]) {
    //     const primaryDrive = storage.getPrimaryDriveInConfig();
    //     const logFolder = path.join(primaryDrive.mountPoint, config.get('/baseFolder'), config.get('/logFolder'));
    //     const hasLogFolder = fs.existsSync(logFolder);
    //     if (!hasLogFolder) {
    //         mkdirp.sync(logFolder);
    //     }

    //     logs[logName] = loggers.createLogger(logName, logFolder, true);
    // }

    return {
        log: (...argsList) => logItem(logName, 'info', section, ...argsList),
        trace: (...argsList) => logItem(logName, 'trace', section, ...argsList),
        debug: (...argsList) => logItem(logName, 'debug', section, ...argsList),
        info: (...argsList) => logItem(logName, 'info', section, ...argsList),
        warn: (...argsList) => logItem(logName, 'warn', section, ...argsList),
        error: (...argsList) => logItem(logName, 'error', section, ...argsList),
    }

}

function logItem(logName, level, subSection, ...argList) {
    let message = argList.length ? argList[0] : '';
    const args = argList.length > 1 ? argList.slice(1) : [];
    // try to convert any objects to strings for printing in the logs
    // otherwise you will only see [Object object], instead of what it is
    if (args.length) {
        message += ` \n:: Extra Info :: \n[\n`
        for (const [i, m] of args.entries()) {
            if (i > 0) {
                message += ', \n'
            }

            try {
                message += JSON.stringify(m);
            } catch (error) {

            }

        }
        message += `\n]`
    }

    try {
        logs[logName].log(level, message, {
            label: logName + (subSection ? ':' + subSection : '')
        });
    } catch (error) {

    }


    // copy errors to the error only log
    if (logName !== 'error' && level === 'error') {
        logs.error.log('error', message, {
            label: logName + (subSection ? ':' + subSection : '')
        });
    }

    onLog.next({
        time: new Date(),
        subSection: subSection,
        level: level,
        value: message
    });
}


// function frontendLog(log) {
//     if (!log) {
//         return;
//     }
//     switch (log.targetLog) {
//         case 'schedule':
//             feScheduleLog.log(log.level, ...log.message);
//             break;
//         case 'player':
//             fePlayerLog.log(log.level, ...log.message);
//             break;
//         case 'general':
//             feGeneralLog.log(log.level, ...log.message);
//             break;
//         case 'error':
//             feErrorLog.log(log.level, ...log.message);
//             errorLog.error(log.message);
//             break;

//         default:
//             feGeneralLog.log(log.level, ...log.message);
//             break;
//     }

//     // regardless of what th target was, write all errors to the error log
//     if (log.level === 'error') {
//         feErrorLog.error(log.message);
//     }


// }



module.exports = {
    getLog,
    onLog,
    initLogging
};