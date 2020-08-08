## Backend

Backend Server for Gate Control


Server will:

1. Startup
2. Scan for new ONVIF cameras
3. Start monitoring cameras for plates
4. if plate is found, send event alert to frontend, start recording video clip and save snapshot of event
5. check blacklist table for plate
6. wait for user to approve/deny plate, with timeout
7. if approved, event is marked approved and complte, gate is triggered open
8. if denied, event is marked denied and complete, gate is not opened


Windows notes:

1. npm install --global --production windows-build-tools
2. cd ..\..\gate_simulation\happytime-multi-onvif-server\ && runme.bat
3. test gstreamer
    - cd /d C:\gstreamer\1.0\x86_64\bin
    - gst-launch-1.0 -v -q rtspsrc location="rtsp://admin:admin@192.168.1.8/test.mp4&t=unicast&p=rtsp&ve=H264&w=640&h=480&ae=PCMU&sr=8000" ! decodebin ! videorate ! video/x-raw,framerate=10/1 ! queue2 max-size-buffers=1 ! jpegenc idct-method=1 ! tcpserversink host=127.0.0.1 port=5551

