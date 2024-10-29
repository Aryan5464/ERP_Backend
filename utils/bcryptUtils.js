const bcrypt = require('bcrypt');

// Function to hash a password
const hashPassword = async (password) => {
    try {
        const saltRounds = 10; // You can adjust the salt rounds for more security, but 10 is generally good
        return await bcrypt.hash(password, saltRounds);
    } catch (error) {
        console.error("Error hashing password:", error);
        throw new Error('Error hashing password');
    }
};

// Function to compare a password with a hashed password
const comparePasswords = async (password, hashedPassword) => {
    try {
        return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
        console.error("Error comparing passwords:", error);
        throw new Error('Error comparing passwords');
    }
};

module.exports = {
    hashPassword,
    comparePasswords
};