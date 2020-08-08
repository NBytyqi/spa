const si = require('systeminformation');
const fs = require('fs');

let piInfoCached;

function getPiInfo() {

    if (process.platform !== 'linux') {
        return;
    }

    // use cached value if avaiable.  It doesn't change while running
    if (piInfoCached) {
        return piInfoCached;
    }

    let revision;
    let serial;
    let model;
    let hardware;
    const lines = fs.readFileSync('/proc/cpuinfo').toString().split(/\r?\n/);

    for (const line of lines) {
        // Match a line of the form 'Revision : 0002' while ignoring extra info in front of the revsion (like 1000 when
        // the Pi was over - volted
        if (line.indexOf(':') > -1) {
            const fields = line.split(':');
            switch (fields[0].trim()) {
                case 'Hardware':
                    hardware = fields[1].trim();
                    break;
                case 'Revision':
                    revision = fields[1].trim();
                    break;
                case 'Serial':
                    serial = fields[1].trim();
                    break;
                case 'Model':
                    model = fields[1].trim();
                    break;
                default:
                    break;
            }
        }
    };

    // pi 4 b model string
    // Raspberry Pi 4 Model B Rev 1.1

    piInfoCached = {
        hardware: hardware,
        revision: revision,
        serial: serial,
        model: model
    };



    return piInfoCached
};

module.exports = {
    getPiInfo
}