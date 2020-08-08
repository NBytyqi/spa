const config = require('./config/config');
const logging = require('./lib/logging');
const figlet = require('figlet');
const packageJson = require('../package');
const cliMenu = require('./modules/cli');
const webServer = require('./modules/webserver/webserver');
const Camera = require('./modules/camera');
const db = require('./lib/db');
// const path = require('path'); // USED FOR TESTING CODE BELOW ONLY, TEST CODE SHOULD BE COMMENTED OUT
const storage = require('./lib/storage');
const utils = require('./lib/utils');
const spaceCheck = require('./lib/storage/space-check');
const exec = require('child_process').exec;
const ip = require('./lib/image-processing');
const rtspServer = require('./lib/rtsp-server');
const Recording = require('./lib/recording');
const Modbus = require('./lib/modbus');
const PL = require('./modules/processing-loop');
const path = require('path');

let logger; // setup for this in main function below

// load config
config.loadConfig();

// show command options, and load overrides passed as args!
const program = cliMenu.showCli();

async function main() {

  // init logger after storage is avaiable
  logging.initLogging();
  logger = logging.getLog('app', 'index'); // get correct logger

  console.log(figlet.textSync('Gate Control')); // display ascii art in console
  logger.info(`Starting Gate Control Server v${packageJson.version}`);


  // setup hd
  const basepath = path.join(config.get('/baseMountingPoint'), config.get('/baseFolder'));
  await utils.ensurePath(basepath);

  if (process.platform == 'linux') {
    storage.setForceStorage(true);
  }
  // check/mount hd's
  // try {
  //   await storage.initalizeStorage();
  // } catch (error) {
  //   if (error.message.indexOf('not connected to the system') > -1) {

  //     await new Promise(resolve => setTimeout(resolve, 5000)); // wait for hd to startup for 5 sec before trying to init again
  //     try {
  //       await storage.initalizeStorage(); // if this fails.. not sure what to do?
  //     } catch (error) {
  //       logger.error(`Storage could not be initalized`);
  //     }

  //   }
  // }

  // kill orphaned video processes start
  await utils.execAsync('pkill ffmpeg -9');
  await utils.execAsync('pkill ffprobe -9');
  await utils.execAsync('pkill gst-launch-1.0 -9');

  // start/create db
  await db.initalizeDB({
    dbType: 'SQLITE',
    sync: true,
    clearDB: false,
    deleteDB: false,
    alter: true
  });


  if (config.internalLPR) {
    ip.startFrameCounter();
  }

  await rtspServer.start();

  // min spans spans 0-14, 15-29, 30-44, 45-59
  // hour spans
  // const minutes = 59;
  // const hours = 23;

  // var m = (((minutes) / 15 | 0) * 15) % 60;
  // var h = ((((minutes / 105)) | 0) + hours) % 24;

  // logger.log(`min: ${m}  hour: ${h}`);
  // process.exit();

  // const cam = await db.models.Camera.findOne({where: {IPv4: '192.168.1.159'}});
  // cam.IPv4 = '192.168.1.177';
  // await cam.save();
  //await recording.getStorageInfo();
  // await camera.installMissingCameras();

  // print some info
  const activeCams = await db.models.Camera.findAll({
    where: {
      active: true
    },
    include: [{
      model: db.models.StorageDevice
    }]
  });
  const inactiveCams = await db.models.Camera.findAll({
    where: {
      active: false
    },
    include: [{
      model: db.models.StorageDevice
    }]
  });
  logger.info(`System has ${activeCams.length} active cameras and ${inactiveCams.length} inactive cameras`);

  // TEST CODE

  // TEST TIMELAPSE
  // const snapshots = require('./modules/snapshots');
  // const nowTime = new Date()
  // const tmago = new Date(nowTime.getTime() - 72000000); // 20 min
  // var hrstart = process.hrtime()
  // await snapshots.createTimeLapse(activeCams[0], tmago, nowTime, 20); // 20sec length
  // const hrend = process.hrtime(hrstart)
  // console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
  // END TEST TIMELAPSE

  // var hrstart = process.hrtime()

  // const hrend = process.hrtime(hrstart)
  // console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
  // END TEST CODE

  // turn off recording flags, because we just started
  for (const cam of [...activeCams, ...inactiveCams]) {
    cam.isRecording = false;
    cam.isStalled = false;
    await cam.save();
  }

  // delete incomplete segments
  // await segmentProcessor.deleteIncompleteSegments();
  // await segmentProcessor.deleteOrphanSegments();
  // await spaceCheck.clearOrphanSnapshots(db);  // this query is VERY slow becuase null values cannot be indexed
  const storageDevices = await db.models.StorageDevice.findAll();
  // await spaceCheck.deleteOrphanCameraFolders(storageDevices, [...activeCams, ...inactiveCams])

  // see if freespace is needed
  await spaceCheck.checkFreeSpace(db);

  // look for new cameras
  if (activeCams.length) {
    // just run without wait
    // Camera.installMissingCameras();
  } else {
    // there are no active cams, might be first run, wait until complete before starting
    // await Camera.installMissingCameras();
  }

  // start monitoring free space
  spaceCheck.startCheckFreeSpaceTimer(db);

  Camera.startMonitorEvents();

  for (const cam of activeCams) {
    Recording.startReadingVideoStream(cam.id);
  }

  Modbus.startGateCheckTimer(); // monitor gates and send alerts


  // start api server
  webServer.startServer();

  PL.startMonitoringEvents(); // listen to and process gate events

};

process.on('unhandledRejection', async (error) => {
  console.log(error)
  logger.error('Unhandled promise rejection occured. Exiting', error);
  // Will print "unhandledRejection err is not defined"
  await cleanupUpBeforeExit();
  process.exit();
});

process.on('beforeExit', async (code) => {
  await db.closeDB(true);
  process.exit();
});

process.on('exit', (code) => {
  db.closeDB(false);
  if (config.rebootOnExit) {
    exec('sudo reboot');
  }
});

process.on('SIGINT', async () => {
  logger.log("Program inturrupted via SIGINT (Probably Ctrl+C), Exiting...");
  await cleanupUpBeforeExit()

  process.exit();
});

async function cleanupUpBeforeExit() {
  logger.info('Cleaning up before exit');
  spaceCheck.stopCheckFreeSpaceTimer();
  Modbus.stopGateCheckTimer();
  config.shutdownSubject.next();
  config.shutdownSubject.complete();
  await db.closeDB(true);
  logger.info('Cleanup complete!');
}

// start app
main();