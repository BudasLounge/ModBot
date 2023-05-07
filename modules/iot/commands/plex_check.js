module.exports = {
    name: 'plex_check',
    description: 'check for new plex files',
    syntax: 'plex_check [tv/movie]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const Client = require('ssh2').Client;
        const fs = require('fs');

        const sourceHost = '192.168.1.226';
        const sourceUsername = 'Torrenter';
        const sourcePassword = 'Torrenter';
        const sourceFolder = 'C:\\Users\\Torrenter\\Desktop\\New Torrents';

        const destHost = 'dest.host.com';
        const destUsername = 'username';
        const destPassword = 'password';
        const destFolder = '/path/to/dest/folder';

        const sourceClient = new Client();
        sourceClient.on('ready', () => {
        console.log('Connected to source server');
        sourceClient.sftp((err, sftp) => {
            if (err) throw err;
            console.log('SFTP session established on source server');

            const destClient = new Client();
            destClient.on('ready', () => {
            console.log('Connected to destination server');
            destClient.sftp((err, sftpDest) => {
                if (err) throw err;
                console.log('SFTP session established on destination server');

                sftp.readdir(sourceFolder, (err, files) => {
                if (err) throw err;

                files.forEach((file) => {
                    const sourcePath = `${sourceFolder}/${file.filename}`;
                    const destPath = `${destFolder}/${file.filename}`;

                    sftpDest.stat(destPath, (err, stats) => {
                    if (err) {
                        // file does not exist on destination server, so transfer it
                        const readStream = sftp.createReadStream(sourcePath);
                        const writeStream = sftpDest.createWriteStream(destPath);
                        readStream.pipe(writeStream);

                        console.log(`Transferred ${file.filename} to destination server`);
                    } else {
                        console.log(`${file.filename} already exists on destination server`);
                    }
                    });
                });

                sftp.end();
                sftpDest.end();
                destClient.end();
                sourceClient.end();
                });
            });
            });

            destClient.connect({
            host: destHost,
            username: destUsername,
            password: destPassword,
            });
        });
        });

        sourceClient.connect({
        host: sourceHost,
        username: sourceUsername,
        password: sourcePassword,
        });
    }
}