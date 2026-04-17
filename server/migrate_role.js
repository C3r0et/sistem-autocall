const sqlite3 = require('sqlite3').verbose();
const dbPrice = new sqlite3.Database('./autocall.db');

dbPrice.serialize(() => {
    // Add role column if it doesn't exist
    dbPrice.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('Column role already exists.');
            } else {
                console.error('Error adding column:', err.message);
            }
        } else {
            console.log('Added role column to users table.');
        }
    });

    // Set specific user to admin (optional, for testing)
    // You can change 'admin@example.com' to your target admin email
    // dbPrice.run("UPDATE users SET role = 'admin' WHERE email = 'admin@example.com'");
});

dbPrice.close();
