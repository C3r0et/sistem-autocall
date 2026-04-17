const Client = require('ssh2-sftp-client');

async function streamRecording(number, dateString, req, res) {
    const sftp = new Client();
    try {
        await sftp.connect({
            host: process.env.DANKOM_HOST || '10.9.7.95',
            port: 22,
            username: process.env.DANKOM_USER || 'ptsss',
            password: process.env.DANKOM_PASSWORD || 'ptsss1234',
            readyTimeout: 10000 
        });

        const d = new Date(dateString);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        
        const targetPath = `/recording/monitor/${yyyy}/${mm}/${dd}`;
        let list = [];
        try {
            list = await sftp.list(targetPath);
        } catch (e) {
            console.error(`Directory not found or accessible: ${targetPath}`);
            throw new Error('Recording directory not found');
        }
        
        const safeNumber = number.length > 8 ? number.substring(number.length - 8) : number;
        const matchingFile = list.find(f => f.name.includes(safeNumber) && f.name.endsWith('.wav'));
        
        if (!matchingFile) {
            throw new Error(`Recording for ${number} not found in ${targetPath}`);
        }

        const fullPath = `${targetPath}/${matchingFile.name}`;
        
        // Fetch ke memory buffer (ukurannya kecil, wav PBX = 1MB / 5 menit)
        const audioBuffer = await sftp.get(fullPath);

        // Handle HTML5 Audio tag Range Requests (wajib agar durasi + progress bar jalan di browser)
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : matchingFile.size - 1;
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${matchingFile.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'audio/wav',
            });
            res.end(audioBuffer.slice(start, end + 1));
        } else {
            res.writeHead(200, {
                'Content-Length': matchingFile.size,
                'Content-Type': 'audio/wav',
                'Accept-Ranges': 'bytes',
                'Content-Disposition': `inline; filename="${matchingFile.name}"`
            });
            res.end(audioBuffer);
        }

    } finally {
        sftp.end(); // Akhiri sesi SSH
    }
}

module.exports = { streamRecording };
