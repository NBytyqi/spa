const SocketIO = require('socket.io');
const logger = require('../../../lib/logging').getLog('webserver', 'socketio');

let io;


function startServer(httpServer) {
    logger.log('Starting local IO Server')
    io = SocketIO(httpServer, {
        pingInterval: 10000,
        pingTimeout: 5000,
        cookie: false
    });

    module.exports.io = io


    io.on('connect', (socket) => {
        logger.log('a user connected');
      });

    // send server timestamp to clients
    setInterval(() => {
        io.sockets.emit('ts', Date.now())
    }, 1000);
}

function stopServer() {
    io.close();
    io.removeAllListners();
}

function getIoServer() {
    return io;
}

module.exports = {
    io,
    startServer,
    stopServer,
    getIoServer
}