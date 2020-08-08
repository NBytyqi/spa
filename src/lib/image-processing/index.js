const pipeline = require('./pipeline');
const ss = require('./save-snapshot');
const LPR = require('./lpr');

module.exports = {
    addToProcessQueue: pipeline.addToProcessQueue,
    imageProcessedSubject: pipeline.imageProcessedSubject,
    saveSanpshot: ss.saveSnapshot,
    startFrameCounter: pipeline.startFrameCounter,
    stopFrameCounter: pipeline.stopFrameCounter,
    status : {
        fps: pipeline.status.processesPerSecond
    },
    LPR: LPR
}