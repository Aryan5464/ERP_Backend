// utils/emailService.js
const axios = require('axios'); // Make sure to install axios: npm install axios

const sendEmail = async (options) => {
    try {
        const response = await axios.post(
            'https://api.brevo.com/v3/smtp/email',
            {
                sender: {
                    name: "MabiconsERP",
                    email: "mabiconserp@gmail.com"
                },
                to: [{
                    email: options.email,
                    name: options.name || options.email
                }],
                subject: options.subject,
                htmlContent: options.htmlContent
            },
            {
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                }
            }
        );

        console.log('Email sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending email:', error.response?.data || error.message);
        throw error;
    }
};

module.exports = sendEmail;