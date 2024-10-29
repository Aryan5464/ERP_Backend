const express = require('express');
const app = express();
const cors = require("cors");
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables
app.use(express.json()); // Middleware to parse JSON
const dbConnect = require('./db/db')
// -------------------------------------------------------------

const superAdminRoute = require('./routes/superAdmin');
const adminRoute = require('./routes/admin')
const TLroutes = require('./routes/teamLeader')
const employeeRoutes = require('./routes/employee');
const seedSuperAdmin = require('./db/seedSuperAdmin');


app.get('/', (req, res) => {
    res.send("You have landed on the test page");
})

app.use('/superAdmin', superAdminRoute);
app.use('/admin', adminRoute);
app.use('/teamLeader', TLroutes);
app.use('/employee', employeeRoutes);

seedSuperAdmin();

app.listen(3000, () => {
    console.log(`Server listening at PORT -> ${3000}`);
})

dbConnect();