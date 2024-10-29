const mongoose = require('mongoose');
const { Schema } = mongoose;

// SuperAdmin Schema
const superAdminSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true }
    // admins: [{ type: Schema.Types.ObjectId, ref: 'Admin' }], // Array of Admins under the SuperAdmin
    // Other relevant fields
}, { timestamps: true });

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// Admin Schema
const adminSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    teamLeaders: [{ type: Schema.Types.ObjectId, ref: 'TeamLeader' }], // Array of TeamLeaders under the Admin
    employees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Array of Employees directly managed by the Admin

}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

const teamLeaderSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: false }, // Added phone number field
    password: { type: String, required: true },
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    employees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Array of Employees under the TeamLeader
    // Other relevant fields
}, { timestamps: true });

const TeamLeader = mongoose.model('TeamLeader', teamLeaderSchema);

// employee Schema 
const employeeSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String }, // Optional phone field
    teamLeaders: [{ type: Schema.Types.ObjectId, ref: 'TeamLeader' }], // Array of TeamLeaders to whom the Employee reports
    // Other relevant fields can be added here
}, { timestamps: true });

const Employee = mongoose.model('Employee', employeeSchema);

// Client Schema
const clientSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    companyAddress: { type: String },
    contactNumber: { type: String },
    teamLeader: { type: Schema.Types.ObjectId, ref: 'TeamLeader' }, // Connected Team Leader
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }], // Tasks assigned by this client
    // Other relevant fields
}, { timestamps: true });

const Client = mongoose.model('Client', clientSchema);


// Task Schema
const taskSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['Active', 'Work in Progress', 'Review', 'Resolved'],
        default: 'Active'
    },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true }, // The client who created the task
    teamLeader: { type: Schema.Types.ObjectId, ref: 'TeamLeader', required: true }, // Team Leader responsible for the task
    assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Employees working on the task
    completedBy: { type: Schema.Types.ObjectId, ref: 'Employee' }, // Optional: Employee who completed the task
    dueDate: { type: Date },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    // Other relevant fields
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);


module.exports = {
    SuperAdmin,
    Admin,
    TeamLeader,
    Employee,
    Client,
    Task
};
