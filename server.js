const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock;

// Function to connect to WhatsApp
async function connectToWhatsApp() {
    // Initialize auth state with multi-file storage (for persisting session across restarts)
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_multi');

    sock = makeWASocket({
        auth: state,  // Use the authentication state
        printQRInTerminal: true,  // Show the QR code for scanning
    });

    // Save authentication credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates (e.g., reconnecting, closing)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Show the QR code in the terminal when it's generated
        if (qr) {
            qrcode.generate(qr, { small: true });  // Display the QR code in the terminal
        }


        // Handle connection closed
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error instanceof Boom && 
                lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection is open');
        }
    });

    
}

// Connect to WhatsApp when the application starts
connectToWhatsApp();

// API route to check if a phone number is registered on WhatsApp
app.post('/check-number', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        const result = await sock.onWhatsApp(`${phoneNumber}@s.whatsapp.net`);
        if (result.length > 0 && result[0].exists) {
            return res.json({ isRegistered: true });
        } else {
            return res.json({ isRegistered: false });
        }
    } catch (error) {
        console.error('Error checking WhatsApp number:', error);
        return res.status(500).json({ error: 'Error checking number' });
    }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
