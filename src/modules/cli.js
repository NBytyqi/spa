const packageJson = require('../../package.json');
const config = require('../config/config');
const program = require('commander');
const _ = require('lodash');

function showCli() {
    program
        .version(packageJson.version)

        .option('-w, --httpPort [PortNumber]', 'Port to start the server on (default: 3001)')
        .option('-s, --no-internalLPR', 'Do not start the LPR server process')
        .parse(process.argv);

    // override saved vals
    // if an override exists, it will be used throughout the app instead of what is saved in config
    // but will not alter the config!
    if (program.httpPort) {
        _.set(config.overrides, 'httpPort', program.httpPort);
    }


    config.internalLPR = program.internalLPR;



    return program;
}

module.exports = {
    showCli
};