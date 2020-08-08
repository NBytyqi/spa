//first ensure the db, and access user exists
const config = require('../../config/config');
const logger = require('../logging').getLog('db', 'setup');
const db = require('mariadb');

//private vars

async function DeleteDB(con) {
    logger.warn(`ForceDeleteDatabase was requested... going to delete DB first`)
    try {
        let result = await con.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = '${config.get('/mysql/MySQLdatabaseName')}'`);
        if (!result[0]) {
            logger.info(`Force delete of DB '${config.get('/mysql/MySQLdatabaseName')}' from server ${config.get('/mysql/MySQLhost')} was seleced but the DB does not exist.. skipping`);
            return;
        } else {
            result = await con.query("DROP DATABASE " + config.get('/mysql/MySQLdatabaseName'));
            logger.info(`Deleted database '${config.get('/mysql/MySQLdatabaseName')}'`);
        }
    } catch (error) {
        logger.error(`Could not delete  DB '${config.get('/mysql/MySQLdatabaseName')}' from server ${config.get('/mysql/MySQLhost')}`);
        throw error;
    }
}

async function CreateNewDB(con) {
    try {
        await con.query("CREATE DATABASE " + config.get('/mysql/MySQLdatabaseName'));
        logger.info(`Database '${config.get('/mysql/MySQLdatabaseName')}' created, OK`);
        await con.query(`GRANT ALL PRIVILEGES ON ${config.get('/mysql/MySQLdatabaseName')}.* To '${config.get('/mysql/MySQLruntimeUsername')}'@'${config.get('/mysql/MySQLhost')}' IDENTIFIED BY '${config.get('/mysql/MySQLruntimeUserPass')}';`);
        logger.info(`Created and set permissions for DB user '${config.get('/mysql/MySQLruntimeUsername')}', OK`);
    } catch (error) {
        if (error.errno === 1007 || error.message == 'database exists') {
            logger.info(`Database '${config.get('/mysql/MySQLdatabaseName')}' already exists, OK`);
        } else {
            logger.error(`Could not create database '${config.get('/mysql/MySQLdatabaseName')}'` + error);
            throw error;
        }
    }
}

async function CreateDB(forceDeleteDatabase) {
    logger.info(`Ensuring DB '${config.get('/mysql/MySQLdatabaseName')}' exists...`);
    try {

        const pool = db.createPool({
            host: config.get('/mysql/MySQLhost'),
            // socketPath: '/run/mysqld/mysqld.sock',
            user: config.get('/mysql/MySQLadminUser'),
            password: config.get('/mysql/MySQLadminPass'),
            port: config.get('/mysql/MySQLport')
        });

        const con = await pool.getConnection();


        logger.info(`Connected to DB server '${config.get('/mysql/MySQLhost')}'`);

        if (forceDeleteDatabase) {
            await DeleteDB(con);
            await CreateNewDB(con);
        } else {
            await CreateNewDB(con);
        }
        logger.info(`Disconnecting from DB server on '${config.get('/mysql/MySQLhost')}'`);
        await con.release();
    } catch (error) {

        logger.error(`Error creating DB on server '${config.get('/mysql/MySQLhost')}'`, error);
        throw error; //bubble error up
    }
}

async function SetupDB(wipeDb = false) {
    logger.info('Setting up MYSQL db');
    await CreateDB(wipeDb);
}

//export functions
module.exports = {
    SetupDB
};