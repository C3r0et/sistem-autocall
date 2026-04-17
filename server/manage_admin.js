const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./autocall.db');

db.serialize(() => {
    console.log("--- Existing Users ---");
    db.all("SELECT id, email, phone, role FROM users", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);

        // If no users, we should create one. 
        // If users exist, we can promote one.
        
        if (rows.length > 0) {
            const userIdToPromote = rows[0].id; // Promote the first user found
            console.log(`\nPromoting User ID ${userIdToPromote} (${rows[0].email || rows[0].phone}) to 'admin'...`);
            
            db.run("UPDATE users SET role = 'admin' WHERE id = ?", [userIdToPromote], (updateErr) => {
                 if (updateErr) console.error(updateErr);
                 else console.log("Success! User is now Admin.");
            });
        } else {
            console.log("\nNo users found. You need to register a user first via the App.");
        }
    });
});

// db.close(); // Keep open for async operations inside, actually serialize handles order but close might happen too early if not careful. 
// Better to simple close in callback or let node exit. 
// For this script, we can just let it finish.
