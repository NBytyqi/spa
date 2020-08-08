const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const Sequelize = require('sequelize');
const Models = require('../../models');
const mkdirp = require('mkdirp');
const storage = require('../storage');
const utils = require('../utils');
const logger = require('../logging').getLog('db');

//test better db
let betterdb;

let sequelize;
let models; // ref to models
let optimizeInterval; // interval to run opimize
let DB_TYPE = 'SQLITE'; // MYSQL, or SQLITE

const status = {
    connected: false
}

async function verifyDb() {
    try {
        const primaryDrive = storage.getPrimaryDriveInConfig();
        const dbFolder = path.join(primaryDrive.mountPoint, config.get('/baseFolder'), config.get('/dbFolder'));

        const hasDBFolder = await utils.existsAsync(dbFolder);
        if (!hasDBFolder) {
            mkdirp.sync(dbFolder);
        }

        const dbPath = path.join(dbFolder, config.get('/dbName'));

        if (!fs.existsSync(dbPath)) {
            const db = new sqlite3.Database(dbPath);
            db.close();
            console.log(`Created NEW DB at '${dbPath}'`);

            return {
                dbCreated: true
            };


        } else {
            console.log(`DB located at '${dbPath}'`)
        }

        return {
            dbCreated: false
        };
    } catch (error) {
        console.log('Could not verify db path or file!', error);
    }

}

function dbLogger(query, time) {
    // console.log(`Elapsed Query time: ${time}ms`);
    // console.log(query);

    if (time && time > 300) {
        logger.warn(`Slow Query - ${time}ms - QUERY WAS: ${query}`);
        logger.info(query);
    }

    // if (query.indexOf('update') > -1) {
    //     console.log(query);
    // }

}

// options {clearDB: true}, will wipe db - for testing and debug
async function initalizeDB(options) {
    if (!options.dbType) {
        throw new Error('No dbType specified to initalizeDB!');
    }

    DB_TYPE = options.dbType;

    logger.info('Initilizing DB')
    if (DB_TYPE === 'SQLITE') {
        betterdb = require('better-sqlite3'); // alternate sqlite db engine, may be faster?
        await initalizeSQLite(options);
    }
    if (DB_TYPE === 'MYSQL') {
        await initalizeMySQL(options)
    }
}

async function initalizeMySQL(options) {
    try {
        const dbSetup = require('./setup');
        await dbSetup.SetupDB(options.deleteDB);

        if (!sequelize) {
            sequelize = new Sequelize('gatecontrol', 'gatecontrol', 'q1ps4j29avdx1', {
                host: 'localhost',
                dialect: 'mariadb',
                dialectOptions: {
                    timezone: 'Etc/GMT0'
                },
                pool: {
                    max: 5,
                    min: 1,
                    idle: 10000
                },
                logging: dbLogger,
                benchmark: true,
                acquireTimeout: 10000,
                minDelayValidation: 500,
                connectTimeout: 10000,
                socketTimeout: 0
            });

            status.connected = true;
        }
        // load models
        module.exports.models = Models.load(sequelize);
        models = module.exports.models;

        // try to connect to db
        await sequelize.authenticate();
        logger.log('DB Connection has been established successfully');

        // sync models
        if (options.sync) {
            await updateModels(options && options.clearDB ? true : false, options && options.alter ? true : false);
        }

        //sync hd's in config with DB
        await syncConfigWithDb()


    } catch (error) {
        console.log(error)
        sequelize = null;
        logger.error(`Could not initalize mysql db: `, error);
        throw error;
    }
}

async function initalizeSQLite(options) {
    const verifyResult = await verifyDb(); // create db if it does not exist

    try {
        if (!sequelize) {
            const primaryDrive = storage.getPrimaryDriveInConfig();
            const dbPath = path.join(primaryDrive.mountPoint, config.get('/baseFolder'), config.get('/dbFolder'), config.get('/dbName'));
            betterdb = betterdb(dbPath);
            sequelize = new Sequelize({
                dialect: 'sqlite',
                storage: dbPath,
                logging: dbLogger,
                benchmark: true
            });
            await sequelize.query("PRAGMA journal_mode=WAL;");
            await sequelize.query("PRAGMA wal_checkpoint(TRUNCATE);");
            await sequelize.query("PRAGMA locking_mode=EXCLUSIVE;"); // only 1 connection is possible, but faster access
            await sequelize.query("PRAGMA synchronous = 1;"); // NORMAL sync mode instead of default of FULL.  Faster
            await sequelize.query("PRAGMA threads=2;");
            await sequelize.query("PRAGMA temp_store=MEMORY;");


            // run optimize db every 3 hours while running, this will speed up queries
            if (!optimizeInterval) {
                optimizeInterval = setInterval(async () => {
                    await optimizeDB();
                }, 3 * 60 * 60 * 1000); // 3 hours
            }

            status.connected = true;
        }
        // load models
        module.exports.models = Models.load(sequelize);
        models = module.exports.models;

        // try to connect to db
        await sequelize.authenticate();
        console.log('DB Connection has been established successfully');

        // sync models
        if (options.sync && !verifyResult.dbCreated) {
            await updateModels(options && options.clearDB ? true : false, options && options.alter ? true : false);
        }

        if (verifyResult.dbCreated) {
            // since this is a new DB, make the models
            await updateModels(true, true);
        }

        //sync hd's in config with DB
        await syncConfigWithDb(models)


    } catch (error) {
        console.log(`Could not initalize db: `, error)
    }
}

async function optimizeDB() {
    logger.log('Running DB optimization');
    await sequelize.query("PRAGMA optimize;");
    logger.log('DB optimization complete');
}

async function closeDB(optimise) {
    if (sequelize && status.connected) {
        logger.info('Closing DB');

        if (DB_TYPE === 'SQLITE' && optimise) {
            await optimizeDB();
        }
        await sequelize.close();
    }

    if (optimizeInterval) {
        clearInterval(optimizeInterval);
    }

    status.connected = false;
}

function getDB() {
    return sequelize;
}

async function updateModels(clearDB = false, alter = false) {
    logger.log('Syncing DB Models');
    if (sequelize) {
        await sequelize.query("PRAGMA foreign_keys=OFF;"); // you need to disable foreign keys in to sync correctly in sqlite since there is no alter table

        if (clearDB) {
            logger.log('CLEAR DB was passed - Wiping DB!!!!');
        }

        // await module.exports.models.Camera.sync({force: false, alter: true});
        // await module.exports.models.StorageDevice.sync({force: false, alter: true});

        await sequelize.sync({
            force: clearDB,
            alter: alter
        });

        await sequelize.query("PRAGMA foreign_keys=OFF;"); // you need to disable foreign keys in to sync correctly in sqlite since there is no alter table

        logger.log('DB Sync complete')
    }
}

async function syncConfigWithDb(models) {

    console.log('Syncing storage devices in config with DB');

    if (models) {
        // add missing drives to db


        if (storage.getForceStorage()) {
            const foundSD = await models.StorageDevice.findOne({
                where: {
                    uuid: '123456789'
                }
            });


            if (!foundSD) {
                console.log(`New HD found in config that is not present in DB, adding ${storage.forceStorage.name} to DB`);
                await models.StorageDevice.create(storage.forceStorage); 
            } else {
                console.log(`HD found in DB, ${storage.forceStorage.name}`);
            }


            return;
        }

        const storageDevicesInConfig = storage.getStorageDevicesFromConfig();
        for (const sd of storageDevicesInConfig) {
            const foundSD = await models.StorageDevice.findOne({
                where: {
                    uuid: sd.uuid
                }
            });
            if (!foundSD) {
                console.log(`New HD found in config that is not present in DB, adding ${sd.name} to DB`);
                await models.StorageDevice.create(sd); // add to db
            } else {
                if (foundSD.name !== sd.name) {
                    console.log(`HD path change detected from config, updating DB with new values from ${foundSD.name} to ${sd.name}`);
                    foundSD.update(sd); // make it match the config file
                }

                if (foundSD.active !== sd.active) {
                    console.log(`HD active status changed, updating DB with new values from ${foundSD.active} to ${sd.active}`);
                    foundSD.update(sd); // make it match the config file
                }

            }
        }

        // remove drives from db that are not in config
        const storageDevicesInDB = await models.StorageDevice.findAll();
        for (const sd of storageDevicesInDB) {
            const foundSD = storageDevicesInConfig.find(item => {
                return item.uuid === sd.uuid
            });
            if (!foundSD) {
                console.log(`Removing unused HD from DB that is not found in config, deleteing ${sd.name} from DB`);
                await sd.destroy(); // add to db
            }
        }
    } else {
        console.error('Could not sync storage devices because database was not supplied');
    }

}

function getBetterDB() {
    return betterdb;
}

module.exports = {
    verifyDb,
    initalizeDB,
    getDB,
    closeDB,
    models,
    getBetterDB,
    status
}