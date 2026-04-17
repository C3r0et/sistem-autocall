const Client = require('ssh2-sftp-client');
const sftp = new Client();

async function main() {
  try {
    await sftp.connect({
      host: '10.9.7.95',
      port: 22,
      username: 'ptsss',
      password: 'ptsss1234'
    });
    console.log('Connected to Dankom SFTP!');
    
    // Pwd
    const cwd = await sftp.cwd();
    console.log('Current working directory:', cwd);
    
    // List default path
    const targetPath = './2026/03/27';
    console.log(`Listing ${targetPath}...`);
    const list = await sftp.list(targetPath);
    
    console.log(`Found ${list.length} files. First 10:`);
    for (let i = 0; i < Math.min(10, list.length); i++) {
        console.log(`- ${list[i].name} (Size: ${list[i].size} bytes)`);
    }
    
  } catch (err) {
    console.error('SFTP Error:', err.message);
  } finally {
    sftp.end();
  }
}

main();
