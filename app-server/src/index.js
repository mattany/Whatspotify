const {Client, LocalAuth} = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const config = require("../../config/config");
const express = require('express');
const axios = require("axios");
const app = express();
console.log(require('dotenv').config());
const {BASE_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI} = process.env;
const authorizeUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=playlist-modify-public playlist-modify-private`;
let authorizationCode;
let refreshToken;
let accessToken;
const auth_token = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`, 'utf-8').toString('base64');

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/login', (req, res) => {
    console.log("redirecting..........")
    res.redirect(authorizeUrl)
});

app.get('/callback', async (req, res) => {
    authorizationCode = req.query?.code;
    console.log("===================================================================")
    console.log(`code: ${authorizationCode}`)
    await updateToken();
    console.log(`token: ${accessToken}`)
    console.log("===================================================================")
    res.send(accessToken);
});

const refreshAccessToken = async () => {
    try {
        const res = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            params: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            },
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${new Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
            },
        });
        accessToken = res.data.access_token;
        console.log(`refreshed access token: ${accessToken}`);
    } catch (e) {
        console.log(`issue refreshing access token: ${e}`);
    }
}

const constructHeaders = (accessToken) => {return {
    headers: {
        Authorization: `Bearer ${accessToken}`
    }
}};

const postPlaylistParams = (trackId, playlistUrl) => {
    return {
        method: 'post',
        url: playlistUrl,
        params: {
            uris: `spotify:track:${trackId}`
        }
    }
}


const addTrackToPlaylist = async (link, playlistUrl) => {
    console.log(`adding ${link} to ${playlistUrl}`);
    const prefix = "https://open.spotify.com/track/";
    await updateToken();
    const { headers } = constructHeaders(accessToken);
    const trackId = link.slice(prefix.length, prefix.length + 22);
    let playlist = null;
    try {
        const res = await axios({...{
                method: 'get',
                url: playlistUrl
            },
            headers});
        playlist = res.data;
        console.log("playlist:", playlist)
    } catch (e) {
        console.error(`Error getting playlist ${e}`);
    }
    const existingTracks = playlist?.items || [];
    const existingTrackIds = existingTracks.map(item => item.track?.href.slice(item.track.href.length - 22));
    if (!existingTrackIds.includes(trackId)) {
        try {
            await axios({...postPlaylistParams(trackId, playlistUrl), headers});
        } catch (e) {
            console.error(`Error posting playlist: ${e}`);
        }
    }
}

const addSongToPlaylist = async (message) => {
    const {name: chatName} = await message.getChat();
    let playlistUrl = config.chatNameToPlayListUrl[chatName];
    console.log(`playlist url: ${playlistUrl}`);
    if (playlistUrl) {
        const {body} = message;
	console.log(`msg: ${JSON.stringify(message)}`);
        const prefix = "https://open.spotify.com/track/";
        const result = body.trim().split(/\s+/);
	console.log(result);
	for (const link of result) {
            if (link?.startsWith(prefix)) {
                await addTrackToPlaylist(link, playlistUrl);
            }
        }
    }
}

async function initWhatsapp () {
    const whatsappClient = new Client({
        authStrategy: new LocalAuth()
    });

    whatsappClient.on('qr', qr => {
        qrcode.generate(qr, {small: true});
    });

    whatsappClient.on('ready', async () => {
        console.log('Client is ready!');
    });

    whatsappClient.on("message_create", addSongToPlaylist);
    console.log("initializing whatsapp client")
    await whatsappClient.initialize();
}

const updateToken = async () => {
    if (!authorizationCode) {
        console.log("Please login at");
        console.log(`${BASE_URL}login`)
        return;
    }
    if (accessToken) {
        await refreshAccessToken();
    } else {
        try{
            const response = await axios({
                method: 'post',
                url: 'https://accounts.spotify.com/api/token',
                params: {
                    grant_type: 'authorization_code',
                    code: authorizationCode,
                    redirect_uri: REDIRECT_URI
                },
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${auth_token}`
                }
            })
            if (response.data.refresh_token) {
                refreshToken = response.data.refresh_token;
            }
            accessToken = response.data.access_token;
        } catch(error){
            console.log(`authorization error: ${error}`);
        }
    }
}

app.listen(8888, (err) => {
    if (err) throw err;
});
// console.log(initWhatsapp)
initWhatsapp();

module.exports = {
    authorizationCode
}
