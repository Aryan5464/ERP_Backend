const mongoose = require('mongoose');
const { Schema } = mongoose;
const crypto = require('crypto');


// Add this function to create a reusable schema mixin
const addPasswordResetFields = (schema) => {
    schema.add({
        resetPasswordToken: String,
        resetPasswordExpires: Date
    });

    schema.methods.createPasswordResetToken = function () {
        const resetToken = crypto.randomBytes(32).toString('hex');
        this.resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        this.resetPasswordExpires = Date.now() + 20 * 60 * 1000; // 20 minutes
        return resetToken;
    };
};


// SuperAdmin Schema
const superAdminSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    companyName: { type: String, required: true }
}, { timestamps: true });
addPasswordResetFields(superAdminSchema);
const SuperAdmin = mongoose.model('SuperAdmin', superAdminSchema);

// Admin Schema
const adminSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    teamLeaders: [{ type: Schema.Types.ObjectId, ref: 'TeamLeader' }]

}, { timestamps: true });

addPasswordResetFields(adminSchema);
const Admin = mongoose.model('Admin', adminSchema);


const teamLeaderSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: false }, // Added phone number field
    password: { type: String, required: true },
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    employees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], // Array of Employees under the TeamLeader
    tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    clients: [{ type: Schema.Types.ObjectId, ref: 'Client' }]
    // Other relevant fields
}, { timestamps: true });

addPasswordResetFields(teamLeaderSchema);
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
addPasswordResetFields(employeeSchema);

const Employee = mongoose.model('Employee', employeeSchema);

// Client Schema
const clientSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    contactNumber: { type: String },
    password: { type: String, required: true },
    companyName: { type: String, required: true },
    corporateAddress: { type: String }, // New field for corporate address
    gstNumber: { type: String }, // GST Number
    panNumber: { type: String }, // PAN field
    cinNumber: { type: String },
    numberOfCompanies: { type: Number }, // Number of companies/firms
    ownerDirectorDetails: [{ // Array to hold details of owners/directors
        name: { type: String, required: true },
        email: { type: String },
        contact: { type: String, required: true }
    }],
    authorizedSignatory: {
        name: { type: String, required: true },
        email: { type: String },
        contact: { type: String, required: true }
    },
    documents: {
        employeeMasterDatabase: { type: String },
        currentSalaryStructure: { type: String },
        previousSalarySheets: { type: String },
        currentHRPolicies: { type: String },
        leaveBalance: { type: String },
        companyLogo: { type: String },
        letterhead: { type: String }
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
addPasswordResetFields(clientSchema);
const Client = mongoose.model('Client', clientSchema);


const requestedTaskSchema = new Schema({
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
        default: null
    }, // Only for frequency-based tasks
    dueDate: { type: Date }, // Only for deadline-based tasks
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: {
        type: String,
        enum: ['Accepted', 'Requested', 'Rejected'],
        default: 'Requested'
    },
    rejectionReason: { type: String }, // Optional
}, { timestamps: true });

const RequestTask = mongoose.model('RequestedTask', requestedTaskSchema);

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
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    assignedTo: {
        userType: { type: String, enum: ['Employee', 'TeamLeader'], required: true },
        userId: { type: Schema.Types.ObjectId, refPath: 'assignedTo.userType' }
    },
    dueDate: { type: Date },
    frequency: {
        type: String,
        default: null
    }, // Only set if this is a frequency-based task
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    parentTaskId: { type: Schema.Types.ObjectId, ref: 'Task' }, // Reference for frequency tasks  
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);


const recurringTaskSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    frequency: {
        type: String,
        required: true
    },
    assignedTo: {
        userType: { type: String, enum: ['Employee', 'TeamLeader'], required: true },
        userId: { type: Schema.Types.ObjectId, refPath: 'assignedTo.userType' }
    },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    active: { type: Boolean, default: true }, // Toggle for recurring tasks
}, { timestamps: true });

const RecurringTask = mongoose.model('RecurringTask', recurringTaskSchema);

const notificationSchema = new Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userType: { type: String, enum: ['Admin', 'TeamLeader', 'Employee', 'Client'], required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['read', 'unread'], default: 'unread' },
    readAt: { type: Date, default: null }, // Added field for storing the timestamp when read
    type: { type: String, enum: ['alert', 'message', 'system'], default: 'message' },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

const messageSchema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'senderType'
    },
    senderType: {
        type: String,
        required: true,
        enum: ['TeamLeader', 'Client']
    },
    receiver: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'receiverType'
    },
    receiverType: {
        type: String,
        required: true,
        enum: ['TeamLeader', 'Client']
    },
    content: { type: String },
    document: {
        fileName: String,
        fileId: String,
        webViewLink: String,
        fileType: String,
        fileSize: Number
    },
    messageType: {
        type: String,
        enum: ['text', 'document'],
        default: 'text'
    },
    read: { type: Boolean, default: false },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);


module.exports = {
    SuperAdmin,
    Admin,
    TeamLeader,
    Employee,
    Client,
    RequestTask,
    Task,
    RecurringTask,
    Notification,
    Message
};