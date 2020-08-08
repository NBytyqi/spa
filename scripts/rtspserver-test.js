const RtspServer = require('rtsp-streaming-server').default;

const serverConfig = {
    serverPort: 5554,
    clientPort: 8554,
    rtpPortStart: 10000,
    rtpPortCount: 30000,
    // clientServerHooks: {
    //     authentication: authClientHook,
    //     checkMount,
    //     clientClose
    // },
    // publishServerHooks: {
    //     authentication: authServerHook,
    //     checkMount
    // },
};

const server = new RtspServer(serverConfig);


async function start() {
    console.log(`Starting rtsp server`);
    try {
        await server.start();
        console.log(`rtsp server is listing on port ${serverConfig.serverPort}`)
    } catch (e) {
        console.error('Could not start RTSP Server',e);
    }
}

async function authClientHook(username, password) {
    console.log(`Checking user/pass of new client connection`);
    if (username === 'gatecontrol' && password === 'gatecontrol') return true;

    return false;
}

async function authServerHook(username, password) {
    console.log(`Checking user/pass of new publish request`);
    if (username === 'gatecontrol' && password === 'gatecontrol') return true;

    return false;
}

async function checkMount(req) {
    const url = new URL(req.uri);
    return true;
    let result = false;
    console.log(`Checking for valid publish mountpoint of ${url.pathname}`);
    if (url.pathname === '/1/1') {
        result = true;
    }

    // If you want to reject the client side consuming with a specific code, return a number:
    if (url.pathname === 'test') {
        result =  400; //Bad Request
    }

    if (!result) {
        console.log(`valid mountpoint not found`)
    }

    return result;
}

async function clientClose(mount) {
    console.log(`A client has disconnected from ${mount.path}`);
}


start();


module.exports = {
    start
}