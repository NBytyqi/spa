const fs = require('fs');
const mkdirp = require('mkdirp');

const JsonDB = require('node-json-db');
const path = require('path');
const _ = require('lodash');
const rxjs = require('rxjs');

let db;
let mainConfig;
let internalLPR = true;
let shutdownSubject = new rxjs.Subject();
let rebootOnExit = false;

// overrides
const overrides = {
};

const defaultConfig = {
    systemUser: 'ahmed',
    httpPort: 3001,
    baseMountingPoint: 'D:/Freelance/Gate_control/media/sureview', // linux only! where hd's are mounted
    baseFolder: 'gatecontrol', // root folder on storage devices
    cameraBaseFolder: 'cameras',
    vaultFolder: 'video', // vault folder: basefolder/cameraBaseFolder/cameraId/vaultFolder
    liveFolder: 'live', // live video folder: basefolder/cameraBaseFolder/cameraId/liveFolder
    snapshotFolder: 'snapshots', //snapshots: basefolder/cameraBaseFolder/cameraId/snapshotFolder
    dbFolder: 'database', // folder to store db on primary storage drive only
    dbName: 'gatecontrol.db', // db name
    logFolder: 'logs', // where to store logs
    maxContentSizeMB: 1000,
    archiveSegmentTime: 60, // mp4 chunks in seconds
    hlsListSize: 10,
    minFreeRecordingBytes: 100000000000, // no more than 15% of total
    maxRecordingSpaceToUse: 0, // max space to use on drive, set to 0 to use all avaiable
    storageDevices: [],
    lprExe: 'test.exe',
    winGstreamerPath: 'D:\\Freelance\\Gate_control\\gate_dependency\\gstreamer\\1.0\\x86_64\\bin',
    gateOpenTimeAfterApproval: 10000
}

function loadConfig() {
    try {
        const configFolder = path.join(__dirname, '../../config');

        if (!fs.existsSync(configFolder)) {
            mkdirp.sync(configFolder);
        }

        db = new JsonDB.JsonDB(path.join(configFolder, 'config'), true, true, '/');

        mainConfig = db.getData('/');

        if (!Object.keys(mainConfig).length) {
            mainConfig = defaultConfig;
            db.push('/', mainConfig)
        }

        // add any missing keys to config
        for (const key of Object.keys(defaultConfig)) {
            if (!mainConfig[key]) {
                db.push(`/${key}`, defaultConfig[key]); //create missing key in stored config with the default value
            }
        }
    } catch (error) {
        // create default config
        mainConfig = defaultConfig;
        db.push('/', mainConfig)
    }
}

function get(configPath) {
    try {
        // if the key exists in override, use that, else use the saved value
        const correctedPath = configPath.substr(1, configPath.length).split('/').join('.'); // convert path to normal json path
        const overrideVal = _.get(overrides, correctedPath, null);
        return overrideVal ? overrideVal : db.getData(configPath);
    } catch (error) {
        return;
    }
}

function push(configPath, data) {
    db.push(configPath, data, true);
}

function deleteItem(configPath) {
    db.delete(configPath);
}


module.exports = {
    loadConfig,
    get,
    push,
    deleteItem,
    overrides,
    internalLPR,
    shutdownSubject,
    rebootOnExit
}
