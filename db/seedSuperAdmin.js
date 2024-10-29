// superAdminSeeder.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { hashPassword } = require('../utils/bcryptUtils');
const { SuperAdmin } = require('../models/models');

// SuperAdmin details
const superAdminData = {
    name: 'Ashish Tondon',
    email: 'mabicons@gmail.com',
    password: 'mabicons123',
    companyName: 'Mabicons Technosoft Pvt. Ltd.',
};

// Function to seed SuperAdmin
async function seedSuperAdmin() {
    try {
        // Check if a SuperAdmin already exists
        const existingSuperAdmin = await SuperAdmin.findOne({ email: superAdminData.email });

        if (existingSuperAdmin) {
            console.log('SuperAdmin already exists in the database.');
            return;
        }
 
        // Hash the password before saving
        const hashedPassword = await hashPassword(superAdminData.password);

        // Create a new SuperAdmin
        const newSuperAdmin = new SuperAdmin({
            ...superAdminData,
            password: hashedPassword,
        });

        // Save the SuperAdmin to the database
        await newSuperAdmin.save();
        console.log('SuperAdmin seeded successfully.');
    } catch (error) {
        console.error('Error seeding SuperAdmin:', error);
    }
}

// Export the seeding function
module.exports = seedSuperAdmin;
