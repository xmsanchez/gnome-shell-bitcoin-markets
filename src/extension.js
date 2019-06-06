/*jshint moz:true */
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;

const Gettext = imports.gettext.domain("gnome-shell-extensions");
const _ = Gettext.gettext;
const N_ = (e) => e;

const Local = imports.misc.extensionUtils.getCurrentExtension();

const ApiService = Local.imports.ApiService;

const Convenience = Local.imports.convenience;

const { Format } = Local.imports;
const { Defaults } = Local.imports.IndicatorCollectionModel;


const INDICATORS_KEY = "indicators";
const FIRST_RUN_KEY = "first-run";

const DEBUG_HANDLERS = true;

// This constant holds the possible symbols that we are going to show next to the pair
const _Symbols = {
  error: "\u26A0",
  refresh: "\u27f3",
  up: "\u25b2",
  down: "\u25bc",
  unchanged: " ",
};

const _Colors = {
  error: "#ff0000",
};

const settings = Convenience.getSettings();

// This is the main layout where all indicators will be placed
let _marketIndicatorView;

// We will instantiate this object for each currency pair to hold its values
const indicatorViewObj = new Lang.Class({
  Name: "indicatorViewObj",

  _init(popupItemValue, options) {
    this.popupItemValue = popupItemValue;
    this.options = options;
    this.pair = this.options.base + this.options.quote
  },

  getChange(lastValue, newValue) {
    if (lastValue === undefined) {
      return "unchanged";
    }
    if (lastValue > newValue) {
      return "down";
    } else if (lastValue < newValue) {
      return "up";
    }
    return "unchanged";
  },

  // Show refresh symbol
  onUpdateStart() {
    this._displayStatus(_Symbols.refresh);
  },

  onUpdateError(error) {
    this._displayText("error");
    this._displayStatus(_Symbols.error);
    this._updatePopupItemLabel(error);
  },

  onClearValue() {
    this._displayStatus(_Symbols.refresh);
    this._displayText(Format.format(undefined, this.options));
    this._updatePopupItemLabel();
  },

  // When data is updated we'll display the new values and symbols
  onUpdatePriceData(priceData) {
    var length = Object.keys(priceData).length - 1

    // Check if current value has changed from prior value
    const [p, p1] = priceData;
    const change = p1
      ? this.getChange(p.value, p1.value)
      : "unchanged";

    const _StatusToSymbol = {
      up: _Symbols.up,
      down: _Symbols.down,
      unchanged: ""
    };

    let symbol = " ";
    // Show the symbol only if option is enabled for this pair
    if(this.options.show_change){
      symbol = _StatusToSymbol[change];
    }

    // Display the new values
    this._displayStatus(symbol);
    this._displayText(Format.format(p.value, this.options));
  },

  // This will set the symbol (up / down / unchanged)
  _displayStatus(text) {
    this.popupItemValue.label.text = text
  },

  // This will display the new currency value
  _displayText(text) {
    // Label = currency pair (i.e BTCUSD) + new value + change symbol
    this.popupItemValue.label.text = this.pair + " " + text + " " + this.popupItemValue.label.text

    // We show in the top bar the values of the first currency pair from the settings
    var options = _marketIndicatorView.options[0]
    var first_pair = options.base + options.quote
    if(this.pair == first_pair){
      _marketIndicatorView._indicatorView.text = this.popupItemValue.label.text
    }
  },

  _updatePopupItemLabel(err) {
    let text = this.providerLabel;
    if (err) {
      text += "\n\n" + String(err);
    }
    this.popupItemValue.label.text = text;
  },

  destroy() {
    this.popupItemValue.destroy();
    this.parent();
  }

});

// This class will hold all the indicators as well as the settings button
const MarketIndicatorView = new Lang.Class({
  Name: "MarketIndicatorView",
  Extends: PanelMenu.Button,

  _init(options) {
    this.parent(0);
    this.options = options
    this.providerLabel = "";
    this._initLayout(options);
  },

  setOptions(options) {
    try {
      this.providerLabel =
        ApiService.getProvider(options.api).getLabel(options);
    } catch (e) {
      logError(e);
      this.providerLabel = `[${options.api}]`;
      this.onUpdateError(e);
      return;
    }
  },

  // Add the main layout where all the indicators will be placed
  _addMainLayout () {
    const layout = new St.BoxLayout();
    
    this._indicatorView = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "indicator",
      text: "Crypto market"
    });

    this._statusView = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "status"
    });

    layout.add_actor(this._statusView);
    layout.add_actor(this._indicatorView);

    this.actor.add_actor(layout);

    return layout
  },

  // This will add the settings button add the end of the main layout
  _addSettingsLayout (){
    this._popupItemSettings = new PopupMenu.PopupMenuItem(_("Settings"));
    this.menu.addMenuItem(this._popupItemSettings);
    this._popupItemSettings.connect("activate", () => {
      const app_sys = Shell.AppSystem.get_default();
      const prefs = app_sys.lookup_app("gnome-shell-extension-prefs.desktop");
      if (prefs.get_state() == prefs.SHELL_APP_STATE_RUNNING) {
        prefs.activate();
      } else {
        prefs
          .get_app_info()
          .launch_uris(["extension:///" + Local.metadata.uuid], null);
      }
    });
  },

  // The title will be shown only on load
  _addWidgetTitle(index) {
    if(index == 0){
      this._indicatorView.text = "Crypto market"
    }
  },

  _initLayout(options_arr) {
    var popupItemValue = new Array(options_arr.length);
    var arr = new Array(options_arr.length)

    // We add the main layout
    const layout = this._addMainLayout();

    // Retrieve the currencies to check from the settings
    options_arr.forEach((options, i) => {
      try {
        // setOptions will add the currency pair api address to "this" (options.api)
        var currency_pair = options.base + options.quote
        this.setOptions(options);

        // This is the indicator where the value for the currency pair will be shown
        popupItemValue = new PopupMenu.PopupMenuItem(_(" "));
        popupItemValue.label.clutter_text.set_line_wrap(true);
        this.menu.addMenuItem(popupItemValue);

        this._addWidgetTitle(i);

      } catch (e) {
        logError(e);
      }

      // Instantiate a new indicatorViewObj with all necessary data for this pair
      var obj = new indicatorViewObj(popupItemValue, options);
      arr.push(obj);
    });

    // Add an invisibile separator to show before the settings button
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._addSettingsLayout();

    // All the indicatorViewObj objects get subscribed to ApiService which handles the updating
    ApiService.setSubscribers(arr);
  }
});

function init(metadata) {
  Convenience.initTranslations();
}

function getSettings() {
  var new_settings = settings.get_strv(INDICATORS_KEY)
  .map(str => {
    try {
      return JSON.parse(str);
    } catch (e) {
      e.message = `Error parsing string ${str}: ${e.message}`;
      logError(e);
    }
  })
  .filter(Boolean);
  return new_settings
}

// Create the main object, this might be called again if settings are changed
function startMarketIndicatorView() {
  log("Let's retrieve settings and create indicators")
  const arrOptions = getSettings();
  try {
    _marketIndicatorView = new MarketIndicatorView(arrOptions);    
    Main.panel.addToStatusArea(`bitcoin-market-indicator`, _marketIndicatorView);
  } catch (e) {
    logError(e);
  }
}

function enable() {
  // Create the new indicator container and its children
  startMarketIndicatorView();
  // We are going to monitor changes in settings to apply them as needed
  settings_changed = settings.connect('changed', function(){
    log("Detected changes in Settings, apply them")
    _marketIndicatorView.destroy();
    startMarketIndicatorView();
  });
}

function disable() {
  _marketIndicatorView.destroy();
}
