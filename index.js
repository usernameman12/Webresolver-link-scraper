var {
    Client,
    GatewayIntentBits
} = require('discord.js');
require("dotenv").config();
var proxyAPI = require('./proxyAPI.js');
var WebSocket = require("ws");
var express = require("express");
var axios = require("axios");
var wss = new WebSocket.Server({
    noServer: true
});
// Initialize Discord client
var client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
var canSend = true;
var typeToUrl = {
    rammerhead: "direct2.rammerhead.org",
    rammerheadPremium: "browser.rammerhead.org",
    void: "void.radio.fm",
    falconlink: "falcon.justlearning.net",
    duckhtml: "learnaboutducks.me",
    interstellar: "50.fr.to",
    doge: "doge.slowdns.org",
    emeraldAndPhantom: "phantomgames.xyz",
    astroid: "astroid.gg",
    utopia: "utopia.base.ap-arquitectos.com",
    shadow: "1.shadowshark.ipv64.net",
    selenite: "selenite.cc",
    szvy: "szvy.website",
    seraph: "seraph.imdb.gq",
    space: "space.is-cool.dev",
    artclass: "1.artclass.site",
    astro: "astro.billigerhost.com"
};
var globalProxies = {};
var filters = ["lightspeed", "securly", "none/other"];

// Initialize globalProxies for each filter with independent objects
for (const filter of filters) {
    globalProxies[filter] = {};
    for (const type of Object.keys(typeToUrl)) {
        globalProxies[filter][type] = [];
    }
}

var validTypes = [];
for (const [key, value] of Object.entries(typeToUrl)) {
    validTypes.push(key);
}
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register global slash commands
    try {
        await client.application.commands.set([{
            name: 'getproxies',
            description: 'Fetch a list of proxies',
            options: [{
                    name: 'type',
                    description: 'The type of proxies to fetch',
                    type: 3, // STRING
                    required: true,
                    choices: validTypes.map(type => ({
                        name: type,
                        value: type
                    }))
                },
                {
                    name: 'filter',
                    description: 'The type of filter user has to check for blocked urls',
                    type: 3, // STRING
                    required: true,
                    choices: filters.map(filter => ({
                        name: filter,
                        value: filter
                    }))
                },
                {
                    name: 'count',
                    description: 'Number of proxies to fetch',
                    type: 4, // INTEGER
                    required: true
                }
            ]
        }]);
        console.log('Global slash commands registered.');
    } catch (error) {
        console.log('Failed to register global slash commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    var {
        commandName,
        options,
        user
    } = interaction;

    if (commandName === 'getproxies') {
        var type = options.getString('type');
        var filter = options.getString('filter');
        var count = options.getInteger('count');

        if (!validTypes.includes(type)) {
            return interaction.reply({
                content: `Invalid type. Valid types are: ${validTypes.join(', ')}`,
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `Fetching ${type} proxies...`,
            ephemeral: true
        });
        try {
            var allWebsites = await getProxies(type);
            if (!allWebsites.length) throw new Error("No websites found.");
            await interaction.editReply(`Found ${allWebsites.length} websites. Checking validity...`);
            // Checking validity
            var finalWebsites = [];
            var checkedWebsites = await proxyAPI.checkWebsites(allWebsites);
            for (let i in checkedWebsites) {
                if (!checkedWebsites[i]) {
                    finalWebsites.push(allWebsites[i]);
                }
            }
            if (!checkedWebsites.length) console.log("No valid websites after checks.");
            await interaction.editReply(`Checked ${checkedWebsites.length} websites. ${finalWebsites.length} were unblocked.`);
            var workingUrls = finalWebsites;
            var resultUrls = workingUrls.slice(0, Math.min(count, workingUrls.length));
            if (count > workingUrls.length) {
                await interaction.editReply("Sorry, but your count is greater than max of all proxies. sending all " + workingUrls.length + "...");
            }
            globalProxies[filter][type] = workingUrls;
            await sendProxiesInBatches(user, type, resultUrls);
            await interaction.editReply(`Successfully fetched ${resultUrls.length} proxies. Check your DMs!`);
            update(filter);
        } catch (error) {
            console.log(`Error fetching proxies: ${error.message}`);
            await interaction.editReply({
                content: `An error occurred while fetching proxies: ${error.message}. Please try again later.`,
                ephemeral: true
            });
        }
    }
});
wss.on('connection', (ws) => {
    console.log('WebSocket client connected.');

    function sendMessage(message) {
        var jsonobject = {};
        jsonobject["message"] = message;
        ws.send(JSON.stringify(jsonobject))
    }
    ws.on('message', async (message) => {
        try {
            var {
                type,
                count,
                filter
            } = JSON.parse(message.toString());
            if (!validTypes.includes(type)) {
                ws.send(JSON.stringify({
                    error: `Invalid type. Valid types are: ${validTypes.join(', ')}`
                }));
            } else {
                var allWebsites = await getProxies(type);
                if (!allWebsites.length) throw new Error("No websites found.");
                sendMessage(`Found ${allWebsites.length} websites. Checking validity...`);
                // Checking validity
                var finalWebsites = [];
                var checkedWebsites = await proxyAPI.checkWebsites(allWebsites, filter);
                for (let i in checkedWebsites) {
                    if (!checkedWebsites[i]) {
                        finalWebsites.push(allWebsites[i]);
                    }
                }
                if (!checkedWebsites.length) console.log("No valid websites after checks.");
                sendMessage(`Checked ${checkedWebsites.length} websites. ${finalWebsites.length} were unblocked.`);
                var workingUrls = finalWebsites;
                var resultUrls = workingUrls.slice(0, Math.min(count, workingUrls.length));
                if (count > workingUrls.length) {
                    sendMessage("Sorry, but your count is greater than max of all proxies. sending all " + workingUrls.length + "...");
                }
                globalProxies[filter][type] = workingUrls;
                ws.send(JSON.stringify({
                    type,
                    count: resultUrls.length,
                    proxies: resultUrls
                }));
                update(filter);
                sendMessage(`Successfully fetched ${resultUrls.length} proxies. Have fun!`);
            }
        } catch (error) {
            console.log(`WebSocket error: ${error.message}`);
            ws.send(JSON.stringify({
                error: `An error occurred: ${error.message}`
            }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected.');
    });
});
var app = express();
app.use(express.static('static'));
app.get("/globalProxies", (req, res) => {
    res.json(globalProxies);
});
// Start Express server
var PORT = 8080;
var server = app.listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`);
});

// Attach WebSocket server to Express server
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

client.login(process.env.bottoken);
async function sendProxiesInBatches(user, type, resultUrls) {
    const characterLimit = 1000; // Discord character limit for a single message
    const header = `Here are your ${type} proxies:\n`;
    await user.send(header);
    let currentMessage = "";
    let batch = [];

    for (const url of resultUrls) {
        // Check if adding the next URL exceeds the limit
        if (currentMessage.length + url.length + 1 > characterLimit) {
            // Send the current batch
            await user.send(currentMessage);
            // Reset the message and batch
            currentMessage = '';
            batch = [];
        }
        // Add URL to the current batch
        batch.push(url);
        currentMessage = batch.join('\n');
    }

    // Send any remaining URLs
    if (currentMessage.length > 0) {
        await user.send(currentMessage);
    }
}
async function sendMessageWithWebhook(webhookUrl, content, txtAttachment) {
    if (canSend) {
        canSend = false;
        try {
            // Step 1: Clear existing attachments
            await axios({
                method: "PATCH",
                url: webhookUrl,
                headers: {
                    "Content-Type": "application/json"
                },
                data: {
                    attachments: [], // Clear all files
                },
            });

            // Step 2: Add new file manually
            var boundary = "----WebKitFormBoundary" + Math.random().toString(36).substr(2);
            var fileName = "secret-documents.txt";

            // Build multipart body
            var body =
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
                `Content-Type: text/plain\r\n\r\n` +
                txtAttachment +
                `\r\n--${boundary}\r\n` +
                `Content-Disposition: form-data; name="content"\r\n\r\n` +
                content +
                `\r\n--${boundary}--`;

            // Send the request
            var response = await axios({
                method: "PATCH",
                url: webhookUrl,
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`,
                    "Content-Length": Buffer.byteLength(body),
                },
                data: body,
            });

            if (response.status === 200) {
                console.log("Sent!");
            } else {
                console.log(
                    "Failed to add new file at " +
                    new Date().toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        hour12: true,
                    })
                );
            }
        } catch (error) {
            console.log("Error:", error.message);
        }
        setTimeout(function() {
            canSend = true;
        }, 2000);
    } else{
        await proxyAPI.wait(1000);
        return await sendMessageWithWebhook(webhookUrl, content, txtAttachment);
    }
}
async function getProxies(type) {
    var websites = await proxyAPI.getAllWebsites(typeToUrl[type]);
    if(type == "interstellar") return websites.map(site => site.replace("http://", "https://"));
    return websites;
}

function update(filter) {
    var webhookurl;
    var urls = [];
    for (const [key, value] of Object.entries(globalProxies[filter])) {
        value.forEach(url => {
            urls.push(url);
        })
    }
    if(filter == "lightspeed"){
        webhookurl = process.env.lightspeedwebhook;
    } else if(filter == "securly"){
        webhookurl = process.env.securlywebhook;
    } else{
        webhookurl = process.env.allwebhook;
    }
    sendMessageWithWebhook(
        webhookurl,
        "Here are absolutely all my secret documents as of " +
        new Date().toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour12: true,
        }) +
        ": ",
        urls.join("\n")
    );
}
