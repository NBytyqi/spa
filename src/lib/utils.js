const exec = require('child_process').exec;
const mkdirp = require('mkdirp');
const util = require('util');
const fs = require('fs');
const { getSerialNumber, getSerialNumberSync } = require('raspi-serial-number');

const statAsync = util.promisify(fs.stat);
const renameAsync = util.promisify(fs.rename);
const existsSync = fs.existsSync;
let systemSerial;

function toHHMMSS(secs) {
    let seconds = parseInt(secs, 10); // don't forget the second param
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds - (hours * 3600)) / 60);
    seconds = seconds - (hours * 3600) - (minutes * 60);

    if (hours < 10) {
        hours = "0" + hours;
    }
    if (minutes < 10) {
        minutes = "0" + minutes;
    }
    if (seconds < 10) {
        seconds = "0" + seconds;
    }
    var time = hours + ':' + minutes + ':' + seconds;
    return time;
}

function toDDHHMMSS(secs) {
    let seconds = parseInt(secs, 10); // don't forget the second param
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds - (hours * 3600)) / 60);
    let days = Math.floor(hours / 24);
    seconds = seconds - (hours * 3600) - (minutes * 60);
    hours = hours - (days * 24);

    if (hours < 10) {
        hours = "0" + hours;
    }
    if (minutes < 10) {
        minutes = "0" + minutes;
    }
    if (seconds < 10) {
        seconds = "0" + seconds;
    }
    if (days < 10) {
        days = "0" + days;
    }
    var time = days + ':' + hours + ':' + minutes + ':' + seconds;
    return time;
}

function getDDHHMMSSobj(secs) {
    let seconds = parseInt(secs, 10); // don't forget the second param
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds - (hours * 3600)) / 60);
    let days = Math.floor(hours / 24);
    seconds = seconds - (hours * 3600) - (minutes * 60);
    hours = hours - (days * 24);


    return {
        days: days,
        hours: hours,
        mins: minutes,
        seconds: seconds
    }
}

async function execAsync(cmd) {
    // logger.log(cmd); // DEBUG
    return new Promise(function (resolve, reject) {
        exec(cmd, {timeout: 60000}, function (err, stdout, stderr) {
            if (err) {
                // return reject(err);
            }
            if (stderr) {
                return resolve(stderr);
            }
            return resolve(stdout);
        });
    });
}

async function ensurePath(folPath) {
    const existsAsync = util.promisify(fs.exists);
    const mkdirpAsync = util.promisify(mkdirp);
    const exists = await existsAsync(folPath);
    if (!exists) {

        try {
            await mkdirpAsync(folPath);
            // logger.log(`Created path '${folPath}'`);
        } catch (error) {
            // logger.error(error)
            // logger.error(`Could not create path '${folPath}'`);
        }
    } else {
        // logger.log(`Verified path at '${folPath}'`)
    }
}


// use stat to check if file exists
async function existsAsync(filePath) {
    return new Promise((resolve, reject) => {
        fs.stat(filePath, (err, stat) => {
            if (err == null) {
                return resolve(true);
            } else if (err.code === 'ENOENT' || err.code === 'EIO') {
                // file does not exist
                return resolve(false)
            } else {
                return reject(err)
            }
        });
    });
}

async function checkPid(pid) {
    const result = await execAsync(`kill -0 ${pid}`);

    // null result means the process exits
    if (!result) {
        return true;
    }

    // otherwise result will show "kill: (pid) - No such process"
    return false
}

async function killProcess(pid) {
    const result = await execAsync(`kill -9 ${pid}`);

    // null result means the process exits
    if (!result) {
        return true;
    }

    // otherwise result will show "kill: (pid) - No such process"
    return false
}

function bytesToSize(bytes) {
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0) return '0 Byte';
    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1000)));
    return Math.round(bytes / Math.pow(1000, i), 2) + ' ' + sizes[i];
}

function runGC() {
    if (global.gc) {
        global.gc();
    }
}

async function getSerial() {
    if (!systemSerial) {
        systemSerial = await getSerialNumber();
    }

    return systemSerial;
}

module.exports = {
    getDDHHMMSSobj,
    toHHMMSS,
    toDDHHMMSS,
    execAsync,
    ensurePath,
    existsSync,
    existsAsync,
    checkPid,
    killProcess,
    statAsync,
    renameAsync,
    bytesToSize,
    runGC,
    getSerial
}