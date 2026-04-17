const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./autocall.db');

db.serialize(() => {
    // 1. Check existing users
    db.all("SELECT id, email, phone, role FROM users", (err, rows) => {
        if (err) { console.error("Error reading users:", err); return; }
        
        console.log("--- Current Users ---");
        console.table(rows);

        if (rows.length > 0) {
            const user = rows[0];
            const userId = user.id;
            console.log(`\nPromoting User ID ${userId} (${user.email}) to 'admin'...`);
            
            db.run("UPDATE users SET role = 'admin' WHERE id = ?", [userId], function(err) {
                if (err) { console.error("Update failed:", err); }
                else {
                    console.log(`Update successful. Modified ${this.changes} row(s).`);
                    
                    // Verify
                    db.get("SELECT id, email, role FROM users WHERE id = ?", [userId], (err, row) => {
                        console.log("--- Verified User ---");
                        console.log(row);
                    });
                }
            });
        } else {
            console.log("No users found to promote.");
        }
    });
});
