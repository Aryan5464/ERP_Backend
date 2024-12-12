const mongoose = require('mongoose');
const { Schema } = mongoose;

// SuperAdmin Schema
const superAdminSchema = new Schema({
    name: { type: String, required: true },
    dp: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true }
}, { timestamps: true });

const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// Admin Schema
const adminSchema = new Schema({
    name: { type: String, required: true },
    dp: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    teamLeaders: [{ type: Schema.Types.ObjectId, ref: 'TeamLeader' }], // Array of TeamLeaders under the Admin
    // employees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Array of Employees directly managed by the Admin

}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

const teamLeaderSchema = new Schema({
    name: { type: String, required: true },
    dp: { type: String },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: false }, // Added phone number field
    password: { type: String, required: true },
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    employees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Array of Employees under the TeamLeader
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    clients: [{type: Schema.Types.ObjectId, ref: 'Client'}]
    // Other relevant fields
}, { timestamps: true });

const TeamLeader = mongoose.model('TeamLeader', teamLeaderSchema);

// employee Schema 
const employeeSchema = new Schema({
    name: { type: String, required: true },
    dp: { type: String },
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
    dp: { type: String },
    email: { type: String, required: true, unique: true },
    contactNumber: { type: String },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    corporateAddress: { type: String }, // New field for corporate address
    gstNumber: { type: String }, // GST Number
    panNumber: { type: String }, // PAN field
    numberOfCompanies: { type: Number }, // Number of companies/firms
    ownerDirectorDetails: [{ // Array to hold details of owners/directors
        name: { type: String, required: true },
        email: {type: String},
        contact: { type: String, required: true }
    }],
    authorizedSignatory: {
        name: { type: String, required: true },
        email: {type: String},
        contact: { type: String, required: true }
    },
    documents: { // Nested structure for document links
        employeeMasterDatabase: { type: String }, // URL or reference to uploaded file
        currentSalaryStructure: { type: String }, // URL or reference to uploaded file
        previousSalarySheets: { type: String }, // URL or reference to uploaded files
        currentHRPolicies: { type: String }, // URL or reference to uploaded file
        leaveBalance: { type: String } // Leave balance data till last month-end
    },
    website: { type: String }, 
    status: {
        type: String,
        enum: ['Accepted', 'Requested', 'Rejected'],
        default: 'Requested'
    },
    teamLeader: { type: Schema.Types.ObjectId, ref: 'TeamLeader' },
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    // complianceInfo: {  // for future
    //     credentials: { type: String }, // Credentials for compliance
    //     applicability: { type: String }, // Applicability details
    //     fyRecord: { type: String } // Record for the current financial year
    // },
}, { timestamps: true });

const Client = mongoose.model('Client', clientSchema);


const requestedTask = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    category: {
        type: String,
        enum: ['Frequency', 'Deadline'],
        default: 'Deadline' 
    },
    frequency: { 
        type: String, 
        enum: ['Every Monday', 'Every Tuesday', 'Every 15th Day of Month', 'Every Saturday'], 
        default: null 
    }, // For frequency-based tasks
    dueDate: { type: Date }, // For deadline-based tasks or initial occurrence for frequency tasks
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: {
        type: String,
        enum: ['Accepted', 'Requested', 'Rejected'],
        default: 'Requested'
    },
    rejectionReason: { type: String }, 
}, { timestamps: true });

const RequestTask = mongoose.model('RequestedTask', requestedTask);

// Task Schema
const taskSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
        type: String,
        enum: ['Active', 'Work in Progress', 'Review', 'Pending', 'Resolved'],
        default: 'Active'
    },
    category: {
        type: String,
        enum: ['Frequency', 'Deadline'],
        default: 'Deadline'
    },
    client: { type: Schema.Types.ObjectId, ref: 'Client' }, // The client who created the task
    teamLeader: { type: Schema.Types.ObjectId, ref: 'TeamLeader'}, // Team Leader responsible for the task
    assignedEmployees: [{
        userType: { type: String, enum: ['Employee', 'TeamLeader']},
        userId: { type: Schema.Types.ObjectId, refPath: 'assignedEmployees.userType' }
    }], // Employees or Team Leaders working on the task
    completedBy: {
        userType: { type: String, enum: ['Employee', 'TeamLeader'] },
        userId: { type: Schema.Types.ObjectId, refPath: 'completedBy.userType' }
    }, // Employee or Team Leader who completed the task
    dueDate: { type: Date },
    frequency: { 
        type: String, 
        enum: ['Every Monday', 'Every Tuesday', 'Every 15th Day of Month', 'Every Saturday'], 
        default: null 
    }, 
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    // Other relevant fields
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);


const notificationSchema = new Schema({
    recipient: { type: Schema.Types.ObjectId, refPath: 'recipientType', required: true }, 
    recipientType: { type: String, enum: ['SuperAdmin', 'Admin', 'TeamLeader', 'Employee', 'Client'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date } // Date when the notification was read (if applicable)
}, { timestamps: true }); // Automatically includes createdAt and updatedAt
const Notification = mongoose.model('Notification', notificationSchema);


module.exports = {
    SuperAdmin,
    Admin,
    TeamLeader,
    Employee,
    Client,
    Task,
    RequestTask,
    Notification
};

 



////////////////////// attributes that can be added to to the Notification Schema
    // actionRequired: { type: Boolean, default: false }, // Indicates if an action is required from the recipient
    // relatedTask: { type: Schema.Types.ObjectId, ref: 'Task' }, // Optional: Reference to the related task
    // relatedClient: { type: Schema.Types.ObjectId, ref: 'Client' }, // Optional: Reference to the related client
    // sender: { type: Schema.Types.ObjectId, refPath: 'senderType' }, // Optional: sender of the notification
    // senderType: { type: String, enum: ['SuperAdmin', 'Admin', 'TeamLeader', 'Employee', 'Client'] }, // Specifies the model for the sender
    // type: { 
    //     type: String, 
    //     enum: ['TaskAssignment', 'TaskUpdate', 'ClientRequest', 'ClientApproval', 'Reminder', 'General'],
    //     required: true 
    // }, // Type of notification