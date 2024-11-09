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
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
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
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
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
    status: {
        type: String,
        enum: ['Accepted', 'Requested', 'Rejected'],
        default: 'Requested'
    },
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
    category: {
        type: String,
        enum: ['Frequency', 'Deadline'],
        default: 'Frequency'
    },
    client: { type: Schema.Types.ObjectId, ref: 'Client' }, // The client who created the task
    teamLeader: { type: Schema.Types.ObjectId, ref: 'TeamLeader', required: true }, // Team Leader responsible for the task
    assignedEmployees: [{
        userType: { type: String, enum: ['Employee', 'TeamLeader'], required: true },
        userId: { type: Schema.Types.ObjectId, required: true, refPath: 'assignedEmployees.userType' }
    }], // Employees or Team Leaders working on the task
    completedBy: {
        userType: { type: String, enum: ['Employee', 'TeamLeader'], required: true },
        userId: { type: Schema.Types.ObjectId, refPath: 'completedBy.userType' }
    }, // Employee or Team Leader who completed the task
    dueDate: { type: Date },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    // Other relevant fields
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);


const requestedTask = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    dueDate: { type: Date, required: true }, // New dueDate field
    status: {
        type: String,
        enum: ['Accepted', 'Requested', 'Rejected'],
        default: 'Requested'
    }
})

const RequestTask = mongoose.model('RequestedTask', requestedTask);

module.exports = {
    SuperAdmin,
    Admin,
    TeamLeader,
    Employee,
    Client,
    Task,
    RequestTask
};