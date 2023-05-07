module.exports = {
    name: 'plex_check',
    description: 'check for new plex files',
    syntax: 'plex_check [tv/movie]',
    num_args: 1,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const Client = require('ssh2').Client;
        const scp = require('scp2');
        const path = require('path');
        const fs = require('fs');

        const sourceHost = '192.168.1.226';
        const sourceUsername = 'Torrenter';
        const sourcePassword = 'Torrenter';
        var sourceFolder = 'C:\\Users\\Torrenter\\Desktop\\New Torrents';
        if(args[1] === "tv"){
            sourceFolder = 'C:\\Users\\Torrenter\\Desktop\\New Torrents\\TV';
        }else if(args[1] === "movie"){
            sourceFolder = 'C:\\Users\\Torrenter\\Desktop\\New Torrents\\Movies';
        }

        const destHost = '192.168.1.100';
        const destUsername = 'UbuntuServer';
        const destPassword = 'UbuntuServer';
        var destFolder = '';
        if(args[1] === "tv"){
            destFolder = '/home/UbuntuServer/all_plex/local_plex_2/TV Shows';
        }else if(args[1] === "movie"){
            destFolder = '/home/UbuntuServer/all_plex/local_plex/Movies';
        }

        const conn = new Client();
        conn.on('ready', () => {
        fs.readdir(sourceFolder, (err, files) => {
            if (err) throw err;

            files.forEach((file) => {
            const remoteWindowsFilePath = path.join(sourceFolder, file);
            const remoteLinuxFilePath = path.join(destFolder, file);

            scp.scp({
                host: sourceHost,
                username: sourceUsername,
                password: sourcePassword,
                path: remoteWindowsFilePath,
            }, {
                host: destHost,
                username: destUsername,
                password: destPassword,
                path: remoteLinuxFilePath,
            }, (err) => {
                if (err) throw err;
                console.log(`File transfer complete for ${file}`);
            });
            });
            conn.end();
        });
        }).connect({
            host: sourceHost,
            username: sourceUsername,
            password: sourcePassword,
        });

    }
}


        