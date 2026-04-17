const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./autocall.db');

const TARGET_EMAIL = 'abdi@sahabatsakinah.id';
const NEW_PASSWORD = '123456'; 

db.serialize(() => {
    // Hash the password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(NEW_PASSWORD, salt);
    
    console.log(`Resetting password for ${TARGET_EMAIL}...`);
    
    db.run("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, TARGET_EMAIL], function(err) {
        if (err) {
            console.error("Error resetting password:", err);
        } else {
            console.log(`Success! Password for ${TARGET_EMAIL} has been reset.`);
            console.log(`Rows affected: ${this.changes}`);
        }
    });

    // Also double check role
    db.run("UPDATE users SET role = 'admin' WHERE email = ?", [TARGET_EMAIL], function(err) {
         if (!err && this.changes > 0) console.log("Account role ensured as 'admin'.");
    });
});
