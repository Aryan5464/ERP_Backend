const mongoose = require('mongoose')


const dbConnect = async () => {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log("Connection established with database successfully!");
    } catch (error) {
        console.error("Failed to establish connection with database:", error);
    }
}

module.exports = dbConnect;