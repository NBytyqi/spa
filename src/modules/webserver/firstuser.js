const db = require('../../lib/db');
const logger = require('../../lib/logging').getLog('webserver', 'first-user');
// check for initial admin user
async function checkForInitialAdminUser() {
    // look for existing user
    try {
        const user = await db.models.User.findOne({
            where: {
                access: 'admin'
            },
            include: [db.models.Permissions]
        });

        if (!user) {
            const data = {
                active: true,
                firstname: 'admin',
                lastname: '',
                email: 'admin',
                password: 'admin',
                description: 'Auto installed admin user',
                scope: '',
                access: 'admin'

            }

            const newUser = await db.models.User.create(data);

            await newUser.createPermission();

            const permissions = await newUser.getPermission();


            return newUser;



        }

    } catch (error) {
        logger.error(error);
    }
}

module.exports = {
    checkForInitialAdminUser // run on startup
}
