const admin = require('firebase-admin');
const serviceAccount = require('../wdp301-5dae6-firebase-adminsdk-fbsvc-5354dcc356.json');


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
})
module.exports = admin