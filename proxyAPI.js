var axios = require("axios");
const path = require("path");
const fs = require("fs");
var isGettingAlready = false;
var isCheckingAlready = false;
var api = {
    currentGames: [],
    currentUltras: [],
    currentRammers: [], 
    checkWebsites: async function(websites, filter){
      if(!(isCheckingAlready && filter == "lightspeed")){
        if(filter == "lightspeed") isCheckingAlready = true;
        const promises = websites.map((website) => api.checkIfWebsiteBlocked(website, filter));
        try {
          const results = await Promise.all(promises);
          if(filter == "lightspeed") isCheckingAlready = false;
          return results;
        } catch (error) {
          console.log("Error checking websites:", error);
          if(filter == "lightspeed") isCheckingAlready = false;
        }
      } else{
        await api.wait(1000);
        return await api.checkWebsites(websites, filter);
      }
    },
    wait: function(ms){
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    retryAxiosRequest: async function(config, delay = 2000){
        while (true) {
            try {
              return await axios(config);
            } catch (e) {
              console.log("Error occurred, retrying in 2 seconds...", e);
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    },
    retryAxiosCustom: async function(times, config, delay = 2000){
        var i = 0; 
        while(i < times){
          try{
            var response = await axios(config);
            return response;
          } catch(e){
            i++;
          }
        }
        var response = await axios(config);
        return response;
    },
    getAllWebsites: async function(website){
        if (!isGettingAlready) {
            isGettingAlready = true;
            var data = await api.getAPI(website);
            isGettingAlready = false;
            if (data.length != 0) {
              return data;
            } else {
              console.log("Error occurred, retrying...");
              return await api.getAllWebsites(website);
            }
        } else{
          await api.wait(1000);
          return await api.getAllWebsites(website);
        }
    },
    checkIfWebsiteBlocked: async function(website, filter){
        var url = new URL(website);
        switch (filter) {
          case "lightspeed": 
        try {
          var response = await axios.post(
            "https://production-archive-proxy-api.lightspeedsystems.com/archiveproxy",
            {
              query:
                "\nquery getDeviceCategorization($itemA: CustomHostLookupInput!, $itemB: CustomHostLookupInput!){\n  a: custom_HostLookup(item: $itemA) {\n    request {\n      host\n    }\n    cat\n    action\n    source_ip\n    archive_info {\n      filter {\n        category\n        transTime\n        reason\n        isSafetyTable\n        isTLD\n      }\n      rocket {\n        category\n      }\n    }\n  }\n  b: custom_HostLookup(item: $itemB) {\n    request {\n      host\n    }\n    cat\n    action\n    source_ip\n    archive_info {\n      filter {\n        category\n        transTime\n        reason\n      }\n      rocket {\n        category\n      }\n    }\n  }\n}",
              variables: {
                itemA: {
                  hostname: url.hostname,
                  getArchive: true,
                },
                itemB: {
                  hostname: url.hostname,
                  getArchive: true,
                },
              },
            },
            {
              headers: {
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "no-cache",
                dnt: "1",
                origin: "https://archive.lightspeedsystems.com",
                pragma: "no-cache",
                priority: "u=1, i",
                "sec-ch-ua":
                  '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-site",
                "user-agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                "x-api-key": "onEkoztnFpTi3VG7XQEq6skQWN3aFm3h",
              },
            }
          );
          const category = api.categories[response.data["data"]["a"]["cat"]];
          return api.blockedCategories.includes(category);
        } catch (e) {
          if (e.message.includes("Request failed with status code 406")) {
            return true;
          } else {
            return api.checkIfWebsiteBlocked(website, filter);
          }
        }
        case "securly":
          try{
          var urlHost = url.hostname;
          var link = `https://useast-www.securly.com/crextn/broker?useremail=1726760@fcpsschools.net&reason=crextn&host=${urlHost}&url=${btoa(url)}&msg=&ver=2.97.13&cu=https://useast-www.securly.com/crextn&uf=1&cf=1&lat=34.5678910&lng=-98.7654321`;
          var response = await axios.get(link);
            if(response.data.includes("ALLOW")){
              return false;
            }
            return true;
          } catch(e){
            return api.checkIfWebsiteBlocked(website, filter);
          }
        default: 
          return false;
      }
    },
    getAPI: async function(url){
      var response = await api.retryAxiosRequest({
        method: "get",
        url: "https://getwebsiteclones.vercel.app/api?url=" + url,
      });
      return response.data.domains;
    },
    blockedCategories : [
      "porn",
      "porn.illicit",
      "security.malware",
      "security",
      "security.proxy",
      "forums",
      "games",
      "adult",
      "mature",
      "facebook",
      "suspicous",
      "warez.security",
      "security.nettools",
      "plagiarism",
      "Blocked - Student",
      "Block - Temporary Test",
      "security.domain-sharing",
    ],
    categories: JSON.parse(fs.readFileSync(path.join(__dirname, "categories.json"), 'utf8')),
}
module.exports = api;
