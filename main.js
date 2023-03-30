const express = require("express");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const app = express();
const PORT = 80;
const mainDirname = __dirname;
const cacheFilename = "ipCache.json";

// Add url & api key to the .env to config
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
const abuseIpDbAPIKey = process.env.ABUSE_IP_DB_API_KEY;

app.use(abuseIpCheck); // middleware

app.get('/', (req, res) => {
    res.send("Hello World");
})

app.listen(PORT);

async function abuseIpCheck(req, res, next) {

    const ipAddress = req.headers["x-forwarded-for"];
    const method = req.method;
    const endpoint = req.path;

    const url = "https://api.abuseipdb.com/api/v2/check";
    
    next();

    const fetchRes = await fetch(url + "?ipAddress=" + ipAddress, {
        method: "GET",
        headers: {
            Accept: "application/json",
            Key: abuseIpDbAPIKey
        }
    })

    const json = await fetchRes.json();

    const ipCache = getCache(cacheFilename);

    if (ipCache[ipAddress]) {
        ipCache[ipAddress]['count']++;
    }
    else {
        ipCache[ipAddress] = {count: 1};
    }
    writeCache(ipCache, cacheFilename);
    
    if (json['errors']) {
        console.error(json['errors'][0]['status'], json['errors'][0]['detail']);
        return 1;
    }

    json['method'] = method;
    json['endpoint'] = endpoint;
    json['count'] = ipCache[ipAddress]['count'];
    json['count'] = 1;

    sendEmbedIpCheck(json);
}

async function sendEmbedIpCheck(json) {
    const data = json['data'];
    
    let title = "";
    if (json['count'] == 1) { title = `${data['ipAddress']} (has visited __${json['count']}__ time)`} else { title = `${data['ipAddress']} (has visited __${json['count']}__ times)`}

    let lastReportedAt = "";
    if (!data['lastReportedAt']) { lastReportedAt = "null" } else {lastReportedAt = "> <t:" + new Date(data['lastReportedAt']).getTime() / 1000 + ":f>"};

    const embed = {
        title: title,
        description:    `**[LINK](https://www.abuseipdb.com/check/${data['ipAddress']})** \n\n`,

        fields: [
            {
                name: "Method",
                value: `**\`${json['method']}\`**`,
                inline: true
            },
            {
                name: "Path",
                value: `**\`${json['endpoint']}\`**`,
                inline: true
            },
            {
                name: "Confidence of abuse",
                value: `**\`${data['abuseConfidenceScore']}\` %**`
            },
            {
                name: "Total reports",
                value: `> **\`${data['totalReports']}\`** reports by **\`${data['numDistinctUsers']}\`** users`,
                inline: true
            },
            {
                name: "Latest report",
                value: lastReportedAt,
                inline: true
            },
            {
                name: "ISP",
                value: "> " + data['isp']
            },
            {
                name: "Usage type",
                value: "> " + data['usageType']
            },
            {
                name: "Domain name",
                value: "> " + data['domain']
            },
            {
                name: "Country",
                value: "> " + `:flag_${data['countryCode'].toLowerCase()}:`
            },
            {
                name: "Hostnames",
                value: "> " + data['hostnames'].toString() || "0"
            }
        ],

        color: getColor(data['abuseConfidenceScore']),
        thumbnail: {
            url: "https://cdn.discordapp.com/attachments/1024287372881440848/1072521498440503336/abuseipdb-logo.png"
        },
        footer: {
            text: "Source • https://YOUR_WEBSITE_DOMAIN_NAME_HERE"
        }     
    };

    fetch(discordWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({embeds: [embed]})
    })

}

function getColor(score) {
    const colors = { green: "2664261", yellow: "16766720", orange: "16745755", red: "16711937" };
    if (!score) {return colors['green']} else if (score <= 25) {return colors['yellow']} else if (score < 80) {return colors['orange']} else {return colors['red']}
}

function getCache() {
    return JSON.parse(fs.readFileSync(path.join(mainDirname, cacheFilename)));
}

function writeCache(data) {
    var cacheContent = getCache(cacheFilename);
    Object.assign(cacheContent, data); // shift data to cacheContent JSON object.
    fs.writeFileSync(path.join(mainDirname, cacheFilename), JSON.stringify(cacheContent));
}