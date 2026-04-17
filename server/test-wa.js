const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('Starting WhatsApp Client Test...');

try {
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true
        }
    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('CLIENT IS READY!');
        process.exit(0);
    });

    client.on('authenticated', () => {
        console.log('AUTHENTICATED');
    });

    client.on('auth_failure', msg => {
        console.error('AUTHENTICATION FAILURE', msg);
    });

    client.initialize().catch(err => {
        console.error('INITIALIZATION ERROR:', err);
    });

} catch (error) {
    console.error('SETUP ERROR:', error);
}
