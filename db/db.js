const mongoose = require('mongoose')


const dbConnect = async () => {
    try {
        await mongoose.connect('mongodb+srv://updatingaryan:aryan%40123@erpcluster.ceald.mongodb.net/MabiconERP?retryWrites=true&w=majority&appName=ErpCluster');
        console.log("Connection established with database successfully!");
    } catch (error) {
        console.error("Failed to establish connection with database:", error);
    }
}

module.exports = dbConnect;