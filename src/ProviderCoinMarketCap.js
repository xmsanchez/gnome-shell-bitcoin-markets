const Lang = imports.lang;

const Local = imports.misc.extensionUtils.getCurrentExtension();
const BaseProvider = Local.imports.BaseProvider;
const BaseURL = "https://pro-api.coinmarketcap.com"
//const BaseURL = "https://pro-api.coinmarketcap.com"

// Read api key
const GLib = imports.gi.GLib;
let homePath = GLib.get_current_dir()
let apikey = String(GLib.file_get_contents(homePath + "/.coinmarketcap_apikey")[1]);

var Api = new Lang.Class({
  Name: "CoinMarketCap.Api",
  Extends: BaseProvider.Api,

  apiName: "CoinMarketCap",

  apiDocs: [
    ["API Docs", "https://coinmarketcap.com/api/documentation/v1/#section/Introduction"],
  ],

  //  https://coinmarketcap.com
  //   /api/documentation/v1/#section/Standards-and-Conventions
  //  ```
  //     Free / Trial plans are limited to 330 API calls a day.
  //     Therefore, we won't update much (every 30 minutes it's ok)
  //  ```
  interval: 1800,

  // base equals to the BASE currency to fetch
  // quote is the target currency to convert base into
  getUrl({ base, quote }) {
    return `${BaseURL}/v1/cryptocurrency/quotes/latest?symbol=${base}&convert=${quote}&CMC_PRO_API_KEY=${apikey}`;
  },

  getLast(data, { base, quote }) {
    return data['data'][base]['quote'][quote]['price'];
  }
});
