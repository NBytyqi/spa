
const Sequelize = require('sequelize')
const Op = Sequelize.Op;
module.exports = (sequelize, DataTypes) => {
  class RecordingChunk extends Sequelize.Model {}
  RecordingChunk.init({
    // attributes
    // filename, relativeStart, relativeEnd, startDate, endDate, fileSize, duration, camId
    startOffset: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: false
    },
    endOffset: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    indexes: [
      // Create a unique index
      {
        unique: true,
        fields: ['recordingId', 'timestamp']
      },
      {
        unique: true,
        fields: [{name: 'timestamp', order: 'ASC'}, 'cameraId'] // history search
      }
    ],
    sequelize,
    modelName: 'recordingchunk'
    // options
  });


  return RecordingChunk;
}
