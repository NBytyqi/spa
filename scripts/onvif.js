const onvif = require('node-onvif');

console.log('Start the discovery process.');
// Find the ONVIF network cameras.
// It will take about 3 seconds.
onvif.startProbe().then((device_info_list) => {
  console.log(device_info_list.length + ' devices were found.');
  // Show the device name and the URL of the end point.
  device_info_list.forEach((info) => {
    console.log('- ' + info.urn);
    console.log('  - ' + info.name);
    console.log('  - ' + info.xaddrs[0]);
  });
}).catch((error) => {
  console.error(error);
});

const OnvifManager = require('onvif-nvt')
// OnvifManager.connect('localhost/my/proxy/path', null, 'username', 'password') <-- proxy path
OnvifManager.connect('127.0.0.1', 5000, 'Admin', '1234')
  .then(results => {
    let camera = results
    console.log(results)
    // if the camera supports events, the module will already be loaded.
    if (camera.events) {
      camera.events.on('messages', messages => {
        console.log('Messages Received:', messages)
      })

      camera.events.on('messages:error', error => {
        console.error('Messages Error:', error)
      })

      // start a pull event loop using defaults
      camera.events.startPull()

      // call stopPull() to end the event loop
      // camera.events.stopPull()
    }
  })