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

let _marketIndicatorView;

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

  onUpdatePriceData(priceData) {
    var length = Object.keys(priceData).length - 1
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
    if(this.options.show_change){
      symbol = _StatusToSymbol[change];
    }
    this._displayStatus(symbol);
    this._displayText(Format.format(p.value, this.options));
  },

  _displayStatus(text) {
    this.popupItemValue.label.text = text
  },

  _displayText(text) {
    this.popupItemValue.label.text = this.pair + " " + text + " " + this.popupItemValue.label.text
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

  _addSettingsLayout (){
    // Afegeix la opció "Settings"
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

  _addWidgetTitle(index, itemValue) {
    // TODO -  El primer element estarà al títol del widget
    if(index == 0){
      //this._indicatorView.text = currency_pair + ": value"
      this._indicatorView.text = "Crypto market"
    }
  },

  _initLayout(options_arr) {
    var popupItemValue = new Array(options_arr.length);
    var arr = new Array(options_arr.length)

    // Afegim el layout principal amb el títol
    const layout = this._addMainLayout();

    // Anem a buscar el llistat de currencies a consultar
    options_arr.forEach((options, i) => {
      try {
        // Afegeix la opció "Settings"
        var currency_pair = options.base + options.quote
        this.setOptions(options);
        popupItemValue = new PopupMenu.PopupMenuItem(_("Waiting for refresh"));
        popupItemValue.label.clutter_text.set_line_wrap(true);
        this.menu.addMenuItem(popupItemValue);

        this._addWidgetTitle(i, popupItemValue);

      } catch (e) {
        logError(e);
      }

      // We create a new object with all necessary data to be updated
      var obj = new indicatorViewObj(popupItemValue, options);
      arr.push(obj);
    });

    // Afegeix un separador (invisible) i el layout de les Settings
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    this._addSettingsLayout();

    // Subscribe the objects from the array to the ApiService that will do the updating
    ApiService.setSubscribers(arr);
  }
});

function init(metadata) {
  Convenience.initTranslations();
}

function enable() {
  const arrOptions = settings.get_strv(INDICATORS_KEY)
    .map(str => {
      try {
        return JSON.parse(str);
      } catch (e) {
        e.message = `Error parsing string ${str}: ${e.message}`;
        logError(e);
      }
    })
    .filter(Boolean);
  try {
    _marketIndicatorView = new MarketIndicatorView(arrOptions);    
    Main.panel.addToStatusArea(`bitcoin-market-indicator`, _marketIndicatorView);
  } catch (e) {
    logError(e);
  }
}

function disable() {
  _marketIndicatorView.destroy();
}