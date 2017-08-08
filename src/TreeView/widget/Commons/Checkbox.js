define([
    "dojo/_base/declare",
    "dojo/_base/lang",
], function(declare, lang) {
    "use strict"

    return declare("TreeView.widget.Commons.Checkbox", null, {
        onChange: null,
        value: null,
        className: null,
        readOnly: false,

        _clickSubscription: null,

        constructor: function (args, domNode) {
            dojo.mixin(this, args);

            this.checkbox = mxui.dom.create("input", {
                type: "checkbox"
            });

            dojo.attr(this.checkbox, "checked", this.value);
            dojo.attr(this.checkbox, "readonly", this.readOnly);
            dojo.attr(this.checkbox, "disabled", this.readOnly);

            if (!this.readOnly){
                this._clickSubscription = dojo.connect(this.checkbox, "onchange", lang.hitch(this, this.change));
            }

            dojo.addClass(this.checkbox, "gv_checkbox " + this.className);

            dojo.place(this.checkbox, domNode);
        },

        change: function (e) {
            this.onChange.call(null, this.checkbox.checked);
            if (e) {
                e.stopPropagation();
            }
        },

        /* dojo get & set proxying */
        set: function () {
            return undefined;
        },

        get: function () {
            return undefined;
        },

        destroy: function () {
            if (this._clickSubscription)
                dojo.disconnect(this._clickSubscription);
        }
    });
});
