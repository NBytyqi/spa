Use an RTSP producer that supports ANNOUNCE (such as ffmpeg) to send stream to this server for relay:

ffmpeg -i <your_input>.mp4 -c:v copy -f rtsp rtsp://127.0.0.1:5554/stream1

Consume that stream from RTSP Client (note that you have to use the client port, not the publish port):

ffplay -i rtsp://127.0.0.1:6554/stream1