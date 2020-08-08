const Sequelize = require('sequelize');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const rxjs = require('rxjs');
const {
    Transform
} = require('stream');

const logger = require('../logging').getLog('app', 'segmentproc');

class SegmentProcessor extends Transform {

    constructor(options) {
        options.objectMode = true;
        super(options);
        // this.writableObjectMode = true;
        if (options) {
            this._streamInfo = options.streamInfo;
            this._segLength = options.segLength | Number.MAX_SAFE_INTEGER;
            this._filename = options.filename;
            this._timeout = options.timeout | 60000; // default to 10min timeout unless otherwise specified
            this.plate = options.plate; // holder for current plate being recorded
            if (options.writePreBuffer) {
                this._writePreBuffer = true;
            }
        }


        this._writePreBuffer;
        this._writeStream;
        this._currentOffset = 0;
        this._startDate;
        this._duration;
        this._filename;
        this._lastSavedChunkIndex = -1;
        this._curRecInstance = null;

        // status
        this._updating = false;

        // current chunklist for this segment
        this._chunkList = []; // {so: startOffset, eo: endOffset, d: duration, t: timestamp, s: size}

        this.segmentCreatedSubject = new rxjs.Subject();
        this.segmentAppendedSubject = new rxjs.Subject();
        this.segmentCompleteSubject = new rxjs.Subject();
    }

    getRecInstance() {
        return this._curRecInstance;
    }

    /**
     * Required for stream transform.
     * @private
     */
    _transform(chunk, encoding, callback) {
        this._processChunk(chunk, () => {
            callback();
        });
    }

    /**
     * Run cleanup when unpiped.
     * @private
     */

    get currentRecInstance() {
        return this._curRecInstance;
    }

    async _processChunk(newChunk, cb = null) {
        if (this._writeStream) {
            if (Date.now() - this._startDate >= this._segLength && !this._segLength === -1) {
                // close current and create another one
                await this._completeSegment(newChunk);
            } else {
                await this._appendChunk(newChunk);
            }
        } else {
            // create first file
            await this._startNewSegment(newChunk)
        }

        if (cb) {
            cb(); // signal done if cb exists
        }
    }


    async _completeSegment(nextChunk) {
        if (this._writeStream) {

            return new Promise(resolve => {
                this._writeStream.end(async () => {

                    const curSegment = {
                        streamInfo: this._streamInfo,
                        camId: this._streamInfo.fragParser.camId,
                        filename: this._filename,
                        fileSize: this._currentOffset - 1, //including init header
                        chunkList: [...this._chunkList],
                        start: this._startDate,
                        end: this._startDate + this._duration,
                        duration: this._duration,
                        complete: true
                    };

                    try {
                        await this._updateSegmentInDB(this._curRecInstance, curSegment, this._lastSavedChunkIndex);
                    } catch (error) {
                        logger.error('Could not complete segment: ', error)
                    }


                    this.segmentCompleteSubject.next(curSegment);

                    if (nextChunk) {
                        await this._startNewSegment(nextChunk)
                    }
                    resolve();
                });
            });
        }
    }

    async _startNewSegment(newSeg) {
        return new Promise(resolve => {
            // init a new mp4 recording segment
            this._startDate = newSeg.timestamp;
            this._duration = newSeg.duration_ms;
            //this._filename = newSeg.timestamp + '.mp4';
            this._chunkList = [];
            this._writeStream = fs.createWriteStream(path.join(this._streamInfo.camVaultPath, this._filename));

            // write init header for mp4 file
            this._writeStream.write(this._streamInfo.fragParser.initialization, async (err) => {
                this._currentOffset = this._streamInfo.fragParser.initialization.length;

                // check that the stream has not ended since last write!
                // this is async so it could have, and has in testing
                if (this._writeStream) {
                    // write prebuffer if exists
                    if (this._writePreBuffer && this._streamInfo.fragParser.bufferListConcat) {
                        await new Promise(resolve2 => {
                            this._writeStream.write(this._streamInfo.fragParser.bufferListConcat, async (segErr) => {
                                resolve2()
                            });
                        })
                    }

                    //  write moof+mdat chunk
                    this._writeStream.write(newSeg.segment, async (segErr) => {
                        this._chunkList.push({
                            so: this._currentOffset,
                            eo: this._currentOffset + newSeg.segment.length - 1,
                            d: newSeg.duration_ms,
                            t: newSeg.timestamp,
                            s: newSeg.segment.length
                        });
                        this._currentOffset += newSeg.segment.length;
                        this._lastSavedChunkIndex = 0;

                        const curSegment = {
                            streamInfo: this._streamInfo,
                            camId: this._streamInfo.fragParser.camId,
                            filename: this._filename,
                            fileSize: this._currentOffset - 1, // including init header
                            chunkList: [...this._chunkList],
                            start: this._startDate,
                            end: this._startDate + this._duration,
                            duration: this._duration,
                            complete: false
                        };

                        this._curRecInstance = await this._addNewSegmentToDB(curSegment); // add the initial entry to db
                        curSegment.recInstance = this._curRecInstance;

                        this.segmentCreatedSubject.next(curSegment);

                        return resolve();
                    }); // write mp4 moov+mdat chunk

                }
            }); // mp4 init write

        }); // return promise
    }

    async _appendChunk(newSeg) {
        if (this._writeStream) {
            return new Promise(resolve => {
                this._writeStream.write(newSeg.segment, async () => {
                    this._chunkList.push({
                        so: this._currentOffset,
                        eo: this._currentOffset + newSeg.segment.length - 1,
                        d: newSeg.duration_ms,
                        t: newSeg.timestamp,
                        s: newSeg.segment.length
                    });
                    this._currentOffset += newSeg.segment.length;
                    this._duration += newSeg.duration_ms;

                    const curSegment = {
                        streamInfo: this._streamInfo,
                        camId: this._streamInfo.fragParser.camId,
                        filename: this._filename,
                        fileSize: this._currentOffset - 1,
                        chunkList: [...this._chunkList],
                        start: this._startDate,
                        end: this._startDate + this._duration,
                        duration: this._duration,
                        complete: false
                    };

                    try {
                        await this._updateSegmentInDB(this._curRecInstance, curSegment, this._lastSavedChunkIndex); // add the initial entry to db
                        this._lastSavedChunkIndex = this._chunkList.length - 1;

                        // send update in case we want to save sooner than segment interval
                        this.segmentAppendedSubject.next(curSegment);

                        if (curSegment.duration > this.timeout) {
                            this._completeSegment();
                        }
                    } catch (error) {
                        logger.error('Error updating segment: ', error);
                    }


                    return resolve();
                });
            }); // new promise
        }
        return null;
    }

    async _addNewSegmentToDB(recSeg) {
        // ad to db?
        // logger.info(recSeg)
        const cam = recSeg.streamInfo.cam;

        const newSeg = {
            filename: recSeg.filename,
            startDate: recSeg.start,
            endDate: recSeg.end,
            fileSize: recSeg.fileSize,
            duration: recSeg.duration, // use duration calculated by ffmpeg if ffprobe option was
            bitRate: recSeg.bitRate || -1, // if ffprobe is not used we can not determine ACTUAL bitrate, the camera settings show the programed val though
            cameraId: recSeg.camId,
            storagedeviceId: cam.storagedevice.id,
            initSize: this._streamInfo.fragParser.initialization.length,
            completed: false
        }

        //logger.info(`Camera ${cam.cameraNum} - ip: ${cam.IPv4} mac: ${cam.mac} - Adding new ${newSeg.filename} recording to db`);
        const rec = await db.models.Recording.create(newSeg); // add to db


        // const snapRows = await this._linkSnapshotsToRecording(rec);
        // logger.info(`Camera ${cam.cameraNum} - ip: ${cam.IPv4} mac: ${cam.mac} - Linked ${snapRows} snapshots to recording ${rec.filename}`);

        return rec;
    }

    async _updateSegmentInDB(rec, currentSeg, lastProcessedChunkIdx = -1) {
        const cam = currentSeg.streamInfo.cam;

        // update recording entry with latest chunk data
        rec.duration = currentSeg.duration;
        rec.fileSize = currentSeg.fileSize;
        rec.endDate = currentSeg.end;
        rec.complete = currentSeg.complete;
        await rec.save();

        // logger.info(`Camera ${cam.cameraNum} - ip: ${cam.IPv4} mac: ${cam.mac} - Updating ${newSeg.filename} recording in db to reflect new segments`);


        // const snapRows = await this._linkSnapshotsToRecording(rec);
        //logger.info(`Camera ${cam.cameraNum} - ip: ${cam.IPv4} mac: ${cam.mac} - Linked ${snapRows} snapshots to recording ${rec.filename}`);
    }

    async _linkSnapshotsToRecording(recording) {
        // link snapshots to a recording

        // make date range INCLUDE the specified dates
        const startDate = recording.startDate.setMilliseconds(-1);
        const endDate = recording.endDate.setMilliseconds(recording.endDate.getMilliseconds() + 1);

        const Op = Sequelize.Op
        return db.models.Snapshot.update({
            recordingId: recording.id
        }, {
            where: {
                [Op.and]: {
                    timestamp: {
                        [Op.between]: [startDate, endDate]
                    },
                    cameraId: recording.cameraId,
                    recordingId: null
                }

            }
        });
    }

    async _upldateHLSPlaylist() {
        // keep rolling 15min playlists based on wallclock

    }

    _flush(callback) {
        new Promise(async (resolve) => {
            await this.cleanup()
            if(callback) {
                callback();
            }
        });
    }

    async cleanup() {
        logger.info(`Running segment processer cleanup`);
        await this._completeSegment();
        this.segmentCreatedSubject.complete();
        this.segmentAppendedSubject.complete();
        this.segmentCompleteSubject.complete();
        //this.chunkList.length = 0;
        delete this._writeStream;
        delete this._currentOffset;
        delete this._startDate;
        delete this._duration;
        delete this._filename;
        delete this._lastSavedChunkIndex;
        delete this._curRecInstance;
        delete this._chunkList;
        delete this._streamInfo;
    }

    getChunkList() {
        // convert chunklist to more readable form
        const chunks = this._chunkList.map(item => {
            const chunk = {
                startOffset: item.so,
                endOffset: item.eo,
                duration: item.d,
                timestamp: item.t,
                size: item.s
            }
            return chunk;
        });

        return chunks;
    }

}

module.exports = SegmentProcessor