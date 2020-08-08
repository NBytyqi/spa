const winston = require('winston');
require('winston-daily-rotate-file');
// const format = winston.format;
const fcombine = require('logform/combine');
// const fjson = require('logform/json');
const fprintf = require('logform/printf');
const fprettyPrint = require('logform/pretty-print');
const ftimestamp = require('logform/timestamp');
// const flabel = require('logform/label');
const fcolorize = require('logform/colorize');
const path = require('path');


const maxSize = '25m';
const maxFiles = '30d';

const levels = {
    trace: 9,
    input: 8,
    verbose: 7,
    prompt: 6,
    debug: 5,
    db: 4,
    info: 3,
    help: 2,
    warn: 1,
    error: 0
};

// print format
const logPrintFormat = fprintf(info => {
    if (info) {
        return `${new Date(info.timestamp).toLocaleString()} [${info.label}] ${info.level}: ${info.message}`;
    } else {
        return `${new Date(info.timestamp).toLocaleString()} No no info supplied with log() call`;
    }

});

const consoleTransport = new winston.transports.Console({
    format: fcombine(
        ftimestamp(),
        fcolorize(),
        fprettyPrint(),
        logPrintFormat
    ),
});

function createLoggers(rootPath, outputToConsole = true) {
    const appLog = winston.loggers.add('app', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'app-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const dbLog = winston.loggers.add('db', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [
            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'db-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });


    const imageProcessorLog = winston.loggers.add('imageProcessor', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'imageProcessor-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const frontendLog = winston.loggers.add('frontend', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [
            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'frontend-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    winston.loggers.add('error', {
        level: 'error',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [
            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'error-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const storageLog = winston.loggers.add('storage', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'storage-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const webserverLog = winston.loggers.add('webserver', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'webserver-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const onvifLog = winston.loggers.add('onvif', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'onvif-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const notificationsLog = winston.loggers.add('notifications', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'notifications-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    const startupLog = winston.loggers.add('startup', {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: 'startup-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    if (outputToConsole) {
        appLog.add(consoleTransport);
        dbLog.add(consoleTransport);
        imageProcessorLog.add(consoleTransport)
        storageLog.add(consoleTransport);
        frontendLog.add(consoleTransport);
        webserverLog.add(consoleTransport);
        onvifLog.add(consoleTransport);
        notificationsLog.add(consoleTransport);
        startupLog.add(consoleTransport)
    }

}

function createLogger(logName, rootPath, outputToConsole = true) {
    const newLog = winston.loggers.add(logName, {
        level: 'trace',
        levels: levels,
        format: fcombine(
            ftimestamp(),
            fprettyPrint(),
            // format.align(),
            logPrintFormat
        ),
        transports: [

            new(winston.transports.DailyRotateFile)({
                dirname: path.join(rootPath),
                filename: `${logName}-%DATE%.log`,
                datePattern: 'YYYY-MM-DD',
                zippedArchive: false,
                maxSize: maxSize,
                maxFiles: maxFiles
            })
        ]
    });

    if (outputToConsole) {
        newLog.add(consoleTransport);
    }

    return newLog;

}


module.exports = {
    createLoggers,
    createLogger
}