const path = require('path');

let Models = {};

// init models, called from db.js
function load(sequalize) {
    // load the models
    Models.StorageDevice = sequalize.import(path.join(__dirname, 'storagedevice.js'));
    Models.Camera = sequalize.import(path.join(__dirname, 'camera.js'));
    Models.Recording = sequalize.import(path.join(__dirname, 'recording.js'));
    Models.Snapshot = sequalize.import(path.join(__dirname, 'snapshot.js'));
    Models.User = sequalize.import(path.join(__dirname, 'user.js'));
    Models.Event = sequalize.import(path.join(__dirname, 'events.js'));
    Models.Permissions = sequalize.import(path.join(__dirname, 'permissions.js'));
    Models.Blacklist = sequalize.import(path.join(__dirname, 'blacklist.js'));
    Models.Gate = sequalize.import(path.join(__dirname, 'gate.js'));

    // setup assoiations
    Models.User.hasMany(Models.Event, { onDelete: 'cascade', hooks: true, foreignKey: { allowNull: true } });
    Models.Event.belongsTo(Models.User, { hooks: true, foreignKey: { allowNull: true } });
    Models.Event.belongsTo(Models.Recording, {  hooks: true, foreignKey: { allowNull: true } });
    Models.Recording.hasOne(Models.Event, { hooks: true, foreignKey: { allowNull: true } });
    Models.Recording.belongsTo(Models.StorageDevice, { hooks: true, foreignKey: { allowNull: true } });
    Models.Event.belongsTo(Models.Snapshot, { hooks: true, foreignKey: { allowNull: true } });
    Models.Event.belongsTo(Models.Camera, { hooks: true, foreignKey: { allowNull: true } });
    Models.Event.belongsTo(Models.Gate, { hooks: true, foreignKey: { allowNull: true } });
    Models.Snapshot.hasOne(Models.Event, { hooks: true, foreignKey: { allowNull: true } });

    Models.Permissions.hasOne(Models.User, { onDelete: 'cascade', hooks: true, foreignKey: { allowNull: true } });
    Models.User.belongsTo(Models.Permissions, {  hooks: true, foreignKey: { allowNull: true } });

    Models.Camera.hasMany(Models.Blacklist, { hooks: true, foreignKey: { allowNull: true } });
    Models.Blacklist.belongsTo(Models.Camera, { hooks: true, foreignKey: { allowNull: true } });
    Models.Camera.belongsTo(Models.StorageDevice, { hooks: true, foreignKey: { allowNull: true } });
    Models.StorageDevice.hasMany(Models.Camera, { hooks: true, foreignKey: { allowNull: true } });

    Models.User.hasMany(Models.Blacklist, { hooks: true, foreignKey: { allowNull: true } });
    Models.Blacklist.belongsTo(Models.User, { hooks: true, foreignKey: { allowNull: true } });
    Models.Blacklist.belongsTo(Models.Gate, { hooks: true, foreignKey: { allowNull: true } });

    Models.Camera.hasMany(Models.Recording, { onDelete: 'cascade', hooks: true, foreignKey: { allowNull: true } });
    Models.Recording.belongsTo(Models.Camera, { hooks: true, foreignKey: { allowNull: true } });

    Models.Snapshot.belongsTo(Models.Camera, { hooks: true, foreignKey: { name: 'cameraId', allowNull: true } });
    Models.Camera.hasMany(Models.Snapshot, { onDelete: 'cascade', hooks: true, foreignKey: { name: 'cameraId', allowNull: true } });

    Models.Snapshot.belongsTo(Models.Recording, { hooks: true, foreignKey: { name: 'recordingId', allowNull: true } });
    Models.Recording.hasMany(Models.Snapshot, { onDelete: 'cascade', hooks: true, foreignKey: { name: 'recordingId', allowNull: true } });

    Models.Camera.hasOne(Models.Gate, { hooks: true, foreignKey: { allowNull: true } });
    Models.Gate.belongsTo(Models.Camera, { hooks: true, foreignKey: { allowNull: true } });

    return Models;
}

module.exports = {
    load,
    Models
}